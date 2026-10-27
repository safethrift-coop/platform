# T41 Member Dashboard implementation and verification

Status: implemented and verified locally on `main`, awaiting final review.
Date: 2026-10-26. HEAD remains
`dd76cd716c13ebec6ada382fa41df8688297ced0`.
No commit, push, deployment, schema migration, live financial operation, T38
activation or opening of T40 public registration was performed.

## Scope delivered

Authoritative original T41 entry, supplied by the user:

> Build member dashboard — accounts and transactions. Protected route (JWT required). Dashboard: savings points total, active accounts summary, recent transactions, current risk band (low/moderate/high). Account detail: balance, transaction history (cursor paginated, load more), deposit form, withdrawal form. All amounts formatted with Intl.NumberFormat for GBP.

Dependencies: T25 and T26. The approved proposal is retained in
`T41-dashboard-readiness-assessment.md`.

Delivered `/dashboard` and `/dashboard/accounts/[accountId]`, authenticated stored
points/risk, owned active savings accounts, bounded recent activity, owned detail,
combined cursor history with Load More, and simulation-only deposit/withdrawal
forms. Existing design components/styles are reused. No loan management,
application workflow, points breakdown/history, account opening, scoring control,
admin UI, fee/earnings/eligibility policy or payment integration was added.

## Backend contracts

All routes below use `/api/v1` and JWT authorization.

- `GET /accounts/overview`: stored `savingsPointsTotal`, stored `riskBand`,
  membership status for accurate pending context, active owned savings FSA/RSA/GSA
  projections, newest five owned savings transactions/withdrawals, and server
  simulation capability. The overview reads from a RepeatableRead transaction.
- `GET /accounts/:id`: owned savings account detail, exact balance/goal strings,
  recorded-balance notice, settlement classification and account-specific
  simulation capabilities. Existing account fields are retained with additive
  display fields; account number and dates are not approval or settlement evidence.
- `GET /accounts/:id/transactions?limit=20&cursor=...`: one normalized feed with
  `items`, `hasMore`, `nextCursor`; compatibility `deposits`/`withdrawals` arrays
  project that same page, rather than independently repeating withdrawals.
- Existing `GET /accounts` behavior is preserved, with a private no-store header.
- Existing T25 deposit/withdraw POST endpoints, DTOs, transaction implementation,
  validation, response persistence, replay and event processing are unchanged.
- Identity bootstrap `/members/me` and account GET routes send
  `Cache-Control: private, no-store`. Client requests use no-store and credentials.

The read provider lives in the existing savings module. No new module, database
model, migration, financial write contract, dependency or lockfile change is needed.

### Pagination and isolation

The parameterized PostgreSQL union filters both the child member ID and owning
account's member ID in each source; history first verifies account ownership.
It filters to savings account types and orders by transaction date descending,
source ascending and original ID descending, with explicit C collation for stable
string ties. Public IDs are source-qualified, for example `withdrawal:<id>`.

Cursor decoding validates version, bounded encoding, member/account scope, source,
ISO timestamp and ID. It does not treat a decoded cursor as authorization. Invalid,
foreign-scope and legacy deposit-ID cursors return 400. Limits are strictly parsed
integers 1–50, default 20. The query returns at most limit+1 rows, derives the next
cursor from the last displayed row, and never materializes an unbounded client
history. Newer inserts appear after refresh; this is keyset continuation rather
than an immutable snapshot guarantee.

The previous history cursor format is intentionally replaced. Existing consumers
must restart with no cursor; old deposit and withdrawal array pagination was
incoherent. No existing frontend consumer of that contract was found. Compatibility
arrays now contain minimal normalized items, not raw metadata/idempotency fields.

## Authentication

The dashboard session is separate from T40's registration client and bootstraps
identity from `/members/me`, never `/membership/application`. Access token and
member locator remain in memory. An unsigned page contains only a sign-in or
configuration-unavailable state; all private API calls require a valid JWT.

T37's existing login, HttpOnly refresh-cookie settings/path/lifetimes, Redis CAS,
trusted member authority and single-slot refresh model remain unchanged. Parallel
401s share one refresh; each request retries at most once. Generation checks reject
late login/read/refresh results after clear or member switch. Logout clears the
page immediately and calls the existing server endpoint. No browser storage is
introduced. Reload requires login again. A direct detail visit signs in on that
route and still enforces ownership, including after a different member signs in.

