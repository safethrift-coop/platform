# T41 Member Dashboard — reconciled readiness and implementation proposal

Status: approved by the user; implemented and verified locally on 2026-10-26.
Final implementation review is pending; see `T41-dashboard-implementation.md`.
Inspected application baseline: `dd76cd716c13ebec6ada382fa41df8688297ced0`.
This document preserves the approved proposal. Implementation details, changed
files, exact results and limitations are recorded in the implementation report.
No commit, push, deployment, schema migration or live activation was performed.

## Authoritative requirements

The user supplied the recovered original entry:

> Build member dashboard — accounts and transactions. Protected route (JWT required). Dashboard: savings points total, active accounts summary, recent transactions, current risk band (low/moderate/high). Account detail: balance, transaction history (cursor paginated, load more), deposit form, withdrawal form. All amounts formatted with Intl.NumberFormat for GBP.

Dependencies: **T25 and T26**. T37 authentication and T40 registration restrictions
remain binding integration constraints.

The earlier assessment's missing-requirements prerequisite is resolved by this
entry. Its statement that T41 must be entirely read-only is corrected: T41 includes
forms, but they may submit only explicitly enabled T25 development/test simulations.
Default and production/staging financial operation remain disabled. Historical
unknown provenance must never be treated as settlement evidence.

The earlier loan discovery, loan schedule, membership workflow and points-breakdown
findings are excluded from T41 implementation. No loan UI, points history, profile
editor, account-opening form, membership/fee workflow, score computation control,
notification UI, earnings, borrowing eligibility or payment integration is added.

## Requirement-to-implementation mapping

| Original requirement | Existing foundation | Bounded implementation |
| --- | --- | --- |
| Protected route, JWT required | T37 JWT guards, login, cookie refresh and Redis CAS; T40 memory-only session patterns | `/dashboard` and `/dashboard/accounts/[accountId]`, with a dashboard-scoped session provider and sign-in state; API remains the authorization boundary. |
| Savings points total | `Member.savingsPointsTotal`, updated by T25's atomic receipt/increment path | Read the stored total; no recomputation from deposits or inferred historical awards. |
| Active accounts summary | Member-scoped `GET /accounts` | Dashboard projects only owned active savings FSA/RSA/GSA rows, with exact recorded balances and explicit settlement limitations. |
| Recent transactions | Separate savings and withdrawal tables | Bounded newest-first list across the member's savings accounts, using the same normalized feed and ordering as account history. |
| Current risk band | T26 stores `Member.currentRiskBand`, default `unscored` | Map stored low/moderate/high enums to labels; show unscored and failed/unrecognized data distinctly. Never compute a score on visit. |
| Account detail balance | Owned `GET /accounts/:id` | Minimal typed detail with recorded balance, account type/status and limitations; backend checks ownership. |
| Cursor history, Load More | Existing endpoint repeats withdrawals and cursors deposits only | One stable keyset feed spanning both tables, validated cursor/limit, explicit `nextCursor` and `hasMore`. |
| Deposit form | T25 exact-decimal DTO, idempotency and simulation gate | Accessible simulation form using existing deposit endpoint; disabled unless backend capability and local preview permit it. |
| Withdrawal form | T25 ownership, membership, account status, sufficient-balance and GSA checks | Accessible simulation form using existing withdrawal endpoint; preserve all existing server checks and uncertain-outcome replay behavior. |
| GBP formatting | No shared dashboard formatter | One `Intl.NumberFormat('en-GB', {style:'currency', currency:'GBP'})` display formatter for all monetary values. |

## 1. Authentication and route behavior

Keep the existing public shell, responsive styles, icons and focus treatments.
Add a small dashboard client layout/provider shared by the two dashboard routes.
No new authentication storage model, signing scheme, BFF, session table or cookie
is introduced.

Unauthenticated dashboard navigation shows a scoped sign-in state with no private
data. It calls the existing `/auth/login`; the returned access token remains in
memory. Bootstrap identity from authenticated `/members/me`, not fixture-only
`/membership/application`; the returned member ID is the refresh locator. A failed
bootstrap clears the session. A direct account-detail visit signs in within the
same dashboard flow and only preserves a validated same-origin dashboard path.

