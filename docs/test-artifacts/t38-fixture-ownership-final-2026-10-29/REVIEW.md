# T38 final ownership/lifecycle candidate — NOT APPLIED

Branch: `main`. Date: 2026-10-29. Target:
`apps/api/test/payment-webhooks.integration.test.mjs`.
Baseline SHA-256:
`c3678cf0f7f01741951cbc9ce952c406e7c6d6f376e32efa967f8236e18ae60a`.

This seven-hunk candidate supersedes the proposed three-hunk ownership correction
in `../t38-fixture-ownership-2026-10-29/`. That earlier artifact and its complete
16-case intake audit remain intact. Apply neither artifact without approval;
this one is the complete replacement diff against the unchanged current target,
not an incremental patch on top of the earlier proposal.

## 1. Unsupported GoCardless events really are persisted

Inspected actual repository policy/service and the batch integration case:

- `payment-webhook.policy.ts` maps all verified provider events to normalized
  records; unsupported resource/action types carry `supported: false` and are
  not filtered out of the returned batch.
- `PaymentWebhooksService.receive` inserts every normalized event inside the same
  transaction. Unsupported events receive `status: ignored`, reason
  `unsupported_event`, `jobId: null`, and a processed timestamp. Only supported
  newly inserted events are enqueued. Duplicate composite identities reuse their
  persisted event row; their delivery includes that ID.
- The existing batch fixture supplies payment, mandate, duplicate payment and
  unsupported `customers.created`, and already requires the customer event row
  to exist with ignored status.

The wrapper therefore retains strict composite-key `findUniqueOrThrow` for every
successfully accepted distinct input identity, supported or ignored. It does NOT
require a job for an ignored event. No missing-supported-event fallback or catch
is added. The batch case now additionally requires the ignored reason and null
jobId. If an intentionally omitted event policy is introduced in future, that
would change the current documented service/test contract and require review;
it is not the behavior of the implementation inspected here.

## 2. Revised ownership and targeted preparation

As in the previous proposal, wrap only the suite-owned service instance before
HTTP controller injection. Await bound original receive first, then resolve each
acknowledged identity by provider/environment/accountScope/providerEventId and
register its persisted primary ID. Rejections/rolled-back intake do not register.
No production class/prototype, transaction, signature check or enqueue is replaced.

A shared `ownedPendingFixtures` helper:

1. Resolves complete registered identities again, including their current job IDs.
2. Reads nonterminal evidence-queue jobs.
3. Requires BOTH current `event.jobId === job.id` and
   `event.id === job.data.eventId` for every pending job.
4. Rejects every active lease, even an owned one. Diagnostic failures include
   job ID, event ID, state and retry count, never signatures or provider bodies.

`prepareOwnedFixtures(target)` uses this guarded result to process only registered
sibling events and cancel exact registered sibling job IDs in created/retry.
It preserves the current target. It does not issue queue-wide cancellation.
Both recovery and exhaustion preparation now call it.

## 3. Original repeated-suite criterion retained

The three-hunk proposal left a genuine gap: cases after recovery can leave
created/retry jobs, notably the fail-closed fixture. The last Nest context can
process some, but startup/drain timing is not a guarantee that all queued fixtures
are consumed. A new process must NOT adopt those prior-run jobs.

This candidate adds the narrowly scoped missing lifecycle step to the existing
afterEach hook. After the existing worker drain, it invokes the same ownership and
active-lease checks. Only when every pending evidence job is proven owned and none
is active does it cancel remaining exact created/retry job IDs. Each cancellation
is diagnosed and followed by an explicit cancelled-state assertion.

Consequences:

- No foreign/prior-process job is adopted or cancelled.
- No active manual lease is concealed by the hook. An active lease fails the hook
  and preserves its row for inspection. The recovery case's own reviewed finally
  still performs its explicit target cleanup; its implementation is unchanged.
- Completed, failed and cancelled rows, observations and event history are retained.
  No database reset, job deletion or shared-queue flush is added.
- Cancelling an ordinary owned queued fixture does not falsely claim successful
  evidence processing. Its event may remain queued; existing recovery can later
  classify the retained cancelled job as exhausted/review without creating a new job.
- Cancellation rejection or a non-cancelled post-state fails the hook; it is not
  swallowed. Remaining rows are evidence, and another verification run must not start.

Therefore the runtime proposal remains **five complete suites on one new dedicated
database, without resets between runs**. No substitution with five fresh databases
is made. This remains an unverified design until runtime checks pass.

If same-database runs still fail, retain the database/logs and stop. Fresh-database
runs may then be proposed separately as diagnostic repeatability evidence; they
cannot be reported as satisfying the original same-database lifecycle criterion.