Private routes are dynamically rendered, noindex/no-referrer, and omitted from
public navigation and the sitemap. With no valid configured API origin, the route
shows unavailable sign-in without loading personal data. Production rejects a
loopback HTTP API configuration; an approved HTTPS API can support existing-member
sign-in. `/login`, `/register`, `/verify-email` and T40 gates are unchanged.

## Financial-safety evidence

Balances are labelled exactly:

> Recorded balance — settlement unverified; may include simulation records.

The UI never describes them as available, withdrawable or settled funds. It does
not infer account-wide provenance from the currently visible transaction page.

Transaction provenance is explicit:

- True simulation marker: simulation; no external settlement.
- Null historical marker: unknown historical provenance; settlement unverified.
- False marker without independent evidence: settlement unverified.

Recorded processing status is shown separately. T38 observations are not queried
or interpreted as settlement. Savings Points are the stored member aggregate,
not the estimated deposit-derived breakdown, cash earnings or a reconstructed
historical award. T26's stored enum maps Low/Moderate/High; `unscored` maps Not yet
scored, and unexpected data maps Unavailable. Failed reads are errors rather than
zero points/balances or an invented risk band. Dashboard visits do not compute
scores or write financial records.

Monetary display uses a shared
`Intl.NumberFormat('en-GB', {style:'currency', currency:'GBP'})` and exact decimal
strings. Supported Node/Chrome decimal-string formatting was checked, including
pennies, zero and `9999999999.99`, the Decimal(12,2) positive boundary. Request
amounts remain decimal strings; no optimistic balance/point arithmetic is used.

### Simulation forms

The form sections always exist on owned account detail. They are disabled unless:

1. The API confirms T25 capability for the current member/account; and
2. The frontend is development-mode, requested on loopback, using a loopback HTTP
   API and explicit `T41_LOCAL_SIMULATION_PREVIEW=true`.

The authoritative T25 backend gate still requires NODE_ENV development/test plus
literal `SAVINGS_SIMULATION_ENABLED=true`. Default, staging and production reject
mutations. Capabilities are advisory; every POST rechecks the gate and all existing
ownership/membership/account/balance/GSA rules at execution. No checked-in flag or
external environment was enabled. Only isolated test child processes opted in.

Forms retain one body/key per intentional operation, block overlapping submission,
freeze uncertain attempts, and retry unchanged. Request identity is retained in the
provider's memory across dashboard/account navigation. A successful replay/response
refreshes authoritative data. A first definite 4xx rejection permits correction;
a prior uncertain attempt is not discarded merely because a later retry is denied.
The browser test committed a deposit, deliberately dropped its response, then
verified identical body/key replay and a single £1.25 balance increment.

## Exact local verification results

| Check | Result |
| --- | --- |
| `pnpm --filter @safethrift/api build` | PASS |
| `pnpm --filter @safethrift/api test --runInBand` | PASS, 7 suites / 41 tests |
| Full `test:e2e --runInBand --detectOpenHandles` with explicit loopback test env | PASS, 6 suites / 63 tests, clean exit; includes 8 T41 cases |
| ESLint on changed API source and integration tests | PASS |
| `pnpm --filter @safethrift/prisma exec prisma validate` | PASS; schema/migrations unchanged |
| `pnpm --filter @safethrift/web typecheck` | PASS |
| `pnpm --filter @safethrift/web lint` | PASS |
| `pnpm --filter @safethrift/web build` | PASS; dashboard routes dynamic |
| `pnpm --filter @safethrift/web test:production` | PASS, 30 tests: 6 T41 session/display/config cases, 2 T41 private-route cases and 22 existing public/T40 cases |
| `pnpm --filter @safethrift/web test:dashboard` | PASS; the same 6 T41 unit cases also run individually |
| `pnpm --filter @safethrift/web test:dashboard:browser` | PASS, synthetic real-service journey; zero axe violations and no mobile overflow |
| `pnpm --filter @safethrift/web test:registration:browser` | PASS, existing T40 individual/family journeys, receipt recovery, household clearing, keyboard, mobile and axe |
| `pnpm --filter @safethrift/api test:reminders` | PASS, 16 tests / 2 suites |
| `pnpm --filter @safethrift/api test:payment-webhooks` | PASS, 16 tests / 1 suite |
| `git diff --check` | PASS |

