# T38 pg-boss worker-recovery regression investigation

Date: 2026-10-27. Branch: main. Status: root cause established; a test-only
correction is proposed, validated outside the repository, and **not applied**.
No production application code, checked-in test, migration, queue policy,
signature verification, evidence idempotency or financial gate was changed.

## Finding

The observed timeout and excess handler-count failures have a common test cause:
**the recovery case assumes that an elapsed expiration timeout plus one public
`supervise()` call guarantees reclamation, although pg-boss rate-limits queue
monitor claims. Failed cases then leave manually fetched jobs active, and later
runs count their legitimate recovery deliveries as callbacks for a different job.**

The fresh database reproduced the failure without preexisting shared data. The
first untouched full-suite run passed; immediate repeated runs timed out until a
monitor claim became due, at which point the old abandoned jobs were delivered
alongside the new target. This is a deterministic dependence on persisted monitor
claim age, with intermittent symptoms depending on timing and accumulated test
leases. It is not evidence of duplicate worker registration or duplicate financial
posting. No production-worker defect requiring an application fix was established.

## Exact implementation inspected

- `apps/api/package.json` and `pnpm-lock.yaml`: pg-boss pinned to **12.38.0**.
- Installed `apps/api/node_modules/pg-boss/package.json`: also **12.38.0**.
- Existing pinned installer verified pg-boss schema version **46**.
- `pg-boss/dist/attorney.js`: default `monitorIntervalSeconds=60` and
  `superviseIntervalSeconds=60`; configured monitor minimum is one second.
- `pg-boss/dist/boss.js`, public `supervise()` and private monitor pass:
  supervision calls `trySetQueueMonitorTime`; expiration/heartbeat recovery runs
  only for queues whose database monitor claim was acquired. Calling the method
  manually does not bypass this gate.
- `pg-boss/dist/plans.js`, `trySetQueueMonitorTime`: queue eligibility requires
  elapsed time since `monitor_claim_on` (falling back to `monitor_on`) to meet the
  caller's monitor interval. New queues with neither timestamp are immediately due.
- `plans.js`, `timedOut`/`failJobsByTimeout`: active rows expire when
  `started_on + expire_seconds` is before database job time. Expiration records
  `job timed out` and moves to retry while attempts remain.
- `plans.js`, fetch: fetching a previously started job increments `retry_count`.
  The initial manual fetch is retry 0; recovery fetch is retry 1; the next fetch
  after an intentional handler failure is retry 2.
- `manager.js`, work/processJobs: default local concurrency and batch size are one;
  callbacks are followed by broker completion/failure. The callback's business
  transaction can commit before broker completion is visible.
- `manager.js`/`worker.js`, offWork/stop: drains registered worker instances.
  A row acquired by a standalone manual fetch is not an in-flight registered
  handler and is not revoked merely by stopping the idle worker.

Installed files' resolved paths and SHA-256 hashes are retained in
`/tmp/safethrift-t38-investigation/installed-package.json`. This investigation used
installed implementation, not documentation for a different pg-boss release.

Production T38 settings in `payment-jobs.service.ts` remain: retry limit 5, delay
30 seconds, exponential backoff capped at 1800 seconds, expiration 120 seconds,
heartbeat 30 seconds, bounded retention and dead letter. Runtime schema migration
is disabled. `PaymentWorkers` registers one evidence worker (batch size 1), one
recovery worker and its existing five-minute UTC recovery schedule only after the
existing feature/configuration gate passes. No new worker registration was added.

The failing test overrides only its target job to expiration 1 second, no heartbeat,
retry limit 2, delay 0 and no backoff; worker polling is 0.5 seconds. It sleeps
1100 ms, supervises once, then waits at most 15 seconds for the business status.
The suite timeout is 30 seconds. Both are shorter than the unchanged default
60-second monitor-claim interval.

## Isolated reproduction and retained artifacts

Two new databases were created on the existing dedicated test PostgreSQL container:

- `safethrift_t38_recovery_investigation_test`: baseline and diagnostic traces.
- `safethrift_t38_recovery_candidate_test`: candidate-only validation.