Use the proven T40 refresh/generation patterns in a dashboard-specific client,
without changing the registration client. Keep credentials included, requests
no-store, one refresh for concurrent 401s, one retry, and generation checks on all
late results. A first bootstrap failure requiring refresh before a locator exists
returns to sign-in. Provider navigation retains the memory session; reload requires
sign-in again, as in T40. No localStorage/sessionStorage token or locator.

Preserve T37's 15-minute access JWT, seven-day HttpOnly refresh cookie,
SameSite=Strict, production Secure flag, cookie path, Redis CAS rotation and one
refresh slot per member. Clear local data immediately on logout/member switch;
call existing logout. Do not claim immediate revocation of issued access JWTs.

The existing `/login`, `/register`, `/verify-email` gates remain unchanged. A
sign-in state for existing members on the protected dashboard does not create an
account or submit an application. No registration link bypasses T40. No public
navigation or sitemap addition, public launch, or deployment is part of this work.
Dashboard metadata is noindex/no-referrer; authenticated read responses use
`Cache-Control: no-store` and do not enter shared caches or static generation.

## 2. Minimal backend contract changes

Reuse existing members and savings modules. No new schema or migration is expected.
All private endpoints require JWT and derive identity from `CurrentMember().sub`;
no client-selected member ID is trusted.

- Add `GET /accounts/overview` before the `:id` route, returning a minimal typed
  projection: stored points total, stored current risk band, owned active savings
  accounts, a small recent-transaction page and simulation capability. This is
  the single dashboard read, not a generic reporting or aggregation platform.
  Recent transactions cover owned savings accounts, with their account type/status
  identified; the active-summary filter does not erase historical activity.
- Keep existing `GET /accounts` behavior for compatibility. Add safe, additive
  display/capability fields to the owned account-detail response and consume only
  explicitly selected fields in the UI. Do not expose raw metadata, staff IDs,
  personal notes, signatures or registration snapshots through new projections.
- Repair `GET /accounts/:id/transactions` with a normalized `items` array and
  coherent cursor. Retain `deposits` and `withdrawals` as compatibility projections
  of that same page if needed; document that their old independent-page behavior
  is corrected. Existing deposit-ID cursors are superseded by the versioned cursor;
  reject legacy/malformed cursors with 400 rather than silently returning page one.
  The inspected frontend has no existing consumer of the broken history contract.
- Continue existing deposit/withdraw POST payloads, response/replay contracts and
  `Idempotency-Key`. No new financial write endpoint or financial algorithm.
- Apply explicit no-store behavior to the identity bootstrap and T41 read routes.

Proposed transaction item fields: source-qualified identity, account ID/type,
operation, exact decimal amount string, transaction timestamp, recorded status,
provenance and settlement classification. Monetary reads use decimal strings;
JSON numbers and client arithmetic do not become a financial source of truth.

## 3. Points and T26 risk band

Read `Member.savingsPointsTotal` as the authoritative stored aggregate maintained
by existing awards. Do not sum deposit amounts, call the approximate breakdown,
recompute rates, sum receipts to replace historical totals, backfill awards or
change receipt/idempotency behavior. Label it Savings Points, not cash or earnings.
A stored zero is displayed as zero; failed reads are unavailable, never zero.

T26 writes `currentRiskBand` when saving a computed score. Read that stored field:
`low_risk` → Low, `moderate_risk` → Moderate, `high_risk` → High. `unscored` →
Not yet scored. Missing/unrecognized contract values or read errors → unavailable,
not Low or High. Do not supply a default risk band or invent a scoring threshold,
refresh interval, score-expiry rule or eligibility policy. Dashboard reads never
call either scoring-compute endpoint and do not expose probabilities or features.

## 4. Financial provenance and account summaries

Display each active savings account and its recorded balance, not an aggregate
available-funds claim. At account and summary level use explicit wording such as:
“Recorded balance — settlement unverified; may include simulation records.”

An account has no provenance field and may contain opening/historical adjustments.
Do not label its entire balance simulated merely because all visible transactions
have simulation flags. No settled total, withdrawable amount or earnings is inferred.

Classify individual transactions conservatively:

- `isSimulation=true`: simulation; no external settlement.
- Null or false without independently established settlement evidence: settlement
  unverified. Null remains unknown historical provenance, not live money.
- Recorded `completed`/`approved` status never changes that classification.