## 4. Exhaustion-test safety finding

The old exhaustion loop read every created/retry job in the evidence queue and
cancelled every ID except its target, without ownership proof. It could cancel
unrelated jobs, including after the earlier recovery guard failed.

The candidate replaces that unscoped event query and cancellation loop with the
shared ownership-checked preparation. Unknown jobs or any active lease fail before
sibling processing/cancellation/manual fetch. Only exact acknowledged suite-fixture
IDs can be cancelled. The exhaustion target's explicit manual fetch/fail, retryLimit
0, failed state, review state and dead-letter assertions remain unchanged.

If exhaustion fails after manual fetch but before its explicit fail, the hook now
rejects the remaining active lease rather than cancelling it. That leak remains
visible and blocks further runs. No new finally that could obscure it is introduced.

## 5. Recovery contract and limits

Literal comparison confirms these portions of the recovery case are unchanged:
- Dedicated recovery database-name guard, plus existing local-host/NODE_ENV guard.
- Manual monitor options, including test-local one-second monitor interval.
- Target update/initial lease assertions, retry transition and bounded waits.
- Exact delivery IDs and retry sequence 1/2, persisted retry count 2.
- Broker completed AND business quarantined condition; one observation.
- Worker-specific draining, original failure rethrow, independent finally attempts
  and aggregate cleanup-error behavior.

No worker, monitor, schedule or timeout is added/changed. Existing 180s suite,
90s recovery case, 15s polling windows and 5s recovery cleanup budgets remain.
New post-intake reads and hook cancellation/verification calls are ordinary awaited
DB/broker operations; their underlying stall risks remain. No new timeout wrapper
is presented as operation cancellation. If a hook operation fails, its sequential
loop can leave other fixtures pending; retain them and stop instead of retrying or
clearing them automatically.

Exclusive database reservation is still necessary. The guard is a point-in-time
check, not protection from uncooperative concurrent writers. The existing service
recover scans and final Nest context can touch queued events; negative diagnostics
must select only the recovery/exhaustion case and avoid the final lifecycle context.
The suite-wide after hook still checks its business snapshot before resource cleanup;
that preexisting cleanup-order limitation is outside this candidate.

The observer assumes stable scope configuration during each receive call. If its
post-commit read fails, the fixture fails even though original intake may have
committed; no rollback is inferred from that instrumentation error.

## 6. Static verification

- Complete seven-hunk unified diff inspected: exactly one test target.
- `git apply --check --whitespace=error-all`: PASS on a clean temporary copy of
  the current target and on the untouched working-tree target.
- `node --check` of proposed source: PASS.
- Git tracked/staged whitespace checks and new artifact whitespace: PASS.
- Target SHA-256 unchanged; all preexisting tracked diffs unchanged.
- No production source, migration, queue configuration or financial policy changed.
- No database/server/worker or integration suite started in this turn.
- No runtime pass claimed. No patch applied, staging, commit, push or deployment.

## 7. Runtime verification after approval

1. Confirm baseline/patch, apply only the approved test correction, build API and
   run relevant syntax/lint checks. Create one new, exclusively reserved local
   `safethrift_t38_recovery_*test` database; use existing migrations and pinned
   pg-boss 12.38.0/schema 46 installer. Do not reuse/reset retained failure databases.
2. Run five consecutive complete checked-in suites on that same database, without
   resets. After each run, retain exit/TAP diagnostics, target event/job and retry
   trace, completed/quarantined state, exactly one observation and unchanged
   non-T38 public-state snapshot. Inspect all evidence jobs for zero created/retry/
   active residue and inspect runtime/process/session teardown. Known recovery/dead
   queues have separate purposes and must not be silently adopted as evidence jobs.
3. Establish no cleanup-error/timeout diagnostics, no test-owned workers/monitor,
   no abandoned active leases or post-teardown callbacks. Any failed hook or
   unexpected job stops the sequence; preserve records before further diagnosis.
4. In a temporary diagnostic source, inject failure immediately after the target
   manual fetch. Require expected injected failure, target cancellation through
   original finally, drained worker/monitor and no active residue. Run a complete
   normal suite immediately afterward on the SAME database, without reset.
5. In separate isolated diagnostic databases, select only recovery or exhaustion
   to seed unrelated created jobs, cross-scope IDs, mismatched payload relationships
   and owned active leases. Require explicit rejection, unchanged unrelated records,
   and preserved active-lease evidence. Confirm the final Nest lifecycle case is
   excluded. Also inspect successful ignored events as ignored/null-job and verify
   rejected/rollback inputs never gain registry ownership.

No acceptance criterion has been silently relaxed. No operational financial or
external provider behavior is enabled by these proposed isolated evidence tests.