Each started empty, received the repository's **existing eight application
migrations**, and received the **existing pinned `t38_jobs` installer**. Its
`t38_jobs` schema is dedicated by database isolation; these names do not introduce
an application schema/queue/migration. No shared test database, retained shared
queue, or existing business record was reset/deleted. No Redis or BullMQ was used.
New diagnostic databases and queue history are retained for review. The PostgreSQL
container was returned to its prior stopped state after investigation.

The original test ran unchanged from the repository. Diagnostic and candidate
copies ran from `/tmp`, with imports redirected to existing built application
modules and installed dependencies. Only isolated regression processes used the
existing synthetic T38 test configuration. No environment file/default/operational
worker was enabled and no live provider was contacted.

| Experiment | Result |
| --- | --- |
| Unchanged suite, first run on empty installed database | 16/16 pass |
| Unchanged suite, immediate runs 2–4 in same isolated database | Each 15 pass / 1 durable-state timeout |
| Unchanged suite, run 5 | 15 pass / 1 failure: 5 callbacks rather than 2 |
| Instrumented original timing, trace 1 after claim interval elapsed | 16/16 pass; target retries 1 and 2, one observation |
| Instrumented original timing, traces 2 and 3 | Timeout; target remains active/retry 0 with zero callbacks |
| Instrumented original timing, trace 4 after claim interval elapsed | 4 callbacks for three different job IDs; target once; one target observation |
| Initial candidate, ten sequential complete suites in separate empty installed database | 10/10 suites pass; 160 passing cases |
| Final candidate with exact job-ID/retry tuple assertion, five sequential complete suites | 5/5 suites pass; 80 passing cases |
| Additional duplicate business processing, 20 calls for each of three traced events | 60 calls; all public tables unchanged; one observation per event |
| Deliberately fail temporary candidate immediately after manual fetch | Expected 15 pass / 1 injected failure; owned job cancelled, zero evidence workers |
| Normal full suite immediately after injected failure, same candidate database | 16/16 pass without reset |

These repetitions establish the defect and validate the candidate; they do not
prove all possible operational load, failure or concurrency schedules. Raw logs
and traces are retained at `/tmp/safethrift-t38-investigation/`, including
`baseline-1.log` through `baseline-5.log`, `original-trace-1.jsonl` through
`original-trace-4.jsonl`, candidate/identity logs, `run-summary.json` and
`duplicate-effects.json`. An initial diagnostic-only SQL column-name mistake was
corrected; that discarded run is not counted as a reproduction or pass.

## Job-by-job evidence (UTC)

Successful target `db78f0f3-e57a-45c3-b8a3-59fa7b421a4b`, queue `t38-evidence`:

| Time | State/effect |
| --- | --- |
| 09:56:20.714891 | Manually fetched: active, retry 0, expire 1 second, heartbeat null |
| 09:56:21.831403 | Monitor claim acquired; expiration changes job to retry 0, output `job timed out` |
| 09:56:21.878494 | Worker fetch: active, retry 1; callback deliberately throws; no observation |
| By 09:56:21.933 | Retry 1; stored failure is `fixture transient failure` |
| 09:56:22.378795 | Worker fetch: active, retry 2 |
| By 09:56:22.442 | Business event quarantined and one observation committed; job still active |
| 09:56:22.445515 | Broker job completed, retry 2 |
| 09:56:22.502 | Worker stopped/drained; one observation |

Immediate next target `fabb3d5b-f492-4cb7-8242-6e2fcd997f36`:

- Manually fetched at 09:56:25.695748, active/retry 0.
- At 09:56:26.815, more than one-second expiration has elapsed.
- `supervise()` returns at 09:56:26.871; `monitor_claim_on` remains
  09:56:21.831403, less than 60 seconds old. Job stays active/retry 0.
- At 09:56:41.900 the 15-second business wait fails: **zero callbacks and zero
  observations**, not an excess retry of this target.
- At 09:56:41.913 the idle worker has stopped, but the manually acquired lease
  remains active. The old test has no target-specific failure cleanup.

Later trace 4, current target `bb03559a-b61e-41ba-a91a-b1207f689fbf`, one registered
worker `604af3fc-48b0-4ecd-9ee4-a0da098afb6f`:

