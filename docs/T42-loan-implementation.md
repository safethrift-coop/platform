# T42 loan technical foundation — implementation and verification

Date: 2026-10-27. Branch: `main`. Baseline HEAD:
`585949b54564a07b701b7f1464a86ea82f5d368e` (T41).
Status: restricted technical foundation conditionally accepted; final preservation
checks found a T38 worker-recovery regression-test blocker. T42 execution-denial
checks pass; unconditional preservation sign-off is pending. No commit, push or
deployment.

| Readiness dimension | Explicit status |
| --- | --- |
| Technical foundation | Implemented and locally verified |
| Operational loan application submission | Disabled, including synthetic execution |
| Operational repayment execution | Disabled, including synthetic execution |
| Durable successful idempotent replay | Pending separate persistence/migration and write-contract approval |
| T42 full functional completion | Pending; restricted technical acceptance is not operational completion |

The authoritative T42/T43 entries, dependencies, source findings and reviewed
proposal remain in `T42-loan-readiness-assessment.md`. T42 depends on T27, T34 and
T41; T43 depends on T23, T24, T27, T35 and T31. No roadmap milestone was added or
renumbered. This report describes actual behavior rather than claiming that the
broader proposed write architecture has been implemented.

## 1. Original requirements delivered and operational limits

| Original requirement | Implemented interface | Operational state |
| --- | --- | --- |
| Eligibility summary, points, risk band | `/dashboard/loans/apply`, authoritative stored points/band, membership context and backend capability | Readable after authentication. Unscored/unavailable remain distinct. No eligibility guarantee or scoring computation. |
| Requested amount slider capped at points multiple | Labelled range and exact-decimal input, with cap-unavailable explanation | Disabled. Degenerate zero-position range is an unavailable control, not a £0 lending limit. No arbitrary native £100 range, approved multiple, synchronization or submission is claimed. |
| Purpose and submit | Labelled purpose field and application submit interface | Disabled. Neither browser controls nor direct API can create applications. |
| Application status page | `/dashboard/loans/applications/[applicationId]` and bounded owned application discovery | Shows recorded status, amount, term, purpose, points/risk snapshot and an owned linked loan where present. No internal notes/reviewer IDs/score/probability in member responses. |
| Active loan detail/principal | `/dashboard/loans` discovery and `/dashboard/loans/[loanId]` | Exact GBP principal, recorded status and term. Active is never described as verified disbursement. Other owned recorded statuses remain inspectable. |
| Schedule table | Owned, bounded, installment-ordered schedule with Load More | Displays recorded principal/interest/due/paid/status; does not rewrite inconsistent historical schedules or claim collection. |
| Repayment form | Labelled amount and repayment submit interface | Disabled, including direct API and legacy replay paths. No allocation or collection. |
| Repayment history | Owned cursor feed and Load More with retry, retained rows, status announcements and focus handling | Processing `completed` stays separate from unknown provenance and unverified settlement. |
| Admin review queue with score/probability | `/dashboard/loan-review`, discovered by authorized reviewers from loan home | Read-only Staff/Admin API authorization. Stored application-time values; actual zero displayed as zero, null as unavailable. No current score substituted or computed. |

T43 can reuse and extend the queue. This does not implement membership/member/KYC
administration, freezing, compliance resolution, savings-history review or queue
monitoring. Historical BullMQ references retain the job-monitoring requirement
but must use PostgreSQL/pg-boss. No new queue/worker or infrastructure was added.

## 2. Repayment vulnerability remediation and explicit replay limit

Previously, repayment looked up a global key and returned its raw transaction
before checking ownership. It also accepted caller amounts as completed payments.
Those executable paths have been removed from the service under this authorization.

Current behavior:

1. JWT/current-member validation remains the controller boundary.
2. Service queries the target loan by both ID and authenticated member. Missing or
   foreign targets return the same 404, before even key validation.
3. An owned target requires a bounded `Idempotency-Key`; no key is fabricated by
   the server. Invalid keys return 400.
4. Every valid owned repayment attempt returns execution-disabled 403. No legacy
   key lookup, raw transaction replay, allocation, write or notification occurs.