API T41 coverage includes missing/forged JWT, cross-member reads and spoofed member
query, exclusion of frozen/non-savings accounts and malformed historical child
ownership, mixed-source ties and colliding IDs across many pages, withdrawal-only
exact boundaries, historical IDs containing colons, empty history, invalid limits/
cursors, foreign cursor scope, newer inserts, null/false/true provenance, stored
points/risk states, pending/suspended/closed members, stage/production gate refusal,
replay/conflict, foreign mutation, insufficient balance and GSA blocking.

Dashboard browser coverage includes keyboard tab order and focus on newly loaded
transactions, live loaded-count announcements, initial loading/read
error/retry, preserved
rows after Load More failure/retry, default disabled controls, synthetic deposit
lost-response replay, withdrawal, stored points refresh, GSA and runtime gate
revocation, cross-member account rejection, pending/empty/unscored state, direct
account URL requiring login, empty browser storage and no credential URL values.
Axe checks cover sign-in, error, overview, disabled account, history-page error,
mobile account and pending/empty states. Screenshots were visually inspected.

Evidence is in `/tmp/safethrift-t41-browser/results.json` and four PNGs in that
directory: overview, disabled detail, mobile detail and pending mobile overview.
The T40 harness regenerates `/tmp/safethrift-t40-browser`. The full reminder output
is retained in `/tmp/safethrift-t41-reminders.log`.

Tests used the existing dedicated SafeThrift PostgreSQL/Redis containers on
loopback ports 55437/56437 and database `safethrift_t40_test`, not other projects'
services or an application database. Both dedicated containers were stopped after
verification and retained with their databases. A final member-count check found
zero remaining T41 synthetic members. Fixtures use `.invalid` synthetic identities
and clean only their own rows/keys. No reset or Redis flush. Next builds, loopback
servers and Chrome ran outside the restricted sandbox because it blocks local
worker/server port binding. Hosted CI has not been run; its workflow now includes
the T41 browser harness, and the full e2e glob includes the new integration suite.

Initial setup corrections were limited to missing dummy notification configuration
and required synthetic password data. Browser harness refinements accommodated
first compilation, waited for retry controls to become enabled, and correctly
expected a switched member to be denied the previous member's account. Two
synthetic rows left by an earlier failed browser run were removed by their exact
fixture IDs (and their two refresh keys); the final harness now also requires a
successful fixture-cleanup exit. All final
checks listed above passed; these earlier runs are not represented as passes.

## Changed-file inventory

Backend source:

- `apps/api/src/modules/savings/account-reads.service.ts`: overview/detail,
  simulation capabilities, provenance projection and combined keyset feed.
- `apps/api/src/modules/savings/savings.controller.ts`: authenticated read routes,
  strict limit validation and no-store headers; existing write endpoints retained.
- `apps/api/src/modules/savings/savings.module.ts`: registers the read provider.
- `apps/api/src/modules/members/members.controller.ts`: no-store identity bootstrap.

Frontend source:

- `apps/web/src/app/dashboard/layout.tsx`: dynamic configuration, private metadata
  and dashboard session boundary.
- `apps/web/src/app/dashboard/page.tsx`: overview route.
- `apps/web/src/app/dashboard/accounts/[accountId]/page.tsx`: owned-detail view.
- `apps/web/src/components/dashboard/dashboard-provider.tsx`: memory session,
  sign-in/out, shared uncertain-attempt memory and reload warning.
- `apps/web/src/components/dashboard/dashboard-views.tsx`: summary, activity,
  detail/history, accessible states and gated forms.
- `apps/web/src/components/dashboard/dashboard.module.css`: responsive styling.
- `apps/web/src/lib/dashboard-contract.ts`: frontend read types.
- `apps/web/src/lib/dashboard-display.ts`: GBP, risk/provenance labels and strict
  local-preview configuration.
- `apps/web/src/lib/dashboard-session.ts`: dashboard-only T37 integration.

Verification/configuration:

