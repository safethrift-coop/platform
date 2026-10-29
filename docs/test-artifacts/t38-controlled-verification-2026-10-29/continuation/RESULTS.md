# T38/T42 continuation — stopped at first browser setup failure

Date: 2026-10-29. Branch main. No commit, push or deployment.

The approved payment-webhook test remains SHA-256
`9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a`.
The index is empty. Production code, migrations and test assertions were not changed.
All 71 files listed in the earlier MANIFEST.json matched their recorded hashes before
this report was appended. Five prior T38 suites and SQL evidence, and earlier passing
T36/T37/API-unit/T40/T41 evidence, remain retained; those suites were not rerun.

## Fresh preservation environment and provisioning

The original `/tmp/safethrift-t38-approved-verification-pg` directory was absent.
Used the explicitly authorized fresh-environment fallback: PostgreSQL 16.15 cluster
`/tmp/safethrift-t38-continuation-pg`, bound to 127.0.0.1:55439, and dedicated database
`safethrift_preservation_continuation_20261029_test`. No production database was
used. Applied all eight existing application migrations successfully; no migration
was created. Initial identity SQL recorded the exact database, port, migration count
and absent job schemas. Existing `jobs:migrate` and `payments:jobs:migrate` installers
provisioned T36 and T38, respectively. Both verified pinned pg-boss 12.38.0/schema 46.
T36 relation inventory, schema version and zero job count matched exactly before
and after payment installation. See identity, t36-before/after, provisioned and
installer evidence in this directory. Redis was a new isolated redis:7-alpine
container `safethrift-t38-continuation-redis` on 127.0.0.1:56442.

The tool server restarted after provisioning and before a recorded T42 result.
Read-only recovery inspection found no remaining harness/test process or database
session. Resumed at T42 without repeating provisioning; `verify.py --resume`
records that path. Migration output was captured in the conversation; identity SQL
independently records eight applied migrations. Initdb/start commands and the
sandbox networking escalation are also in the conversation.

## Sequential results

| Check | Result |
|---|---|
| Complete T42 loan integration | PASS — 6/6 tests, 1 suite, exit 0 |
| API build | PASS |
| API TypeScript (`tsc --noEmit`) | PASS |
| Relevant API ESLint (loan integration test, without --fix) | PASS |
| Web TypeScript | PASS |
| Web ESLint | PASS |
| Web production build | PASS — 18/18 pages generated |
| T40 registration browser | FAIL — fixture startup, before browser assertions |
| T41 dashboard browser | NOT RUN — stop rule |
| T42 loans browser | NOT RUN — stop rule |
| Deliberate failure immediately after recovery manual fetch | NOT RUN — stop rule |

T42's unchanged assertions passed JWT/member isolation, malformed child ownership,
cursors, Staff/Admin read boundaries, denied decisions, legacy replay and concurrent
write denial. Restricted application/repayment HTTP requests returned 403; plausible
disbursement routes returned 404. The repeatable-read preservation assertion passed
for financial/approval/audit rows and complete T36/T38 broker job rows. No financial
execution was activated and no synthetic disbursement or repayment was enabled.
This is restricted-foundation evidence, not functional financial execution approval.

## First blocker and unfulfilled diagnostic conditions

The continuation harness supplied T42_TEST_DATABASE_URL but omitted
T40_TEST_DATABASE_URL. The T40 fixture at
`apps/api/test/fixtures/t40-browser-server.mjs:21` rejected the missing explicit
local test services. This was a harness omission, not a browser assertion or
application failure. Command exited 1. See browser-registration.log.txt and JSON.
No retry or subsequent acceptance check was run, per the user's stop-on-failure
instruction. The harness is preserved as executed, including the omission.

No after-fetch diagnostic database was created, and no after-fetch injection was
executed. Therefore original injected failure reporting, retained active lease,
cleanup-latch runtime blocking, worker/monitor shutdown and unrelated-job preservation
for that specific diagnostic remain UNVERIFIED. Earlier negative-active evidence
is retained but is not a substitute. No active diagnostic lease was cancelled,
expired, reset or recovered in this continuation.

## Final resources and limitations

Immediate and delayed SQL snapshots three seconds apart were identical: zero other
sessions, T36 jobs=0, T38 jobs=0, members=0, loans=0, repayments=0. No continuing
callbacks were observed through database changes during this bounded window; this
is not proof against arbitrary external activity. Dedicated process inventory found
only the temporary PostgreSQL process, no verification browser/fixture/Next server.
Redis stopped successfully (inspect: exited); PostgreSQL stopped successfully and
server log records shutdown. Data directory and fresh preservation database remain
retained. No new diagnostic database exists. Earlier diagnostic database *evidence*
remains in the parent directory; original cluster files were unavailable here.
See final-resource-state.json and resource/process/shutdown logs.

No queue-wide cancellation or financial state mutation was performed. The only
tracked test modification remains the preexisting approved patch. New changes in
this continuation are evidence/harness files and documentation updates. Exact full
modified/untracked inventory is in INVENTORY.txt; hashes are in MANIFEST.json.
Earlier root MANIFEST.json intentionally remains the historical evidence manifest;
its RESULTS.md hash predates the appended continuation pointer.

Recommendation: retain the approved T38 patch and five passing suites. T42 restricted
foundation preservation now passes in a fresh fully provisioned environment. Do not
claim complete T38 technical verification or overall acceptance: T40/T41/T42 browser
regressions and the after-fetch diagnostic remain outstanding. Next work should
correct the browser harness's explicit T40/T41/T42 database environment, then run
outstanding checks sequentially. The after-fetch diagnostic must use a separate
isolated database and temporary source copy, retain its active lease, and must never
be followed by a normal suite on that contaminated database. Existing CI dedicated
T38 database guard mismatch described in historical handoff remains outside this
continuation's edits.


## Final verification accepted checks — 2026-10-29

The authorized corrected harness completed T40, T41 and T42 browser scripts
sequentially, all exit 0, with clean fixture state/sessions/processes after each.
The separate after-fetch diagnostic returned expected exit 1 and all 16 diagnostic
checks passed: original error retained, active lease diagnosed/retained, three
subsequent bodies blocked, independent cleanup attempts, unrelated job retained,
zero sessions. Final normal databases contain no jobs; diagnostic lease remains
isolated. Temporary PostgreSQL/Redis stopped. The previously outstanding local
acceptance checks are now satisfied. See [final verification report](../final-verification/RESULTS.md) for
exact evidence, scope and limitations. Historical failures above remain retained.