This closes unauthorized replay by refusing all replay/execution, including a
matching historical amount/key, a different amount, another loan, another member's
known key or simultaneous requests. Application and admin approve/reject service
methods also deny execution. Application preserves active-membership and verified-
email checks before the execution-disabled refusal. No flag or environment can
turn these methods on; test/development/staging/production opt-in attempts are denied.

**Successful idempotent replay is not implemented.** The existing schema has no
receipt binding authenticated member, resource, operation, execution mode and
normalized original payload. Returning a successful replay would falsely assert
that binding. A durable receipt/provenance/allocation migration and new execution
contract require the user's separate approval. Neither was created. No in-memory
receipt, guessed legacy hash, retrospective simulation label or silent write
contract was introduced. Payload mismatch is refused with the same execution-
disabled response, not claimed as a persisted-hash 409 comparison.

## 3. Read contracts, ownership and compatibility

All paths use `/api/v1`; successful private reads send
`Cache-Control: private, no-store` and frontend requests are no-store/credentialed.
Prisma selections define minimal typed projections; monetary values use fixed
two-decimal strings and the shared T41 exact GBP formatter.

- `GET /loans/eligibility`: stored points/band, membership/email facts,
  `applicationCapability.allowed=false`, mode disabled, null maximum/minimum/step/
  policy, KYC/scoring eligibility `not_evaluated`, server-derived reviewer flag.
- `GET /loans/applications`: bounded owned application cursor page.
- `GET /loans/applications/:id`: owned public status projection with owned linked
  loan ID or null. Internal notes, reviewer ID, score and probability are omitted.
- `GET /loans/mine`: bounded owned loan cursor page.
- `GET /loans/:id`: owned minimal loan projection and disabled repayment capability.
  Does not expose linked application/account data or their potentially inconsistent IDs.
- `GET /loans/:id/schedule`: ownership verified first and parent member filter
  repeated in the schedule query; bounded installment-order continuation.
- `GET /loans/:id/repayments`: verifies parent first, filters transaction AND parent
  member, and only returns a non-null schedule link if it belongs to the loan.
  Malformed historical child rows are excluded, not projected as foreign records.
- `GET /loans/admin/queue`: JWT plus Staff/Admin, bounded pending/under-review
  applications with stored application-time score/probability. Missing model/date
  context is explicitly unavailable; no feature vectors/KYC documents are exposed.

Lists use default 20 / maximum 50, strict integer limits, versioned bounded cursors
scoped to member/reviewer/resource, stable date/ID ordering, and limit+1. Schedules
use unique installment numbers. Newer entries require refresh; this is keyset
continuation, not an immutable history guarantee. API consumers must treat cursors
as opaque. No endpoint accepts client-selected member authority.

Compatibility changes are deliberate and must be reviewed by API consumers:
`GET /loans/me` retains its array shape but now returns at most 50 redacted public
applications; use `/applications` to continue. Existing detail is redacted. Schedule
and admin queue now return `{items,hasMore,nextCursor}` instead of unbounded raw
arrays; current frontend had no consumers before T42. These are read-contract
changes; no financial write payload or persistence contract was added. All legacy
financial routes remain addressable but deny execution rather than preserving
unsafe posting behavior.

Every current loan/repayment projection has historical-unknown provenance and
unverified settlement. Schema cannot establish simulation provenance or verified
external collection; test fixtures are not backfilled as financial truth. T38
provider evidence is not consulted or activated. This work creates no settled,
collectible, withdrawable or verified-payoff amount.

## 4. Session preservation and browser verification infrastructure

T42 uses T41's dashboard layout/provider and extends its API allowlist for loan
GETs only. Loan POST/PATCH and arbitrary scoring/admin paths fail in the session
before fetch. Server guards remain authoritative even for a manually typed queue
URL. Logout and member-switch generation checks prevent stale private results.
No access token or member locator enters browser storage or URLs.

Dashboard sign-in now waits for hydration before enabling controls and has POST
as a native fallback; early browser testing exposed default GET form submission
before the client handler was attached. This corrects credential URL exposure,
without changing T37 Redis hash/CAS rotation, cookies, expiry, single refresh slot
or logout semantics. Legitimate sign-in behavior remains covered by T41 browser tests.

