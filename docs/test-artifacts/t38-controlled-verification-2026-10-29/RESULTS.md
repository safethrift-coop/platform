# T38 controlled verification — STOPPED at preservation setup blocker

Date: 2026-10-29. Branch main. HEAD f75c4515e7f54d228354b87439e3adbd518c740a.
Approved replacement applied exactly to the checked-in test. No commit/push/deploy.

## Patch evidence

- Starting target SHA-256: 4e9da7737e7bd3367dc340ec71595e42b1a3c5ad23ccb06a5e7883e091432a20
- Approved patch SHA-256: 90231e3d25ae40a4375d4f9c38bbc7399642e01b5b10ed867a672101dd4aba27
- Result target SHA-256: 9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a
- Preflight main/index/scope/history checks passed. Only preexisting untracked files
  were the replacement candidate and its review. git apply --check with strict
  whitespace passed; exact application, Node syntax and git diff --check passed.
- API build before execution passed (exit 0). No target adjustments after application.
- Production source, migrations, CI and historical artifacts unchanged.

## Isolation

New UTF8 PostgreSQL 16.15 cluster at /tmp/safethrift-t38-approved-verification-pg,
localhost:55439. New normal database safethrift_t38_recovery_approved_20261029_test.
Existing eight application migrations deployed. Pinned payment installer verified
pg-boss 12.38.0/schema 46. Preflight: no jobs or other client sessions. The exclusive
instance and dedicated name meet local guards. No existing database reset/reuse.
Four separate negative databases and a separate preservation database were created.
Redis for preservation was an isolated redis:7-alpine container on localhost:56442.

## Five complete normal suites on the SAME database, without resets

| Run | Pass / fail | TAP seconds | Command wall seconds | Recovery event ID | Recovery job ID |
|---|---|---|---|---|---|
| 1 | 16 / 0 | 9.375 | 10.662 | 0f0614d8-95ba-46f7-9f26-76beacb84a4e | a4faf203-f600-4ebc-aa07-e8e2b6f83f8d |
| 2 | 16 / 0 | 8.114 | 9.335 | e81bfc60-cd27-48a4-bda6-222d7278db3b | 7bd51160-709f-41f4-ac53-4361476f54ed |
| 3 | 16 / 0 | 8.005 | 9.389 | f823540b-fe2b-4f88-b345-d63c8b08c63b | 7410e63d-5106-4608-9cef-b66ce08dba20 |
| 4 | 16 / 0 | 8.925 | 10.265 | db8af901-0e56-46e9-8ee8-902624639c5c | f1e5a5f4-731b-4c61-9a17-b4d8cb822396 |
| 5 | 16 / 0 | 12.558 | 14.237 | 3e8c0bda-34ef-474e-9eb0-26569bc73fd4 | e3c4ab9b-d261-4018-aecd-ebe8348b2b4b |

All five exited 0; 80 tests passed, zero failed. Exact checked-in assertions prove
delivery retry sequence [1,2], completed broker, quarantined business state and one
observation. Each post-exit SQL check independently confirmed completed/quarantined,
retry_count 2 and observation count 1. The retry delivery arrays are assertion
results, not an independently instrumented callback trace. See run-N JSON/TAP.

Every run: zero evidence jobs in created/retry/active; zero other database client
sessions; no cleanup errors; full suite and non-T38 preservation hooks passed.
One-second delayed SQL snapshots exactly matched post-exit state. Node process exit
plus no DB sessions provides shutdown evidence; no claim of formal proof against
arbitrary external callbacks is made. Unknown-job checks ran on each afterEach;
explicit rejection diagnostics are separately recorded below. Cancellation TAP
lists exact owned IDs; cancellation-state assertions passed.

After run 5: evidence queue completed=5, cancelled=65, failed=5, nonterminal=0.
Dead-letter queue created=5 is expected retained exhaustion evidence, not an active
evidence-queue lease. No queue-wide cancellation/reset was performed.

## Negative isolation diagnostics

Temporary source copies selected only the recovery test, excluding later cases.
Each new DB used existing migrations and pinned installer. All returned expected
nonzero test exits; harness verified expected rejection, unchanged diagnostic job
state/data/retry count and zero remaining sessions. These are expected negative
checks, not complete-suite passes. See negative-*.json and .log.txt.