| Callback | Time | Delivered job | Retry | Meaning |
| --- | --- | --- | --- | --- |
| 1 | 10:02:41.991 | `fabb3d5b-f492-4cb7-8242-6e2fcd997f36` | 1 | Previously abandoned target; consumes the test's global first-call failure injection |
| 2 | 10:02:42.477 | Same old job | 2 | Expected retry after that injected failure |
| 3 | 10:02:42.977 | `e077eec7-59c9-4afb-a34d-4ef3bd2682e9` | 1 | Another previously abandoned job, not a third attempt of the current target |
| 4 | 10:02:43.484 | `bb03559a-b61e-41ba-a91a-b1207f689fbf` | 1 | Current target's only callback |

Current target completes at 10:02:43.517100, with one observation. The exact-count
assertion sees 4 rather than 2. Trace shows exactly one evidence worker before
callbacks, and none after stop; no duplicate worker registration is involved.

The test's earlier cleanup cancels only created/retry jobs. It cannot remove the
active manual leases that have not yet passed a monitor sweep. It may process
those events' business evidence separately, but their broker rows remain active.
When a later sweep reclaims them, their normal deliveries enter the same worker
and inflate the queue-wide count. The injected first-call failure can therefore
hit an old event instead of exercising the intended target's failure/retry path.

The suite-wide after-hook also checks its whole-public-database snapshot before
resource/fixture cleanup. Concurrent unrelated suites can make that assertion fail
and prevent cleanup, as seen in the preceding preservation turn. That is an
additional reason to keep whole-database preservation suites isolated/sequential;
it is not necessary to reproduce the fresh-database monitor-claim defect above.
The minimal patch addresses the recovery test's own lease lifecycle, rather than
refactoring the entire suite teardown.

## Business effects and production interpretation

Evidence processing locks the event row in a Serializable transaction and returns
without inserting when status is no longer queued. Observation has a unique event
key and scoped foreign-key constraints. Existing tests cover concurrent signed
delivery, concurrent process calls and repeat processing after queue deletion.

A separate diagnostic reprocessed all three trace-4 events 20 times each, in
concurrent groups, with no worker started. All three remained quarantined with
exactly one observation. Every public table before/after serialized identically:
SHA-256 `24a5b0b8058f488b2a3f048fc6546fe1904fee5f4d8f8f034015ff1a4cce0d0b`.
This includes business/financial and evidence tables; duplicate processing did not
add evidence, loans, repayments, ledger-like amounts or other business records.
The candidate suites also retain the original non-T38 whole-database invariant.

Classification:

- Expected retry: yes, the same old job's retry 2 follows the deliberate error.
- Recovered abandoned job: yes, the excess callbacks are other job identities.
- Residual test data: yes, produced by prior failing manual-lease cases even from
  an initially clean database; shared application data is not required.
- Duplicate worker registration: ruled out in the recorded trace.
- Teardown weakness: the idle worker is drained, but the test-owned manual lease
  is not cancelled on failure. This contributes to later contamination.
- Production defect: none established. The production monitor gate is expected
  behavior, and real abandoned jobs may be redelivered. Safety depends on durable
  event idempotency, not a globally exact callback count. This investigation does
  not authorize live payment or settlement behavior or claim exactly-once delivery.

A separate observation is a test wait weakness: quarantined evidence can be visible
before broker completion. The proposed test waits for both, rather than assuming
that business commit acknowledges the broker job. Trace demonstrated that ordering;
it was not the primary observed timeout cause.

## Proposed minimal correction — NOT APPLIED

Only intended repository target:
`apps/api/test/payment-webhooks.integration.test.mjs` — one import and the named
recovery case. The ready-to-review unified diff is
`/tmp/safethrift-t38-investigation/proposed-test-only.patch` (two hunks).
`git apply --check` succeeds; the patch has **not** been applied or staged.
The candidate source is `/tmp/safethrift-t38-investigation/proposed-source.mjs`.

The patch:

1. Creates a **test-local manual PgBoss monitor** using the same existing schema,
   migration disabled, automatic supervision/scheduling disabled, and the supported
   minimum one-second monitor interval. It registers no extra evidence worker or
   queue. Production monitor/expiry/heartbeat/backoff settings remain unchanged.
2. Asserts the job override affected exactly one target and its initial fetch is
   retry 0. Replaces the fixed sleep with a bounded wait that calls the manual
   monitor and verifies the target actually became retry 0 before registering work.