Browser harnesses now copy frontend source into a disposable temporary preview,
symlink installed dependencies and use webpack development compilation. T40/T41/
T42 use ports 2040/2041/2042; fixtures use 3040 for T40/T41 sequential runs and
3042 for T42. This leaves the existing development server on 2025 and its Next
lock/build output untouched by these browser journeys. Copies have no user .env
files; harnesses supply explicit local configuration. Application production
build remains the normal Next/Turbopack build. No new dependency or lockfile change.

## 5. Executed local verification

| Check | Result |
| --- | --- |
| API Nest build | PASS |
| API unit suite | PASS — 8 suites / 46 tests, including 5 T42 security/cursor tests |
| Full API e2e with PostgreSQL, Redis and `--detectOpenHandles` | PASS — 7 suites / 69 tests, including 6 T42 integration cases (final preservation run) |
| Final focused T42 e2e, including preservation and compatibility assertions | PASS — 6 tests |
| ESLint on loan source and T42 integration suite | PASS |
| Web lint and TypeScript | PASS |
| Web production build | PASS — loan/reviewer routes dynamic |
| Production web regression harness | PASS — 41 tests, including private HTML/noindex/no-referrer and loan session allowlist checks |
| T42 browser journey | PASS — no loan mutation requests, no credential URL parameters, zero axe violations and no mobile overflow |
| T40 registration browser regression | PASS — individual/family, verification/login, household clearing, receipt recovery, keyboard/mobile/axe |
| T41 dashboard browser regression | PASS — owned reads, lost-response unchanged replay, existing synthetic deposit/withdrawal, GSA/runtime gates, pending/empty states, keyboard/mobile/axe |
| T36 real pg-boss reminder regression | PASS — 16 tests / 2 suites |
| T38 webhook evidence regression | Earlier implementation run: PASS, 16 tests. Final preservation reruns: 15 pass / 1 failure in existing worker recovery; blocker below. |
| `git diff --check` | PASS |

T42 integration assertions cover JWT absence/forgery, foreign and owned application/
loan/detail/schedule/history reads, safe headers and redaction, null cap/disabled
capability, spoofed member query, malformed child member/schedule links, empty
member loan list, tied-date history across seven pages, stable application ties,
schedule continuation, foreign cursors, strict limits and malformed cursor refusal.
Queue tests use actual guards and database authority, check current admin revocation
and legitimate signed Staff behavior, and preserve zero/null snapshots.

Execution-denial tests run concurrent same-key requests with changed amounts and
foreign keys/resources, verify no returned repayment, unchanged transaction counts,
zero schedule changes and no new application. Default and explicit opt-in attempts
in test/development/staging/production still fail. Admin financial endpoints deny
an authenticated current Admin. Unit tests additionally prove no repayment lookup,
create or transaction is called. This verifies safe denial; no successful concurrent
allocation or persisted payload-hash replay is claimed.

Browser artifacts: `/tmp/safethrift-t42-browser/results.json`, `loan-detail.png`,
`loan-mobile.png`, `application-mobile.png`, `review-mobile.png`. Screenshots were
visually inspected. The T42 test fixture confirms its application/repayment counts
are unchanged before removing only its own fixture rows. These are local Chrome/
axe results, not a production certification or full manual screen-reader audit.
CI includes the T42 browser command; hosted CI has not run. A final query found
zero remaining T42 synthetic fixture applications in the dedicated test database.

Earlier failed checks were corrected: sandbox blocked local service connections;
the first full e2e invocation omitted the governance/auth database variable; the
concurrency test needed one stable bound HTTP server; occupied port/Next dev lock
required isolated previews; early hydration and navigation waits were made explicit;
axe detected a missing region role on an empty paginated state, which was fixed.
These failures are not reported as passes. The existing smooth-scroll Next warning
and pg client concurrent-query deprecation warning were informational in final runs.

## 6. Changed-file inventory

Backend source:

- `apps/api/src/modules/loans/loan-reads.service.ts` — typed owned/reviewer reads,
  cursor handling, decimal projections and disabled capabilities.
- `apps/api/src/modules/loans/loans.controller.ts` — guarded read routes, private
  headers, redacted compatibility alias and restricted existing write routes.
