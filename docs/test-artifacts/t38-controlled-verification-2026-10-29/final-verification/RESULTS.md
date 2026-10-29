# T38/T42 final controlled verification — acceptance checks satisfied

Date: 2026-10-29. Branch `main`. Index empty. No commit, push, deployment,
production change, migration creation/change, financial-policy change or test
assertion change. Approved T38 target SHA-256 remains
`9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a`.

## Baseline and retained evidence

Accepted working-tree inventory matched. Verified 116 applicable entries in the
historical manifests before execution. Five original T38 suites (16/16 each) and
SQL evidence, T42 preservation integration (6/6), API build/TypeScript/relevant lint,
web TypeScript/ESLint/production build, and earlier T36/T37/T40/T41 results remain
retained. These passing checks were not rerun. Immediately before documentation
updates, all 117 preexisting evidence files matched the start-of-turn hashes and
all baseline tracked files matched their start-of-turn hashes. See baseline.json,
baseline-evidence-hashes.json and preserved-evidence-integrity.json. Only appended
report/handoff updates intentionally change previously hashed documentation.

## Browser harness correction and isolation

New `browser-verification.py` replaces the incomplete continuation harness for
this execution; the old harness/logs remain as historical evidence. Checked-in
browser tests, fixture scripts and assertions were not edited.

Actual fixture contracts read:

| Fixture | Required database variable | Other required contract |
|---|---|---|
| T40 | T40_TEST_DATABASE_URL | AUTH_TEST_REDIS_URL; NODE_ENV=test |
| T41 | T41_TEST_DATABASE_URL | AUTH_TEST_REDIS_URL; NODE_ENV=test |
| T42 | T42_TEST_DATABASE_URL | AUTH_TEST_REDIS_URL; NODE_ENV=test |

The browser scripts fork fixtures with NODE_ENV=test; they set their own local API
URLs, development preview flags and local web ports. T40 sets
T40_DEVELOPMENT_PREVIEW/T40_LOCAL_FIXTURE_SUBMISSIONS; T41/T42 use
T41_LOCAL_SIMULATION_PREVIEW. TEST_ARTIFACTS_DIR selects evidence output; CHROME_BIN
is optional with the checked-in Chrome helper's default. Harness also supplies
local test auth/config values and disables job/financial gates. Values containing
authentication material are intentionally omitted from this report.

Created fresh dedicated `safethrift_browser_final_20261029_test` in the retained
verification-only PostgreSQL 16.15 cluster on loopback port 55439. Applied all eight
existing application migrations and both pinned job installers; pg-boss
12.38.0/schema 46 verified. Used dedicated temporary Redis on loopback port 56442.
No production or shared database was used. Explicit per-fixture URLs all select the
new database. Existing fixture guards reject nonlocal hosts, non-test database
names and non-test NODE_ENV; T41/T42 additionally require redis: protocol. New DB
creation, zero preflight data/jobs/sessions and exclusive cluster identity provide
dedication evidence beyond the guards' local-name checks. No connection credential
is included here.

## Sequential browser regressions

| Suite | Exact command | Result | Wall seconds |
|---|---|---|---|
| T40 | pnpm --filter @safethrift/web test:registration:browser | 1 complete script passed / 0 failed | 70.167 |
| T41 | pnpm --filter @safethrift/web test:dashboard:browser | 1 complete script passed / 0 failed | 70.662 |
| T42 | pnpm --filter @safethrift/web test:loans:browser | 1 complete script passed / 0 failed | 75.151 |

These assertion-based scripts emit scenario summaries rather than individual TAP
case counts; the counts above refer to whole browser scripts. Each fixture ready
handshake, Next startup, Chrome DevTools connection and browser journey succeeded.
Logs, command JSON, screenshots, scenario results and post-suite SQL/process/port
records are retained under browser-registration, browser-dashboard and browser-loans.

- T40: individual/family synthetic journeys, email verification/login, household
  clearing, committed receipt recovery, keyboard navigation, mobile layout, zero
  axe violations, empty local/session storage and no sensitive URL data.
- T41: protected dashboard/account routes, owned history/pagination, error recovery,
  memory-only storage, disabled initial gate, approved deposit/withdrawal simulation,
  unchanged idempotency key/body after a lost response, GSA restrictions, runtime
  gate revocation, pending-member denial/empty state, reload requiring login,
  keyboard/mobile layout and zero axe violations.