Keep recorded status separate from settlement. T38 evidence is not settlement
proof and is not queried or activated for T41. GBP is the display denomination
explicitly required by T41; no currency conversion or multi-currency support is
introduced. Formatting a value as pounds does not validate its provenance.

Pending members retain existing authenticated-read behavior; show pending status
as context, with no account creation or implied approval. Simulation writes still
require active membership under T25. Suspended/closed/missing accounts follow
existing authentication rejection. Do not add an active-membership read gate or
change membership eligibility. Closed/inactive account detail may remain readable
if owned, while its mutation controls remain disabled.

## 5. Correct transaction pagination

Use a shared member/account-scoped feed query for deposits and withdrawals,
implemented with parameterized SQL through Prisma (or equivalent bounded merge
queries). No unbounded full-history fetch or in-memory pagination.

Order by `(transactionDate DESC, source ASC, id DESC)`, with a fixed source ordering.
Source-qualified IDs prevent collisions between tables. Every query branch filters
by authenticated member and the authorized account where applicable, and joins
only that member's savings accounts. Check parent ownership before history reads.

Use an opaque, bounded, versioned cursor encoding the account/feed scope and last
ordering tuple. Fully validate it; encoding is not authorization. Reject invalid
scope or source values and foreign-account cursors without returning foreign data.
Use strict integer limits, default 20, maximum 50; reject malformed/out-of-range
inputs rather than accepting partial `parseInt` values.

Fetch `limit + 1` across the unified feed, emit at most `limit`, and derive
`hasMore`/`nextCursor` from the extra row. Tie timestamps and identical IDs in
opposite tables must not skip or duplicate rows. Newer inserts appear after an
explicit refresh; Load More continues strictly below its cursor. This is keyset
continuation, not a claim of an immutable historical snapshot.

The client appends by source-qualified ID, prevents overlapping Load More requests,
keeps loaded rows if a later page fails, and resets pagination on account/member
change or successful simulated mutation. Use the identical query ordering for the
bounded dashboard recent list; a separate recent-activity page is not added.

## 6. Simulation-only deposit and withdrawal forms

Preserve `requireSavingsSimulation()` as the final authority on every POST:
`NODE_ENV` must be development/test and `SAVINGS_SIMULATION_ENABLED` must equal
literal `true`. Its default remains false. Staging/production cannot mutate even
if someone sets the flag. No configuration is enabled as part of implementation.

The backend returns operation capability based on this exact gate and existing
member/account/GSA eligibility. The UI defaults to disabled until that response
succeeds. Enabled forms additionally require a local development preview; a public
build-time flag alone never enables them. Treat capabilities as advisory: the
server rechecks gate, authorization and eligibility at execution, including when
an environment/account change makes a previously enabled page stale.

When disabled, show the required form sections with disabled controls and a clear
simulation-unavailable explanation. Do not issue a mutation request. When enabled
in isolated local fixtures, label buttons “Simulate deposit”/“Simulate withdrawal”
and clearly state that no external money moves. Test services are isolated from
any future live database; NODE_ENV is not proof of database isolation.

Keep amounts as exact decimal strings; validate against existing T25 bounds
(greater than zero, at most 10000.00, maximum two decimals). Preserve note/reason
bounds, ownership, active membership/account, account type, sufficient recorded
balance and existing GSA once-reached logic. UI validation does not replace the
server's transactional checks. No account opening or new eligibility rule.

Create one idempotency key for each intentional operation. Block double submission.
Freeze payload/key after uncertain transport or 503 outcomes; retry unchanged with
the same key. Do not manufacture a replacement operation or claim failure when
commit status is unknown. A changed payload cannot reuse that key. An explicit
conflict is not success. A successful response/replay refreshes displayed balance,
activity and stored points; delayed/failed points processing is not optimistically
awarded by the UI. Mutation responses remain simulation/not-settled.

## 7. GBP formatting and accessible states

Use a shared GBP formatter with `Intl.NumberFormat` for balances, transaction
amounts and monetary validation/success values. Keep integer points separate from
money. Preserve decimal strings for requests and calculations. Use exact decimal
string formatting support in the supported runtime (or an exact decimal-parts
adapter); verify browser/server output at the database's maximum precision rather
than silently rounding financial input through binary floating-point conversion.