- `apps/api/src/modules/loans/loans.module.ts` — registers read provider.
- `apps/api/src/modules/loans/loans.service.ts` — removes unsafe financial execution
  and legacy replay; verifies ownership before key handling; preserves membership/
  email constraints and denies financial decisions.

Frontend source:

- `apps/web/src/app/dashboard/loans/page.tsx` — owned discovery.
- `apps/web/src/app/dashboard/loans/apply/page.tsx` — eligibility and disabled application.
- `apps/web/src/app/dashboard/loans/applications/[applicationId]/page.tsx` — status.
- `apps/web/src/app/dashboard/loans/[loanId]/page.tsx` — principal, schedule, form/history.
- `apps/web/src/app/dashboard/loan-review/page.tsx` — read-only review queue.
- `apps/web/src/components/loans/loan-views.tsx` — accessible reads, paging, states/forms.
- `apps/web/src/components/loans/loans.module.css` — contained scrollable table and text.
- `apps/web/src/lib/loan-contract.ts` — frontend read types.
- `apps/web/src/lib/dashboard-session.ts` — loan GET allowlist only.
- `apps/web/src/components/dashboard/dashboard-provider.tsx` — private loan navigation,
  hydration-safe sign-in controls and POST fallback.

Tests, fixtures and CI:

- `apps/api/src/modules/loans/loans-security.spec.ts` — denial/ownership/cursor units.
- `apps/api/test/loans.integration.e2e-spec.ts` — real PostgreSQL/JWT/Redis tests.
- `apps/api/test/fixtures/t42-browser-server.mjs` — isolated seeded loan browser API,
  disabled execution, fixture count checks and cleanup.
- `apps/api/test/fixtures/t40-browser-server.mjs` and
  `apps/api/test/fixtures/t41-browser-server.mjs` — test CORS ports only.
- `apps/web/tests/loans-browser.mjs` — required interfaces, reviewer states and axe.
- `apps/web/tests/helpers/isolated-web.mjs` — disposable frontend source snapshot.
- `apps/web/tests/dashboard-browser.mjs` and `registration-browser.mjs` — isolated
  previews/ports and hydration readiness, retaining existing journey assertions.
- `apps/web/tests/dashboard.test.mjs` — loan GET allowlist and mutation rejection.
- `apps/web/tests/dashboard-closed.test.mjs` — all new routes' private HTML checks.
- `apps/web/package.json` — T42 browser test command.
- `.github/workflows/ci.yml` — T42 browser check, not deployment.
- `docs/T42-loan-readiness-assessment.md` — reconciled proposal and conditional boundary.
- `docs/T42-loan-implementation.md` — this report.

## 7. Remaining decisions and technical readiness

The read-only foundation and required disabled interfaces are ready for review.
This is not operational completion of T42's application/repayment flow. No application
submission, repayment, approval, rejection, disbursement or collection can execute,
even synthetically. No database migration, new financial write contract, scoring/
KYC policy or new background processing was introduced.

Before enabling any execution, obtain explicit approval for durable request binding
and provenance/allocation persistence (migration), the normalized write contract,
points-to-GBP cap and maximum borrowing rules, legacy risk/balance treatment,
KYC authority/expiry/address/risk rules, scoring requirements/freshness, pending-
application semantics, allocation/missed/early/surplus rules and schedule rounding/
calendar rules. Live settlement/disbursement/collection remain unapproved separately.
Historical data is never repaired or upgraded to settled by a view.

T37 Redis-backed authentication and T25/T38 safeguards remain intact. T40 public
registration stays closed. T41 browser regressions pass. Existing signed Staff
claims retain their legacy handling; no new role provisioning or inferred hierarchy
was introduced. All changes remain local on `main`; no commit, push or deployment.

## 8. Final preservation check before any commit

The final check stayed on `main` and made no application-source or configuration
changes. It added one real-service HTTP preservation case to the existing T42
integration suite and updated this handoff. Nothing was staged, committed, pushed
or deployed. The staged index is empty; staged whitespace check therefore passes
with no staged content. The candidate working-tree inventory contains 29 files
(the inventory in section 6), including two documentation files.

### Response-contract consumer audit