- `apps/api/test/dashboard.integration.e2e-spec.ts`: eight real-service API cases.
- `apps/api/test/fixtures/t41-browser-server.mjs`: isolated synthetic browser API.
- `apps/api/test/savings.integration.e2e-spec.ts`: supplies the new read dependency
  to its existing controller test; financial test assertions are retained.
- `apps/web/tests/dashboard.test.mjs`: six display/config/session cases.
- `apps/web/tests/dashboard-closed.test.mjs`: two production HTML/privacy cases.
- `apps/web/tests/dashboard-browser.mjs`: synthetic end-to-end browser journey.
- `apps/web/tests/production-check.mjs`: adds T41 cases to the production harness.
- `apps/web/package.json`: dashboard unit/browser test scripts.
- `.github/workflows/ci.yml`: T41 synthetic browser test step, not deployment.
- `docs/T41-dashboard-readiness-assessment.md`: approved proposal and status link.
- `docs/T41-dashboard-implementation.md`: this implementation/evidence report.

## Local reproduction

Reuse the existing T40 test preparation: eight application migrations, isolated
loopback PostgreSQL/Redis and independently installed pinned T36/T38 queue schemas
for their regression tests. No new migration is required.

Run API build before the browser harness. Set `NODE_ENV=test`, explicit
`T41_TEST_DATABASE_URL` (or `SAVINGS_TEST_DATABASE_URL` for full e2e), and
`AUTH_TEST_REDIS_URL` to isolated loopback services. Run the dashboard API suite
with `pnpm --filter @safethrift/api exec jest --config test/jest-e2e.json --runInBand dashboard.integration.e2e-spec.ts`.
The browser command is `pnpm --filter @safethrift/web test:dashboard:browser` and
sets its own local preview configuration; its test-only IPC switches no real app.

An explicitly authorized manual synthetic preview requires a loopback web/API,
`NEXT_PUBLIC_API_URL=http://localhost:<port>/api/v1`, and frontend
`T41_LOCAL_SIMULATION_PREVIEW=true`, plus the existing backend T25 test/development
opt-in. Do not point it at live records. Without all gates, detail remains
readable after authentication but both form sections stay disabled.

## Practical limits and final readiness

### Continuation check — 2026-10-27

The working tree also contains a shared headless Chrome launcher in
`apps/web/tests/helpers/chrome.mjs`, used by the dashboard and registration
browser harnesses, and its regression coverage in
`apps/web/tests/browser-runtime.test.mjs`. It supports readiness via Chrome's
active-port file or stderr, bounded startup diagnostics, early-exit handling,
and removal of the inherited desktop D-Bus session address for fresh profiles.

On continuation, dashboard unit tests, browser-runtime regression tests, web
typecheck, web lint and `git diff --check` passed again. These focused checks do not constitute a new
run of the real-service browser journeys or the full API integration suite;
the full verification results above retain their original 2026-10-26 date.

No known failing local check remains. T41 is ready for final implementation review
within its approved development/simulation scope, not for live financial launch.

- Sessions and uncertain request identities are memory-only. Reload, closing the
  tab or signing out clears them. An uncertain operation warns against reload and
  retains body/key during the current session; after losing that memory, inspect
  the recorded outcome before starting a replacement. No persistent financial
  draft/recovery system is introduced.
- Existing T37 logout/access-token lifetime and single-refresh-slot limitations
  remain. No immediate universal access-token revocation or multi-device system
  is claimed.
- Historical balances/transactions still lack independent settlement evidence.
  Labels expose that limitation; no reconciliation or settlement policy is added.
- API history consumers must migrate from legacy deposit-ID cursors and raw arrays.
- Private page HTML is a public sign-in shell; JWT-gated APIs protect all private
  content and mutations. No server session/BFF architecture is introduced.
- No new T26 scoring policy or points reconciliation was attempted; original
  services and schema are unchanged. Existing policies still need their separate
  product review before any live use.
- Browser results are local Chrome/axe evidence, not a complete manual screen-reader
  or production-environment certification. A Next development warning about the
  existing root smooth-scroll attribute was informational; it did not fail tests.
- Public release, configured production sign-in exposure, live transactions,
  payment-provider activation and public registration remain outside this work.

Stop for final review. Do not commit, push or deploy without explicit authorization.