- T42: direct loan sign-in, owned discovery/status/schedule/history and pagination,
  disabled application/repayment controls, zero loan mutation requests, reviewer
  zero/null snapshots, member denial from review queue, empty local/session storage,
  mobile layout and zero axe violations.

After every suite, database state equalled empty preflight: members, accounts,
loans, applications, repayments, savings, withdrawals and both job queues all zero;
no other database sessions. No fixture/browser/web process or test port remained.
T42's fixture independently checks expected application/repayment counts before
cleanup, and the integration preservation assertions already passed unchanged.
A benign Next smooth-scroll advisory was logged in T41; no assertions failed.

## Financial and session restrictions

Read-only source review confirmed unchanged registration guards: public collection
is closed; T40 local fixture mode is NODE_ENV=test and .invalid-email restricted.
T40_APPLICATIONS_ENABLED remains false. Access tokens remain private in-memory
session fields, with empty local/session storage assertions in all browser scripts.
Refresh behavior is unchanged: existing HttpOnly, SameSite=strict cookie, production
Secure flag and /api/v1/auth/refresh path; existing rotation/session tests remain
retained rather than rerun. T41 exercises only its approved simulation behavior.
Loan application/repayment/approval/rejection services still explicitly deny
execution; no disbursement route or settlement was activated. Prior T42 integration
proves denied direct writes and unchanged preservation snapshots. No new policies,
thresholds, financial execution, provider calls or settlement behavior were added.

## Deliberate after-fetch failure — expected failure, diagnostic assertions PASS

Only after all browser scripts passed, created separate dedicated database
`safethrift_t38_recovery_final_fetch_20261029_test` using existing migrations and
both pinned installers. Created temporary source copy at
`/tmp/t38-final-fetch-diagnostic-orggsj2z/test/fetch-diagnostic.mjs` with installed
dependencies and compiled application modules linked. Approved source remained
unchanged. Source copy is also retained as fetch-diagnostic-source.mjs.txt.

Executed:

```text
node --test --test-name-pattern=persists worker failure|retains exhausted|preserves identity collisions|rejects cross-scope /tmp/t38-final-fetch-diagnostic-orggsj2z/test/fetch-diagnostic.mjs
```

The temporary copy injects DELIBERATE_AFTER_MANUAL_FETCH_FAILURE immediately after
the manual fetch, with only diagnostic output before throwing. It logs cleanup
attempts/successes and instruments the first statement of three later test bodies
with a forbidden sentinel. It also seeds an unrelated future-start job in the same
evidence queue after fixture preparation, before fetching, to test retention.
No checked-in assertion or cleanup decision was weakened or bypassed.

Node exited 1 as expected: 4 failing subtests, comprising the original injected
failure plus three beforeEach hook failures. The recovery subtest explicitly
reports testCodeFailure and error DELIBERATE_AFTER_MANUAL_FETCH_FAILURE; cleanup
inspection did not replace it. All 16 diagnostic checks in fetch-diagnostic.json
passed. This is a successful expected-failure diagnostic, not a normal-suite pass
or regression.

Retained broker evidence:

| Role | Job ID | Event ID | State | Retry count |
|---|---|---|---|---|
| Recovery target | 1c64e042-4a01-41e6-a328-0e759d118805 | a660bf04-1303-4bd7-ade9-a315422039ae | active | 0 |
| Unrelated same-queue job | 3ca2ff0e-dea2-4385-be8c-11b4c01d6482 | none — diagnostic payload | created | 0 |

Recovery event remains queued; observations=0. Target inspection diagnosed the
active lease and set the cleanup-failure latch. All three later tests failed in
beforeEach with 'Prior fixture cleanup failed; stop verification and preserve
evidence'; no body sentinel occurred. No cancellation was logged; both SQL
snapshots retain the active target and unrelated created job unchanged.

Worker cleanup and monitor shutdown were attempted independently and recorded
success. The failure occurs before worker registration, so no recovery callback
worker existed to drain; the successful worker cleanup branch is a no-op. The
local monitor was started and successfully stopped, monitor error verification
passed, and suite-level jobs.stop completed. Process exit plus zero sessions and
stable broker snapshots support shutdown. This diagnostic does not claim to prove
shutdown of an already-running recovery callback worker.

The retained lease was never reset, cancelled, expired or forcibly recovered. No
normal suite ran on this diagnostic database, and none may be run there. PostgreSQL
shutdown preserves the broker state on disk; restarting a broker/monitor against
this database could later reclaim it and would invalidate the retained evidence.