Repository-wide source/test/config searches covered loan URLs, service-method
calls, imports, schedule/history access and disbursement paths. Findings:

| Modified contract | In-repository consumers | Compatibility finding |
| --- | --- | --- |
| Legacy GET `/loans/me` | No frontend/runtime consumer found | Array shape retained, public fields redacted and maximum 50 documented; consumers needing continuation must use `/applications`. |
| Application list/status | T42 `LoanHome`, `ApplicationRows`, `LoanStatus`; loan integration/browser tests | List consumes `{items,hasMore,nextCursor}`; status consumes the public detail projection and owned loan link. No member reader expects internal score/reviewer fields. |
| Loan list/detail | T42 `LoanHome` and `LoanDetail`; loan integration/browser tests | Uses exact decimal strings and the selected public fields. No dependency on removed raw account/application IDs. |
| Schedule | T42 `LoanDetail`/`Paged<Installment>` and loan integration/browser tests | Uses pagination envelope and installment projection, including Load More. No remaining raw-array HTTP consumer found. |
| Administrative review queue | T42 `LoanReview`/`Paged<Review>` and authorization/browser tests | Uses pagination envelope; authoritative zero and null snapshots remain distinct. |
| T36 reminders | Prisma/parameterized SQL against loan/schedule tables | Does not call changed loan HTTP endpoints or removed LoansService read methods. Database contracts are unchanged. |
| Notifications/scoring | Their own persisted-data/template services | No changed loan response consumer or external-provider activation found. |

No incompatible in-repository consumer remains. This is a repository audit, not
proof about unknown external/deployed clients. The documented redactions, bounded
legacy list and pagination-envelope changes are intentionally not claimed to be
backward compatible with an external client expecting raw fields/arrays. Any such
client must be identified and updated before exposing the changed API to it.

### Direct HTTP denial and durable-state preservation

The new sixth T42 integration case uses real PostgreSQL, Redis, JWT validation and
current database Admin authority. Requests with valid bodies verify:

- POST `/api/v1/loans/apply`: 403.
- POST `/api/v1/loans/:ownedLoan/repay` with a valid key: 403.
- PATCH `/api/v1/loans/admin/:application/approve`: 403.
- PATCH `/api/v1/loans/admin/:application/reject`: 403.
- POST `/api/v1/loans/:loan/disburse` and PATCH
  `/api/v1/loans/admin/:loan/disburse`: 404. Source audit confirms no registered
  loan-disbursement operation; testing plausible paths does not invent an endpoint.

Before/after read transactions compare ordered full fixture accounts, applications,
loans, repayment schedules, repayment transactions, savings/withdrawal transactions,
reminders and audit records, plus member points/risk/status. They also compare
complete persisted job rows in both `t36_jobs.job` and `t38_jobs.job`.
All snapshots match exactly. Admin authority is set only as fixture preparation
before the snapshot and restored afterward. No business record or job is created
or changed by the denied operations. Existing tests additionally cover concurrent
keys, changed payloads, foreign targets, legacy replay refusal and denial even
when test/development/staging/production opt-in variables are supplied.

### Infrastructure and milestone preservation

No executable loan financial flag exists: capability is always denied and the
loan service has no write/enqueue/provider path. `T42_SIMULATION_ENABLED` appears
only as a deliberately ineffective input in regression tests. Existing T25 fixture
flags are test-only and do not authorize T42 execution. No .env file, Prisma schema,
migration, lockfile, new queue, job schema, worker or live provider integration was
introduced. T42 does not import pg-boss, a broker or a payment adapter.

Diff inspection confirms T37 auth/Redis code, T36 jobs/reminders, T38 webhook policy,
T40 registration application code, T25 savings safeguards and Prisma contracts are
unchanged from HEAD. T41's accepted loan navigation/read allowlist and hydration-safe
sign-in change remain covered by its passing browser regression. T37 lifetimes,
cookies, CAS rotation and logout behavior are unchanged. T38 stays default-disabled;
regression processes use isolated provider evidence only, not operational activation.