3. Records **every** delivery's job ID/retry count. After completion it requires
   exactly `[{id: target, retryCount: 1}, {id: target, retryCount: 2}]` and one
   observation. Unexpected IDs are not filtered out or counted as success.
4. Waits for broker completed state **and** quarantined business status, then
   drains the owned worker before checking counts.
5. Uses finally to stop its worker/manual monitor and cancel only its own target
   if it is still created/retry/active. It preserves terminal history and does not
   delete/reset any queue or clean someone else's active job.

Failure containment was exercised outside the repository: target
`c46fd67c-9276-43b3-94dc-88b52d174505` was cancelled at retry 0 after an injected
failure immediately after manual fetch, and evidence-worker count was zero. The
next normal full suite passed 16/16 in the same database without resets. This
supports the cleanup change; the one deliberate failure is not reported as a pass.
The cleanup artifact is `forced-cleanup.json`, with its log and the passing
`after-forced-cleanup.log` alongside the other diagnostics.

The exact-count invariant is strengthened by identity/attempt evidence, not relaxed
to `>= 2`. No wait deadline is increased to hide the claim interval. No production
configuration, signature check, evidence constraint, financial gate, worker module,
queue schema or job library is changed. No T36 refactor is proposed.

This fixes repeatability from a clean dedicated T38 test database and contains its
own failures. It is not a blanket promise to clean a previously contaminated shared
queue: run against a dedicated test database/schema and retain unknown prior jobs.
Future CI/regression runs must not overlap T36 or financial fixture suites against
the same database while whole-database preservation snapshots are active.

## Required approval and verification

Before applying: review/approve the exact two-hunk test-only patch. No production
patch is proposed or authorized.

After approval:

- Apply only the named test patch; run its lint/syntax checks and the full original
  T38 suite against a fresh isolated database using existing installers.
- Repeat the full suite sequentially at least ten times without resets. Require
  exact target IDs/retry counts, completed broker state, one observation, and all
  non-T38 rows unchanged on every run.
- Inject failure after the manual fetch and verify its target is cancelled and
  workers drained; immediately repeat normally without reset to prove containment.
- Keep signed webhook tampering/replay/scope tests, transaction rollback,
  evidence idempotency, retry exhaustion/dead-letter and shutdown checks intact.
- Run T36 regression separately, plus T37/T42 API and accepted T40/T41 browser/
  production preservation checks as appropriate. No live provider activation.
- On any failure, retain job/event IDs, queue claim time and full metadata; do not
  reset retained shared queues or relax counts to manufacture green results.

## T42 preservation recommendation

The T42 restricted foundation and its HTTP no-write proofs are unchanged. The
previous unexplained T38 blocker now has a reproduced test-only cause and an
unapplied candidate that passes repeated isolated validation. **Do not yet mark
the checked-in T38 regression fixed or issue unconditional final sign-off.**
After approval, apply the one-file test patch and obtain the required repository
regression passes; then the worker-recovery test blocker can be removed without
altering T42's restrictions. Loan submission/repayment remain disabled; durable
successful repayment replay and full T42 functional completion remain pending.

Only investigation documentation/T42 recommendation is updated in the repository.
Diagnostic scripts/logs and proposed patch stay under `/tmp`. No commit, push,
deployment, shared database reset, retained queue deletion or application activation.
Normal fixture-job lifecycle operations occurred only in the two new diagnostic
databases. Node runtime during reproduction was v22.21.1.

## 2026-10-29 — revised patch applied; first verification failed (supersedes pending-application status)

The newly reconstructed reviewed artifact
`docs/test-artifacts/t38-recovery-candidate-2026-10-29/candidate.patch` was applied
exactly on `main`. It is not the recovered original investigation patch.
Pre-application target SHA-256 was
`6c7b27c89817b7919afa4bb76cdfb7a378c408c99c44231756ff37d82a29ecd5`.
`git apply --check` passed and patch inventory named only
`apps/api/test/payment-webhooks.integration.test.mjs` (167 insertions, 46 deletions).
The full resulting diff was inspected; native syntax and Git whitespace checks passed.
The patch artifact remains an intentional review artifact, not a second patch to apply.