Proposed bounded UI components: dashboard session boundary; points/risk summary;
active-account list; recent-transaction list; owned-account panel; reusable
transaction list with Load More; deposit and withdrawal simulation forms; shared
loading/error/empty/status presentation. Reuse the existing visual design and
installed form/validation libraries. No chart library or new dependency is needed.

Provide accessible initial loading, per-section errors, no accounts/no activity,
pending membership, unscored/unavailable risk, disabled simulation, validation,
submitting, uncertain outcome, success, expired-session and forbidden/missing-account
states. Errors do not become zero balances. Retain safe successful reads on a
Load More error; label stale data during a refresh failure. Clear all private data
on sign-out or member change. Use labelled fields, associated errors, live status
announcements, keyboard focus handling and mobile layouts. Never distinguish risk
or transaction status by color alone.

## 8. Verification and acceptance criteria

After approval, implement and validate in this order:

1. Typed member-scoped read projections and unified pagination; unit and real
   PostgreSQL tests before wiring the UI.
2. Dashboard session boundary and protected route/account navigation; real JWT,
   Redis refresh and two-member isolation tests.
3. Summary/detail/history rendering, stored risk/points, provenance and GBP.
4. Gated simulation forms against existing POSTs, then browser journeys and the
   full preservation checks. No flag activation outside synthetic test processes.

Required checks:

- Two members: no cross-member overview, account, history, cursor or mutation
  exposure; spoofed member inputs do not select identity. Real JWT guards remain
  enabled. Missing/expired/forged tokens and revoked member states are covered.
- Cursor tests: deposit-only, withdrawal-only, mixed, empty, exact page boundary,
  tied timestamps, colliding IDs, more than two pages, malformed/foreign cursors,
  invalid limits and newer insertion between pages; no duplicates/omissions of
  stable rows. No unbounded reads.
- Stored points tests: total differs from the old estimated breakdown, zero-point
  receipts, historical values and failed/delayed awards; T41 neither awards nor
  reconstructs points. T26 enum mapping, unscored, unknown value and read failures;
  no score-computation writes on visit.
- Provenance tests: simulation, null/false historical markers, mixed accounts,
  opening balances and processing statuses; none becomes settled/available funds.
  GBP formatting includes pennies, zero, large supported values and failed reads.
- Gate matrix: absent/false flag, development/test true, staging/production true,
  capability failure, runtime gate revocation, forged POST, inactive membership,
  wrong owner, insufficient balance and GSA restriction. Disabled UI emits no POST.
- Idempotency: double click, unchanged retry after lost response, same key with
  changed body, concurrent writes and authoritative balance/points refresh.
  Preserve T25 atomicity, rollback, concurrency retry/backoff and audit safeguards.
- Session races: parallel 401s, one rotation, failed refresh, logout/member switch,
  late response, reload and direct protected account URL. No persisted tokens,
  personal URL parameters, private cached HTML or indexable member pages.
- Browser checks: keyboard, focus/error associations, axe, responsive overflow,
  loading/empty/error/disabled states, Load More retry and synthetic form success.
- Run API build/unit/e2e, web typecheck/lint/build, public/T40 closed-route and
  registration browser regressions, T36 reminders and T38 webhook regressions.
  Confirm dashboard GET visits have no financial/scoring/notification writes.

## Approval boundary and remaining decisions

The authoritative scope is now known; no extra financial/product decision is
needed to default to recorded/unverified balances, stored points, stored risk,
existing membership eligibility and disabled simulation controls. Historical
settlement validation, points reconciliation, scoring policy and live operation
remain outside T41. No fee, yield, cash value, eligibility, renewal or new
membership policy is introduced.

The user approved this bounded implementation proposal. Public release,
production exposure, provider activation and live financial operations are not
part of it. Keep T36/T38 defaults and T40 registration/fixture restrictions intact.
Do not commit, push or deploy. The approved application work is complete locally;
stop for final review.

## Assessment evidence and limits

Reconciled against the user-supplied original T41 entry and inspected savings,
points, members, scoring, auth, registration and schema source. Existing T26 code
explicitly maintains the current-risk cache for dashboard reads. T25 remains the
source of mutation validation and transactional policy. Existing T37/T40 source
and regression evidence inform the proposed session integration.

The approved proposal has now been implemented and tested locally. The separate
implementation report records actual T41 checks rather than relying on earlier
milestone results.