Fresh final checks: API unit 8 suites/46 tests; full API e2e 7 suites/69 tests;
changed API/test ESLint; web typecheck and dashboard session tests; T36 reminder regression: 16 tests passed. T38 evidence regression: see the final
isolation correction below. Earlier production checks (41 tests) and T40/T41/T42 Chrome/
axe journeys in this implementation remain the browser evidence: application source
has not changed since those passes. No claim of a new browser rerun in this final
preservation step is made.

### Inventory/secrets/artifacts review and remaining blockers

Both `git diff --check` and `git diff --cached --check` pass. Because new files are
unstaged/untracked, they were separately enumerated and scanned for whitespace,
private-key headers, AWS access-key patterns, GitHub tokens and live Stripe keys.
No findings. File-content review found only explicit test/CI dummy credentials and
synthetic `.invalid` identities in test code, not operational credentials. No .env,
private key, screenshot, archive, log, build output, runtime snapshot or temporary
frontend copy is in the candidate inventory. Browser artifacts stay under `/tmp`.

The reusable `t42-browser-server.mjs` fixture and isolated-preview helper are
intentional test source; they are not retained financial records or generated
temporary artifacts. T40/T41 fixture edits only align local test CORS ports with
their isolated browser harnesses. No unrelated application change was found.
Pattern scanning is bounded evidence, not a guarantee that arbitrary undisclosed
secrets could never be encoded in source.

The T42 restricted-foundation checks pass, but unconditional final preservation
sign-off is blocked by the T38 recovery-test failures below. Operational
application/repayment execution, successful durable replay and full T42 completion
remain blocked on the previously documented approvals and are explicitly pending.
External consumer compatibility cannot be certified without identifying those
consumers; do not interpret repository compatibility as a public API release claim.

### Final T38 isolation correction and unresolved regression-test blocker

The first final T36/T38 runs were mistakenly launched concurrently against the same
isolated test database. T36 passed all 16 tests. T38's whole-database preservation
snapshot correctly detected the concurrent creation/removal of reminder fixtures;
that run was not a pass. Its failed after-hook left its own synthetic member and
three related fixture rows. The interrupted test process was stopped and exactly
those four rows were removed by the recorded fixture member ID (one row in each
of savings transactions, accounts, registration and members). No other member or
application data, job schema or queue was reset. An older preexisting fixture was
left untouched.

T38 was then run sequentially with no reminder suite active. Fifteen cases passed;
the existing test “persists worker failure, expiration retry and successful
recovery using real pg-boss” timed out awaiting durable state. One repeat again
passed 15 cases but failed the same recovery case, observing 3 handler calls versus
2 expected. Both sequential runs exited and completed their normal fixture cleanup.
A process inspection found no lingering test worker. No T38 runtime, queue, retry,
lease or test expectation was edited to force a pass.

Existing queue residue/timing in the reused test database may contribute, but that
cause is not established. No live provider was contacted and application intake
remains disabled by default. The earlier successful T38 result is historical
evidence only and does not override these final failures. Before an unconditional
preservation sign-off, diagnose the recovery case or reproduce against a clean
isolated database using the existing schema/installers. Do not flush/reset existing
queues or relax idempotency/retry expectations as a workaround. This is the remaining
verification blocker; no commit, push or deployment is authorized by this report.

Final focused rerun after strengthening snapshots to complete pg-boss job rows and
adding the legacy `/loans/me` array assertion: 6/6 T42 integration cases passed.
Final changed-test ESLint, working-tree/staged diff checks and the separate
29-candidate-file whitespace/secret-pattern/artifact review passed. The index is
still empty; no staging operation was performed. Dedicated SafeThrift test
containers were restored to their stopped state after the checks.

## 9. T38 recovery investigation recommendation — pending test-patch approval

See `T38-worker-recovery-investigation.md` for the reproduced root cause, installed
pg-boss behavior, job-ID traces, proposed patch and validation. A new empty isolated
database reproduced the issue: first unchanged suite passed, then repeat runs hit
monitor-claim timing and retained manually leased test jobs. Extra callbacks were
other abandoned jobs handled by one worker, not duplicate financial/evidence writes.
A test-only candidate outside the repository passed ten full suites; the final
stronger job-ID/retry-count assertions passed five additional suites. Sixty further
process calls left all public tables unchanged and one observation per event.