A newly created database, `safethrift_t38_recovery_verified_20261029_test`, on the
existing dedicated `safethrift-t37-postgres` container (local port 55437) received
all eight existing application migrations and the existing pinned pg-boss installer.
Installer verified pg-boss 12.38.0 schema version 46. No migration was introduced.
Before the suite, session inspection found only the inspection session. No other
suite was launched against this database. An initial sandbox-blocked migration
connection was rerun with approved local network access and succeeded.

| Newly applied revision verification | Actual result |
| --- | --- |
| Full T38 run 1 | FAIL: 15 pass, 1 fail, 16 cases; process exit 1; 8721.254222 ms |
| Full T38 runs 2–5 | Not run: mandatory stop after first failure |
| Deliberate failure after manual fetch | Not run: stop condition |
| Immediate normal suite after deliberate failure | Not run |
| API build | Pass |
| Frontend TypeScript check | Pass |
| T36/T42/T37/T40/T41 regressions, relevant lint and frontend production checks | Not run after stop condition; historical results do not verify this revision |

Failure: recovery case at line 596 asserts
`Refusing recovery with unknown nonterminal jobs; retain them for review`.
Ownership is registered only by `receiveStripe`/`receiveGc`; earlier accepted intake
through the HTTP test bypasses both helpers. That earlier fixture is consequently
outside the ownership set even in this freshly provisioned database. Its retained
job is `efb2af73-feac-4246-8265-e8972ff79a56`, event
`10dce641-94bd-44ff-838e-357eec65fe00`, provider event
`evt_70711494-7858-46a1-bfbb-0b91e93aeb53`. Source inspection confirms additional
direct service intake also bypasses the helpers; not every such path necessarily
leaves a nonterminal job at this guard. No follow-up test change, ownership bypass,
assertion relaxation, queue reset or production fix was made.

The Node runner completed its remaining checked-in cases and teardown before exiting;
no further suite was launched. Later existing cases cancel earlier fixture jobs,
so final terminal state alone does not identify precisely when each was cancelled.
After exit: zero active broker leases; zero other database sessions; no cleanup
error/timeout diagnostic in the log. Two complete job-row snapshots two seconds
apart matched MD5 `33898a7594200a5044ee295d51dc976e`. The process exit and absent
sessions establish no surviving worker/monitor in that process; this is not a
runtime registry assertion inside the recovery case. The guard failed before
manual fetch, monitor start or recovery-worker registration, so exact successful
target retries, one durable recovery observation and failure-after-fetch cleanup
remain UNVERIFIED. The passed whole-public-database preservation hook found no
change to non-T38 business/financial rows. Synthetic evidence intake alone ran;
no live provider or operational financial execution was activated.

Raw suite output is `/tmp/safethrift-t38-verification-20261029/run-1.log`.
Unlike the patch artifact, `/tmp` logs are transient. The isolated database is
retained for review; no existing shared database or queue was reset.
An initial read-only diagnostic used incorrect snake-case event column names;
it failed without mutation and was corrected to the actual quoted Prisma columns.

CI inspection: the existing workflow provisions `safethrift_test`, installs both
job schemas there and runs T38 with that generic database URL. The new guard
intentionally rejects it. Minimal proposal, requiring further approval: create
`safethrift_t38_recovery_ci_test` in a separate CI step; apply existing application
migrations and `payments:jobs:migrate` using its URL; run T38 using that URL only;
reserve it exclusively for the T38 step. Leave other suites on their own database
and do not overlap whole-database tests. No workflow edit was made in this turn;
the working tree already contained T42 CI edits before patch application.

Final bounded inventory review: 32 changed/untracked files, including the existing
T42 work and approved patch artifact. No private-key/AWS/GitHub/live-Stripe pattern
findings or generated/log/env artifacts were found. API build output and logs are
not in that inventory. `git diff --check` and cached whitespace check passed; index
is empty. No production worker/queue source or Prisma migration differs from HEAD.
T38 remains default-disabled in configuration; only the isolated synthetic test
process enables evidence intake. T42 execution methods retain explicit denial.
No commit, push or deployment occurred.

Preservation recommendation: NOT ready for unconditional Git preservation sign-off.
The applied revision has a reproduced test-ownership blocker. Review a further
minimal ownership correction before any additional application; do not weaken the
guard or reuse historical candidate passes as current verification. T42 remains
restricted technical foundation implemented; financial execution disabled; durable
successful repayment replay pending; full functional completion pending.