- unknown: inserted unrelated created broker job; rejected before fixture preparation;
  unrelated job remained created with identical payload/retry count. No cancellation.
- scope: altered only test ownership-map accountScope; persisted job was not adopted;
  rejection and unchanged created job. Full normal suites also pass DB-boundary
  cross-scope observation rejection. This diagnostic does not simulate every possible
  provider/configuration transition.
- payload: changed job.data.eventId in the isolated diagnostic; relationship rejected;
  mismatched created broker job preserved unchanged after rejection.
- active: manually leased owned target before fixture preparation; active lease rejected;
  recovery finally reported active target and cleanup error; target stayed active with
  retry_count 0. No cancellation/recovery/forced expiry. Database retained separately.

## Sequential preservation regressions and first blocker

- T36 reminder delivery: PASS, 16 tests, 2 suites.
- API units (including restricted-loan security): PASS, 46 tests, 8 suites.
- T37 auth-security integration: PASS, 10 tests.
- T40 registration integration: PASS, 11 tests.
- T41 dashboard integration: PASS, 8 tests.
- T42 loans integration: FAILED, 5 passed / 1 failed.

T42 failure is a verification-setup omission: the separate preservation database
has t36_jobs.job but lacks t38_jobs.job. The preservation snapshot at
apps/api/test/loans.integration.e2e-spec.ts:552 fails PostgreSQL 42P01 before it can
compare payment jobs. The regression harness installed only the reminder jobs
schema. This result does not establish an application regression or preservation
success. No schema repair, retry or further tests were performed after this blocker.

The following remain NOT RUN: deliberate failure immediately after recovery manual
fetch; subsequent-body blocking runtime proof for that diagnostic; post-regression
API build; web tests/typecheck/lint/production build/output checks. The earlier API
build did pass. The active-preparation negative case is NOT a substitute for the
requested after-fetch diagnostic.

Regression/negative checks were ordered before the deliberate-fetch diagnostic to
keep independent checks separate from its expected retained active lease. Stop at
the first actual regression failure prevented reaching that diagnostic.

## Lifecycle, preserved resources and recommendation

Final read-only cluster inspection found zero client sessions. Temporary Redis and
PostgreSQL were stopped successfully; PostgreSQL data directory and all six DBs
remain on disk. Expected active negative evidence was never cancelled or forcibly
expired. No normal suite ran on a contaminated diagnostic DB.

Normal-run cleanup and negative guards have strong passing evidence, but the full
acceptance procedure is INCOMPLETE. T38 technical completion and T42 preservation
readiness are NOT verified. Next decision: authorize repair of isolated preservation
setup by installing the existing pinned payment-job schema (no new migration or
production change), rerun the failed preservation suite and remaining regressions,
then perform the deliberate-fetch failure diagnostic under its stop rules. Do not
silently revise the approved test or patch.

Raw .log files are ignored by repository policy; identical .log.txt copies preserve
reviewable evidence. Executed orchestration scripts are retained for reproducibility.
MANIFEST.json lists all files in this artifact directory except itself with hashes,
including ignored raw logs. WORKING-TREE.txt records exact tracked/untracked status.


## 2026-10-29 continuation update

The preservation schema omission has been resolved in an explicitly fresh isolated
environment. T42 now passes all 6 tests; API build/types/relevant lint and web
types/lint/production build pass. Verification stopped at T40 browser fixture
startup because the continuation harness omitted T40_TEST_DATABASE_URL. T41/T42
browser checks and the after-fetch diagnostic remain unrun. See
[continuation results](continuation/RESULTS.md) for exact scope, evidence and final
resource state. Earlier sections remain the historical first-attempt record.


## Final verification accepted checks — 2026-10-29

The authorized corrected harness completed T40, T41 and T42 browser scripts
sequentially, all exit 0, with clean fixture state/sessions/processes after each.
The separate after-fetch diagnostic returned expected exit 1 and all 16 diagnostic
checks passed: original error retained, active lease diagnosed/retained, three
subsequent bodies blocked, independent cleanup attempts, unrelated job retained,
zero sessions. Final normal databases contain no jobs; diagnostic lease remains
isolated. Temporary PostgreSQL/Redis stopped. The previously outstanding local
acceptance checks are now satisfied. See [final verification report](final-verification/RESULTS.md) for
exact evidence, scope and limitations. Historical failures above remain retained.