The proposed one-file test correction is NOT applied. Approval and passing the
checked-in full T38 regression after applying it are still required before removing
the final preservation blocker. No production-worker fix is currently supported by
the evidence. No T42 restriction or application code changed in this investigation;
operational submission/repayment, durable successful repayment replay and full T42
functional completion retain their existing disabled/pending status.

Candidate failure-containment verification also passed: a deliberately interrupted
manual-lease test cancelled only its owned job and left no evidence worker; the
next normal full suite passed in the same diagnostic database without reset. The
patch remains unapplied; this evidence supports approval, not checked-in completion.

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


## 2026-10-29 controlled-verification continuation

The approved ownership/recovery test remains exactly SHA-256
`9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a` on main.
The five complete T38 suites and independent SQL evidence are retained. No test
assertion, production code or migration changed in this continuation.

The original temporary cluster was unavailable; a fresh dedicated preservation
database received the eight existing application migrations and both pinned job
installers (pg-boss 12.38.0/schema 46). T36 inventory/version/job count survived T38
installation unchanged. Complete T42 integration now passes 6/6, including unchanged
financial and full broker-row snapshots, ownership/role boundaries and denied
financial execution. API build/TypeScript/relevant test lint and web TypeScript/
ESLint/production build pass.

Stopped at the first remaining blocker: T40 browser fixture rejected missing
T40_TEST_DATABASE_URL in the continuation harness before browser assertions. No
retry occurred. T41/T42 browser regressions and the deliberate after-manual-fetch
failure diagnostic remain NOT RUN. Earlier active-preparation diagnostics do not
prove the after-fetch latch acceptance conditions. Full technical acceptance remains
incomplete; T42 has passing restricted-foundation preservation evidence without
financial execution approval.

Final database snapshots three seconds apart matched, with zero other sessions and
zero jobs/member/loan/repayment rows. Temporary PostgreSQL/Redis stopped; fresh data
directory retained. No new diagnostic database or active diagnostic lease was
created. No commit/push/deployment. See
[test evidence and exact limitations](test-artifacts/t38-controlled-verification-2026-10-29/continuation/RESULTS.md).
This update supersedes older current-status recommendations only to the extent
supported by the new evidence; historical attempts remain recorded above.


## 2026-10-29 final T38/T42 local verification

The approved T38 test remains SHA-256
`9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a` on main;
index empty. Five prior T38 passing suites/SQL evidence, T42 preservation 6/6 and
API/web checks remain retained. No production/migration/checked-in test changes.

The corrected local harness supplied the actual T40/T41/T42 fixture database
variables and AUTH_TEST_REDIS_URL to dedicated local services. T40 registration,
T41 dashboard and T42 loan browser scripts each passed sequentially, with mobile,
accessibility, memory-only storage, authorization and disabled-operation checks.
Every post-suite database/process/port check was clean. Public registration and
financial execution remain disabled; T41 exercised approved simulation only.

A separate temporary-source after-fetch diagnostic exited 1 as expected, preserving
DELIBERATE_AFTER_MANUAL_FETCH_FAILURE as the original error. Active recovery job
1c64e042-4a01-41e6-a328-0e759d118805 (event
a660bf04-1303-4bd7-ade9-a315422039ae) remains active/retry_count 0 in isolated
safethrift_t38_recovery_final_fetch_20261029_test. All three later bodies were
blocked by beforeEach cleanup latch; an unrelated same-queue job remained created.
Worker cleanup and monitor stop were attempted independently; monitor/jobs stopped.
No recovery callback worker had yet been registered. No lease cancellation, expiry
or forced recovery occurred; no normal suite used the contaminated database.

Final snapshots matched over a bounded window, with zero sessions/processes and no
normal-database broker jobs. Temporary PostgreSQL/Redis stopped; retained cluster
data and diagnostic source are identified in the final report. All 16 diagnostic
checks passed. Recommend accepting the requested local T38 technical verification
and restricted T42 foundation preservation, with no financial-execution or release
authorization. Historical CI database-guard integration remains outside this task.
See [final controlled-verification evidence](test-artifacts/t38-controlled-verification-2026-10-29/final-verification/RESULTS.md).
This update supersedes older incomplete-status recommendations for these acceptance
checks; historical evidence and limitations remain recorded above.


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