## Final resources, inventory and recommendation

Final read-only inspection covered all three databases in the dedicated cluster:
prior preservation DB and new browser DB have no broker jobs/nonterminal leases;
diagnostic DB has exactly the active target and unrelated created job above. All
have zero other sessions. Immediate and delayed snapshots three seconds apart
matched exactly; an earlier independent three-second diagnostic window also
matched. No continuing callbacks/database changes were observed in those windows.
No verification browser/fixture/web/diagnostic process or test listening port
remained. Redis inspect reports exited; PostgreSQL shutdown succeeded. See
final-resource-state.json, verification-processes.json and shutdown/server logs.

Retained cluster data: /tmp/safethrift-t38-continuation-pg. Databases retained:

- safethrift_preservation_continuation_20261029_test — prior 6/6 preservation.
- safethrift_browser_final_20261029_test — empty after browser cleanup.
- safethrift_t38_recovery_final_fetch_20261029_test — contaminated diagnostic only.

Historical original five-run/negative database SQL and TAP evidence remain intact;
the original historical cluster directory was unavailable in the prior turn.
Temporary diagnostic source and reviewable source copy remain identified above.
New evidence/harness files and append-only handoff/report updates are the only
changes this turn. Exact modified/untracked inventory is INVENTORY.txt; MANIFEST.json
hashes this final evidence and updated handoffs. Index empty; approved test patch
unchanged; production/migration/checked-in test-script scope unchanged.

All outstanding normal browser acceptance checks now pass, and the after-fetch
diagnostic satisfies its expected-failure assertions. Together with accepted prior
results, requested local technical verification is complete. Recommend accepting
T38 ownership/recovery technical verification for the approved test hash and
accepting preservation of the restricted T42 foundation. This does not authorize
financial execution, production readiness, commit, push or deployment.

Limitations: browser checks use local synthetic fixtures and development Next
previews; the separately retained production build passed earlier. Browser scripts
do not emit per-assertion counts. Shutdown observation is bounded, not a proof
against arbitrary external activity. The diagnostic fails before worker creation.
The historical CI dedicated T38 database-name guard mismatch remains an unchanged
handoff item outside this authorized verification task; this result does not claim
that CI is repaired or that production/payment execution is approved.


## Git preservation clarification — 2026-10-29

This clarification supersedes the earlier statement that dedicated T38 CI database
setup remains unresolved. The existing checked-in `.github/workflows/ci.yml`
already provisions `safethrift_t38_recovery_ci_test`, applies the existing
application migrations, installs the pinned payment-job schema, and supplies that
dedicated database to the T38 suite. No CI change is part of this preservation.
Hosted CI execution has not been independently established by this local work.

Earlier manifests are historical snapshots. Subsequent documented report/handoff
append operations changed some hashes; historical manifests remain unmodified.
The original replacement review's "NOT APPLIED" statement describes its
preparation-time status. The replacement patch was subsequently applied and
verified at the accepted T38 target hash.

The 24 ignored raw `.log` files have byte-identical retained `.log.txt`
counterparts. Those raw duplicate logs are intentionally excluded from the curated
Git package. Historical manifests may reference those omitted raw paths and older
report hashes; use the refreshed final manifest to validate the curated package.

### Curated Git package manifest convention

`MANIFEST.json` retains the existing JSON array format. Each entry records `path`,
`bytes`, and SHA-256 `sha256` of the final file bytes. Paths are repository-relative
regular files; absolute temporary paths mentioned inside evidence are context,
not manifest artifact paths.

Scope: all 152 curated nonignored artifact files under
`docs/test-artifacts/t38-controlled-verification-2026-10-29/` and
`docs/test-artifacts/t38-ownership-recovery-replacement-2026-10-29/`, plus these three
handoff documents:

- `docs/T38-payment-webhook-evidence.md`
- `docs/T38-worker-recovery-investigation.md`
- `docs/T42-loan-implementation.md`

The final manifest itself is one of the 152 curated artifacts and is committed,
but deliberately has no entry for its own hash: including it would be
self-referential. Thus this manifest contains 154 entries for the other 151
artifacts and three handoffs, covering a 155-file documentation/evidence commit.
It excludes all 24 ignored raw `.log` duplicates, which are not required to
validate this curated package. Historical manifests are preserved as evidence
files and hashed as files; their historical entries are not recursively treated as
the current package inventory. No new manifest format or metadata fields are
introduced.
