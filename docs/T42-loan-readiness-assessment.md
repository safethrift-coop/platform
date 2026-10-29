# T42 loan application and repayment view — readiness assessment

Date: 2026-10-27. Inspected baseline: `585949b54564a07b701b7f1464a86ea82f5d368e`
(T41 member dashboard). Status: reviewed proposal; conditionally authorized technical
foundation implemented locally. See `T42-loan-implementation.md` for current changes,
verification and limits. Findings below describe the inspected baseline. Broader
execution/migration proposals remain unapproved; no financial capability is enabled.

## 1. Authoritative roadmap and requirement mapping

Source: the user's recovered original entries, supplied verbatim in the T42
scope reconciliation request on 2026-10-27. These resolve the previous roadmap
retrieval blocker and supersede the earlier provisional exclusion of admin UI.

**T42 — Build loan application flow and repayment view**

> Loan application: eligibility summary (points, risk band), requested amount slider (capped at points multiple), purpose field, submit. Application status page. Active loan detail: principal, schedule table, repayment form. Repayment history. Admin: loan application review queue with score + probability displayed.

Dependencies: **T27, T34, T41**. These remain unchanged. T26 contracts are inspected
integration foundations, not replacement roadmap dependencies. Existing source is
not proof that T27/T34 have passed all acceptance checks; verify those foundations
within the T42 verification scope before enabling any synthetic write.

**T43 — Build admin portal**

> Role-gated to STAFF and above. Sections: Membership queue (approve/reject with notes), Member management (search, view profile, view KYC status, freeze), Loan queue (review application, score, probability, savings history), Compliance flags (view, resolve, add notes), BullMQ board at /admin/queues (visual job monitoring).

Dependencies: **T23, T24, T27, T35, T31**. These remain unchanged. Per the user's
infrastructure correction, historical BullMQ wording is a legacy implementation
specification: the job-monitoring function remains T43 and must monitor existing
PostgreSQL/pg-boss infrastructure. No BullMQ or Redis job queues will be added.
Redis's existing authentication role is preserved, as detailed in section 12.

| Original T42 requirement | Concrete proposed implementation | Safety/acceptance boundary |
| --- | --- | --- |
| Eligibility summary: points, risk band | `/dashboard/loans/apply` reads authoritative stored member points and cached band through a minimal capability contract. | Distinguish unscored/unknown/errors; no recomputation, cash value, guaranteed approval or settled-savings claim. |
| Requested amount slider, capped at points multiple | Labelled range plus synchronized exact-decimal amount input; server supplies a versioned points-based cap, step and minimum from approved policy or explicit synthetic fixture policy. | No approved multiple exists. Keep range and submit disabled with cap unavailable until policy exists. Legacy balance/risk formula does not satisfy this requirement. |
| Purpose field | Labelled trimmed nonempty purpose with associated validation; retain existing 500-character bound pending policy confirmation. | No persistence until gated submission is authorized. |
| Submit | Existing apply route hardened with server capability/gate, transactional checks and durable payload-bound idempotency; form submits only a synthetic application in an isolated opt-in preview. | Preserve active membership and verified email; unresolved policy/KYC/scoring prevents enablement. No live loan origination. |
| Application status page | `/dashboard/loans/applications/[applicationId]`, reached from bounded owned application discovery and a confirmed synthetic submission. | Member-safe fields, immutable snapshot context, linked owned loan ID, no internal decision notes or invented decision deadline. |
| Active loan detail: principal | `/dashboard/loans/[loanId]`, discovered through owned loan list/application link; principal is an exact decimal string formatted in GBP. | Recorded principal and loan status; disbursement/settlement unverified unless independently evidenced, never available cash. |
| Schedule table | Owned table of installment number, date, principal/interest/total due, recorded paid amount and status. | Render stored data without repairing history on read; inconsistencies are visible and block synthetic posting. No new fee/interest policy. |
| Repayment form | Amount field, explicit simulation copy and submit/retry states on detail; default disabled. | Only an approved synthetic capability reaches remediated repayment logic, never unsafe legacy writes or external collection. |
| Repayment history | Owned stable cursor feed on detail with Load More, amount/date/recorded status and provenance. | Parent and child ownership; processing and settlement separate; historical rows remain unknown. |
| Admin loan application review queue with score + probability | Bounded `/dashboard/loan-review` interface and `/loans/admin/queue` projection; application-time score/probability plus timestamp/model context where available. | JWT plus existing Staff/Admin server guards; null is unavailable, never zero. Read-only review in T42; no approval/disbursement activation. T43 reuses this surface (section 7). |

Every original item remains in scope. Disabled controls preserve the required
surfaces but do not by themselves satisfy working submission acceptance. Approval
must explicitly accept synthetic/test-only execution and any policy-blocked
controls; unresolved items remain incomplete rather than silently deferred.

## 2. Endpoint and ownership inventory

All paths below are under `/api/v1`. Evidence:
`apps/api/src/modules/loans/loans.controller.ts` and `loans.service.ts`.
The controller has class-level `JwtAuthGuard`.

| Route | Current behavior | Authorization and contract findings |
| --- | --- | --- |
| POST `/loans/apply` | Eligibility checks, then pending application creation | Identity from JWT `sub`; no client member selector. No application idempotency or financial-operation gate. |
| GET `/loans/me` | All applications, newest application date first | Filters `memberId=sub`; returns raw application rows, including reviewer ID/decision notes. Unbounded, no explicit no-store header; no linked loan ID. Despite its name, this is not a loan list. |
| GET `/loans/:id` | Raw loan row | Verifies parent member ownership; foreign ID returns 403, missing ID 404. No explicit no-store header or settlement classification. |
| GET `/loans/:id/schedule` | All schedule rows by installment number | Verifies parent ownership before child read. Schedule has no separate member ID. No explicit no-store header or normalized public projection. |
| POST `/loans/:id/repay` | Records completed repayment, updates schedule and sometimes completes loan | NEW requests verify loan ownership. Existing idempotency-key lookup returns before that verification; see section 5. Missing key is generated server-side. |
| GET `/loans/admin/queue` | All pending applications, oldest first | JWT plus Staff/Admin role guard; intentionally cross-member administrative access. Raw, unbounded rows; no explicit no-store. |
| PATCH `/loans/admin/:id/approve` | Approves application, creates active loan/schedule and sends notification | JWT plus Staff/Admin. Service is privileged and relies on controller guard. No live/simulation gate or decision DTO. |
| PATCH `/loans/admin/:id/reject` | Rejects pending application and sends notification | Same roles. Decision notes extracted directly rather than validated DTO. No atomic pending-state claim. |

There is no dedicated member application-detail, member loan-list, eligibility or
repayment-history route in this controller. `getLoan` does not include transactions
or application linkage beyond stored IDs; the member list does not supply the
linked loan ID needed to navigate to approved loan detail.

`apps/api/src/core/strategies/jwt.strategy.ts` rejects invalid/expired JWTs and
reloads member existence/status. Suspended/closed members cannot authenticate;
pending members can authenticate. Admin authority is refreshed from `isAdmin`;
legacy signed staff/compliance/board claims retain existing policy. `RolesGuard`
checks the resulting role against Staff/Admin. Do not infer that a valid member
session authorizes approval. Current token issuance uses trusted admin/member
authority; no new staff provisioning or role policy belongs in a member view.

## 3. Points, risk and safe eligibility information

Evidence: `modules/points/points.service.ts`, `modules/scoring/scoring.service.ts`,
`modules/scoring/scoring.controller.ts`, T41 `account-reads.service.ts`,
`apps/web/src/lib/dashboard-display.ts`, and Prisma schema.

- `Member.savingsPointsTotal` is the stored aggregate. T25 awards use committed
  simulation events, unique receipts and atomic increments. It is not cash,
  settlement, an approved credit limit or proof of live savings.
- `/points/me` returns this aggregate plus a deposit-derived estimated breakdown.
  That breakdown does not reproduce per-deposit floors/GSA historical milestone
  awards. Its missing-member fallback is zero. Reuse T41's minimal authoritative
  aggregate read rather than importing that fallback or displaying an estimated
  breakdown as eligibility evidence. `/points/me/history` is recent deposit
  activity, not an authoritative points-award ledger.
- `Member.currentRiskBand` is the stored cache used by T41 and current loan
  application logic. Map low/moderate/high and distinguish unscored/unavailable.
- `/scoring/me` reads latest saved RiskScore and associated features, with
  probability, model version and scoredAt; no score returns unscored/null.
  It may differ from the cached member band in inconsistent historical data.
  Do not silently combine them or invent a freshness guarantee.
- `/scoring/me/compute` writes snapshots/scores/member cache. Admin
  `/scoring/compute/:memberId` is Staff/Admin guarded. Neither should be called
  by a view or used to manufacture eligibility on page visit. Feature computation
  uses completed savings/withdrawal records without settlement exclusion.
- Safe proposed display: stored points, stored risk band, membership/email facts,
  owned application state and recorded loan/schedule/history facts. Label current
  versus application-time snapshots distinctly; nullable snapshots stay unknown.
  Current application creation only snapshots points and risk band, not the
  schema's behavioural score or probability fields.

No authoritative approved eligibility endpoint exists. Do not display “eligible”,
“you can borrow £X”, guaranteed approval, a decision deadline or settled repayment
capacity from these facts. Recorded balances may include simulations or unknown
historical records. A capability response can say an operation is unavailable
without claiming an underwriting decision. Read failures must not become zero
points, low risk, rejected eligibility or no loan history.

## 4. Current application constraints and policy gaps

The application DTO accepts a JSON number with at most two decimals, £50–£5,000;
integer term 3–36 months; string purpose at most 500 characters. Empty/whitespace
purpose is not excluded. Global ValidationPipe whitelists, forbids unknown fields
and transforms; these existing bounds are code facts, not newly approved policy.

`applyForLoan` requires active membership, verified email, at least 100 stored
points, no loan in active/disbursement_pending, positive total recorded balance
and requested amount within its computed maximum. It sums ALL active account
types, including loan/shares/emergency fund, rather than only savings FSA/RSA/GSA.
It uses multipliers low=2, moderate=1.5, high=1, unscored=0.5, with a 0.5 fallback.
These constants exist in code; no business approval for them was established.
Do not duplicate, endorse or alter them in the UI without policy authorization.

It does not query KYC, require a saved score, enforce score freshness, prevent
multiple pending applications or atomically serialize concurrent application
checks. There is no idempotency key. A dropped successful response can create a
second application on retry. Creation and eligibility reads are not one consistent
transaction. Its response promises a decision within two working days without an
established approved service commitment.

KYC schema has multiple attempts, status, document expiry, proof-of-address status,
risk flag and verification dates. Source search found no application use of this
data and no implemented KYC verification workflow in the inspected API modules.
Email verification is not KYC. “Any verified row” is not a safe invented policy:
current attempt selection, expiry, address requirements and risk-flag treatment
need an authoritative decision. Missing KYC remains unknown, not verified.

## 5. Approval, repayment and external settlement blockers

These are source findings, not reproduced exploit or concurrency test results.

1. **Repayment replay authorization defect:** a global lookup by idempotency key
   returns an existing transaction before loan existence/ownership or payload
   checks. A member possessing another repayment's key can receive its raw row;
   the same key on another loan/body can replay an unrelated operation. Fix before
   connecting any form. A key is not authorization.
2. **Unverified financial posting:** repay accepts an amount and directly creates
   `paymentStatus=completed`, `paymentChannel=web_portal`, changes totalPaid/status
   and may complete the loan. There is no collection, bank verification, provider
   linkage, provenance marker, simulation gate or settlement evidence.
3. **Concurrency/atomicity:** loan and next installment reads occur before the
   transaction; concurrent requests can use the same stale totalPaid and lose an
   update. Same-key concurrent requests can hit a unique constraint without a
   stable replay response. Loan completion check/update happens after commit and
   can fail separately or race. Initial and replay response shapes differ.
4. **Allocation:** the entire amount goes to one due/partial/late installment;
   surplus does not distribute across remaining installments. Missed installments
   are excluded from allocation but counted outstanding. No remaining-debt bound,
   overpayment policy or no-schedule safeguard exists. A loan with no outstanding
   rows can be marked complete after recording an unallocated payment.
5. **Approval creates financial records:** approval sets loan active despite the
   schema default disbursement_pending, without a disbursement check/date. Loan
   account creation/balance occurs outside the application/loan transaction;
   existing loan account balance is not refreshed. Eligibility is not rechecked.
   Concurrent approve/reject decisions have no atomic pending-state claim.
6. **Schedule arithmetic/dates:** equal rounded installments may not sum to
   principal (for example £100 / 3 becomes £99.99). Repeated JavaScript setMonth
   can drift at month ends; maturity and installment dates can diverge. Residual
   pennies, calendar anchoring and timezone handling need an approved rule.
7. **Post-commit notifications:** approval/rejection awaits email after state
   change. Notification failure may make a committed decision look unsuccessful;
   blind retry is not a safe recovery strategy.

Prisma `RepaymentTransaction` has no isSimulation or settlement-proof fields.
`completed`, referenceNumber, channel, paidDate, active loan status and non-null
disbursementDate alone do not prove collection/disbursement. Historical rows must
remain “recorded; settlement unverified”, not be relabelled simulated or settled.
Loan principal/account balance is not available cash. Any calculated remainder
must be explicitly recorded schedule arithmetic, not a verified payoff quote.

T38 retains provider observations for evidence review and does not authorize loan
posting. Do not query that evidence to infer repayment settlement, activate its
providers/workers or add financial mappings as part of this view.

## 6. Application and repayment capability proposal

Implement both required forms and the amount slider. Default capability is denied
by the server, independently of frontend configuration. Proposed loan-specific
simulation opt-in is separate from T25 and accepted only in development/test,
with an explicit isolated test-database allowlist/identity and synthetic
member/loan markers. Fail closed for absent/malformed configuration, unknown
provenance, mixed live/history records, staging or production, even if a flag is
true. The frontend additionally requires local development preview plus the
server's operation/resource capability. No checked-in flag enables anything.

Harden and gate the existing `/loans/apply` and `/:id/repay` routes before wiring
forms; do not leave an alternate ungated write route. Gate the legacy admin
approve/reject writes against unverified origination too; T42 adds no approval
controls. This server remediation is part of the proposed scope, pending approval.
Synthetic active loans/schedules for browser tests are seeded through test-only
fixtures, not by enabling the unsafe production approval path.

Capabilities return `allowed`, mode, reason codes and policy version for the
current authenticated member/resource. Application capability also returns
points, band and an approved cap or null; repayment capability reports the
synthetic loan and allocation-policy identity. They are advisory: mutations
recheck configuration, current membership/email rules, scope, synthetic identity,
policy and financial invariants transactionally. Reads never create scores,
applications, loans, schedules or jobs.

A submission is labelled a **test application**, never a credit offer. A repayment
is labelled **simulation — no money collected**; processing success does not
become settlement. No optimistic points, schedule, principal or balance changes.
Transport/5xx uncertainty retains one exact body/key in provider memory and offers
only unchanged retry. A successful response/replay refreshes authoritative reads.
Logout/reload memory limitations and uncertain-outcome warnings remain explicit.

The proposed additive migration stores durable loan-operation receipts, provenance
and allocation evidence (section 13). Historical null values are preserved; no
backfill infers simulation or settlement. Default forms remain disabled until
policy and backend prerequisites pass. Synthetic fixture values must be labelled
as test policy, provided only by isolated test configuration and never exported
as approved lending rules. No interest, fee, limit, KYC or settlement policy is
chosen by this proposal.

## 7. T41 session reuse and bounded T42 administrative interface

Member routes remain under the T41 dashboard provider. Reuse its memory token and
member locator, `/members/me` bootstrap, shared refresh, one retry, generation
checks, logout clearing and uncertain-attempt memory. Preserve T37 refresh-cookie
attributes, lifetimes, Redis CAS rotation and single-slot limitations. Reload
requires login. Do not add browser storage or credentials to URLs.

Extend the session's path/method allowlist narrowly for approved loan reads and
synthetic apply/repay. Add a distinct privileged read entry for the review queue;
ordinary member requests receive server 403. No general API proxy, scoring compute
or admin mutation paths. Loan-specific error copy must preserve uncertain results
rather than translate all errors to rejected payments. Attempt identities are
namespaced by member, operation and loan/application; late reads/replays after
logout or member switch are discarded. Retain T41 configuration checks, dynamic
private shells, noindex/no-referrer and no public sitemap/navigation exposure.
Member navigation may link to loans; an authoritative private capability may
expose the review link to authorized reviewers. Hidden links are not authorization.

T42 includes a **read-only application review queue** with a selected-application
panel, amount/purpose/status, application-time points/risk/score/probability and
available model/timestamp/source context. Both list and panel use explicit
Staff/Admin backend authorization. Paginate the queue; do not send raw member/KYC
records, internal notes or financial keys. Snapshot score/probability are labelled
application-time. Legacy applications with null snapshots show unavailable; no
fabricated zero or retrospective snapshot. If a current saved score is shown,
label it separately with its date/version and never replace the snapshot or invoke
compute. Snapshot binding for new test applications is covered in section 13.

This delivers T42's administrative review requirement without claiming that
“review queue” authorizes loan approval or disbursement. No approve/reject controls
are proposed for T42: its text requests the queue and score/probability display.
T43 extends/reuses this queue in its role-gated portal with savings history and
broader review workflows. Membership management, KYC administration, freezing,
compliance resolution and `/admin/queues` remain T43 functions. Preserve their
functional requirements, with pg-boss monitoring replacing historical BullMQ
implementation wording. No new roadmap stage or independent admin framework.

The existing role guard explicitly accepts Staff/Admin, not an ordinal “and above”
comparison. Do not infer that compliance/board roles outrank staff. T42 retains
this existing authorized set; T43's wider role hierarchy is a decision to reconcile
without new grants. Login/refresh currently issue member/admin only; use existing
trusted admin authority or legitimate signed staff fixtures for tests, never add
role input/provisioning. Current admin revocation must continue to take effect on
request validation. Legacy signed staff-claim handling remains unchanged and is
documented as a limitation, not a newly immediate staff-revocation guarantee.

## 8. Proposed contracts and validation improvements

These technical changes are proposed within the reconciled T42 scope, pending approval:

- Minimal member application list with explicit fields and linked owned loan ID,
  avoiding reviewer IDs/internal decision notes. Publishing rejection reasons
  requires a deliberate member-visible field/policy.
- Member-owned loan list/detail, schedule and repayment-history projections with
  fixed two-decimal strings, ISO dates, recorded statuses and explicit settlement
  unverified classification. Join/filter parent AND transaction member ownership;
  validate schedule linkage so malformed historical child rows cannot leak.
- Bounded stable cursor pagination for unbounded application/loan/history lists;
  strict limits, versioned bounded cursors scoped to member and loan/feed, stable
  date/ID ties, limit+1, consistent nextCursor/hasMore. Verify parent before child
  queries. Schedules are small for current 36-month DTO but historical data cannot
  be assumed bounded solely by today's DTO; define a safe response limit/contract.
- Explicit `Cache-Control: private, no-store` for loan/eligibility reads; no raw
  metadata, idempotency keys, staff IDs or KYC documents in member responses.
- If approved, a shared backend capability/preflight projection reports known
  facts and unavailable reasons without underwriting promises. Actual POST must
  repeat checks transactionally; preflight is advisory.
- Before any writes: exact bounded decimal-string DTOs through persistence,
  integer term validation, trimmed nonempty purpose, strict bounded decision DTOs
  for any approved admin scope. Version/document number-to-string compatibility;
  preserve existing bounds pending business decisions, rather than choosing new
  amounts/fees. Reject exponent/NaN/infinite/malformed financial input.
- Require a bounded client-generated idempotency key; scope a durable receipt to
  authenticated member, operation and resource, bind normalized payload hash,
  authorize BEFORE replay, return identical persisted response, reject changed
  payload/scope, handle concurrent unique conflicts and uncertain outcomes.
  Application submission also needs duplicate protection. Loan creation/decision,
  allocation and completion require consistent transactional concurrency control,
  bounded conflict retry and durable audit/provenance if enabled.

## 9. Safety blockers and decisions requiring approval

The original roadmap is now known. Remaining decisions are business/security
boundaries, not missing milestone text:

| Decision | Approval required before enablement | Behavior while unresolved |
| --- | --- | --- |
| Points-multiple cap | GBP-per-point conversion/multiple, minimum, maximum, step, rounding and zero/unscored handling; relationship to legacy risk multipliers and balance rules. | Show stored points/band; cap unavailable, slider/submit disabled. No numeric default. |
| Lending constraints | Approve or replace legacy 100-point threshold, amount/term bounds, risk multipliers and account inclusion; distinguish synthetic from settled balances. | Legacy constants are not presented as approved. No live eligibility claim. |
| KYC | Authoritative attempt selection, validity/expiry, address/risk-flag requirements and stage at which enforcement is required. | Report unknown/not evaluated; no claim of verified KYC, application capability denied if policy is required but unavailable. |
| Scoring | Required saved score/model, freshness, unscored and cache/snapshot disagreement rules, submission snapshot binding. | Display stored facts; no automatic scoring or eligibility inference. |
| Repayment allocation | Priority, eligible installment statuses including missed, whether to spread across installments, partial/early payment, surplus/refund/unallocated handling and reversal semantics. | Posting disabled. Candidate rules in section 13 are proposals, not adopted policy. |
| Schedule creation | Residual pennies, due-date anchoring, month-end/leap-year/timezone treatment and invariant reconciliation. | Render historical schedules; seed coherent fixtures, do not activate approval generation. |
| Submission semantics | One/multiple pending applications, changes/withdrawal, authoritative rejection messages and post-commit recovery. | No duplicate-policy invention; require an explicit synthetic test policy for enabled demonstrations. |
| T42 acceptance | Accept synthetic-only application/repayment execution and the bounded read-only admin queue; approve schema/route compatibility and default-denial remediation. | Implement nothing until review. Disabled surfaces alone are not claimed as full functional completion. |

There is no proposal to approve interest, fees, live collection, disbursement or
settlement. Existing zero-interest code and two-working-day message are not
business approval. Actual external settlement/reconciliation remains unavailable;
T38 activation is excluded. T25 safeguards, T40 closure and T41 remain intact.

## 10. Verification required after implementation approval

No new test suite was run for this documentation-only source assessment. Existing
T41 evidence is not T42 evidence; no dedicated loan unit/integration suite was
found in the inspected source/test inventory.

**Unit tests:** exact decimal boundaries/GBP rendering, trim/term/key validation,
risk unscored/unknown/error states, nullable application snapshots, historical
settlement labels, public DTO redaction, strict cursors, gate matrix and narrow
session paths. If writes are approved: canonical payload/hash/replay response,
allocation conservation, penny residuals, month-end/leap-year/timezone schedule
generation and notification-after-commit recovery. Policy-dependent expectations
must wait for approved policy.

**Real PostgreSQL/JWT/Redis integration:** missing/forged/expired tokens; missing,
pending, suspended and closed members; two-member list/detail/schedule/history
isolation, spoofed IDs, inconsistent child ownership and linked application/loan
ownership. Replay another member's known key and another loan's key must never
return their row or mutate anything. Exercise Staff/Admin versus ordinary member
for every privileged route using real guards. Verify removed admin authority and
document retained signed staff-claim semantics.

Test stable paging ties, exact boundaries, empty feeds, bad/foreign cursors, newer
inserts and bounded reads; raw fields/keys must be absent and cache headers set.
Check reads do not write scores, loans, schedules, points, reminders or payments.
Test stored points differing from estimated breakdown, zero/unknown states,
cached/latest-score disagreement, missing/expired/multiple KYC attempts according
to approved rules and non-savings/simulated balances never becoming settled limits.

For any approved simulation: default/staging/production refusal even with opt-in,
runtime gate revocation, no writes on denied requests, same-key concurrent replay,
different-payload conflict, dropped-response retry, transaction rollback, distinct
concurrent payments, lost-update prevention, allocation/overpayment/missed/empty
schedule cases, atomic loan completion and exact audit/provenance. T42 must prove legacy admin writes are denied under the default/synthetic-only
boundary. Approval-state creation/notification tests become required only if a
later explicitly approved scope enables those actions; they are not implicitly
authorized by the review queue.

**Browser:** sign-in/direct loan URL, shared dashboard navigation, simultaneous
401 refresh, logout/member switch with late reads, no persisted tokens/private URL
parameters, loading/error/retry/empty states, preserved rows on Load More failure,
GBP/recorded status/unknown provenance and stored points/risk. Disabled forms must
emit no POST. Any authorized synthetic submission must use unchanged key/body on
lost response, block duplicate clicks and refresh authoritative data. Verify
keyboard focus, labels/error associations/live announcements, axe and mobile
overflow. Retain T41 dashboard/savings and T40 closed-route/registration journeys.

Run API build/unit/full isolated e2e, web typecheck/lint/build/production checks,
T25 safeguards and T36/T38 regressions appropriate to the approved changes. If a
migration is approved, test clean install, upgrade, historical null provenance
and Prisma validation. Use isolated synthetic services/data, no reset/Redis flush,
no provider activation, no production database and exact fixture cleanup.

## 11. Historical assessment execution boundary (before implementation authorization)

Only this assessment/proposal document was added and updated on `main`. No application/schema/config changes,
live API mutation, financial posting, provider activation, T25/T38/T40/T41 behavior
change, commit, push or deployment. Earlier GitHub access was read-only. The recovered entries now resolve roadmap
retrieval. This is a requirement-mapped proposal awaiting review, not application
implementation authorization. No T42 implementation test results are claimed.

## 12. PostgreSQL/pg-boss architecture and existing session security

Inspected `core/jobs/jobs.service.ts`, `payment-webhooks/payment-jobs.service.ts`,
`core/redis/redis.service.ts`, `auth/auth.service.ts`, the JWT strategy, and T36/T37
evidence. Job execution uses pg-boss backed by PostgreSQL. Existing services have
explicit pinned schema installation, runtime `migrate:false/createSchema:false`,
transactional enqueue with `fromPrisma(tx)`, bounded backoff, heartbeat/expiry,
retention/dead-letter handling and graceful draining before Prisma disconnect.
Preserve `t36_jobs` and `t38_jobs`, their queue names, migrations, deduplication,
retry limits/delays and feature gates. Do not borrow a reminder/payment queue for
loan work or activate either feature as a side effect of a loan page.

T42 reads and transactional synthetic mutations need no new background job.
Proposed default: no new worker, cron, queue backend or infrastructure dependency.
Do not move request allocation into an asynchronous worker: a transaction must
confirm a durable result before the UI treats it as processed.

If an explicitly approved loan operation later requires deferred notification or
recovery, reuse the established pg-boss library/installation/lifecycle patterns
within existing PostgreSQL infrastructure, with separately named loan queues and
an explicit schema-installation decision. Business write, immutable job payload,
audit and enqueue must commit together through the existing transaction adapter;
failures roll everything back. Durable business receipts survive job retention,
workers are idempotent, uncertain attempts reuse payload/key, retries are bounded,
dead-letter outcomes are visible and shutdown drains before disconnect. No Redis
or BullMQ job queues, additional broker, or unrequested scheduler. Do not start
external notifications from synthetic tests. Such jobs are conditional, not a
new T42 requirement or a new roadmap milestone.

Redis currently stores refresh-token hashes with seven-day TTL, rotates the exact
hash using Lua CAS and supports existing verification/reset/step-up tokens.
Access JWT lifetime remains 15 minutes, cookies retain their existing attributes
and a new login replaces the single member refresh slot. Logout removes refresh
state; issued access tokens retain existing expiry/status checks. T42 does not
replace or migrate that mechanism. Redis integration tests below verify existing
session security; they do not authorize Redis queue infrastructure. The pg-boss
correction applies to background processing, not removal of Redis authentication.

## 13. Concrete technical design for implementation review

### 13.1 Member and reviewer read contracts

All routes require JWT; member scope always comes from `sub`, never a client
member selector. Static route segments precede `:id` handlers. Proposed additive
routes under `/api/v1/loans`:

| Route | Public projection and ownership |
| --- | --- |
| GET `/eligibility` | Stored points, cached band, membership/email facts, `applicationCapability`, policy ID/version and exact cap/min/step strings or null. No KYC documents or invented eligibility result. |
| GET `/applications` | Cursor page of owned application ID/date/requested amount/term/purpose/status, snapshot points/risk and linked owned loan ID. |
| GET `/applications/:applicationId` | Same minimal owned status projection with available public dates; no reviewer IDs/internal notes or promised decision time. |
| GET `/mine` | Cursor page of owned loan summaries with principal/status/provenance and application link. Supports active-loan discovery even if no pending application exists. |
| GET `/:id` | Harden existing detail to an explicit owned projection with principal/term, recorded status, dates, provenance, schedule consistency and repayment capability. Verify member ownership of linked application/account before projecting linked data. |
| GET `/:id/schedule` | Existing route, explicit owned installment projection; deterministic installmentNumber/ID order and bounded continuation for historical oversized schedules. |
| GET `/:id/repayments` | New cursor feed: ID, amount, date, recorded processing status, safe reference, provenance, settlement classification and permitted allocation summary. No request keys/recordedBy. |
| GET `/admin/queue` | Harden existing Staff/Admin route to a bounded queue projection with the score/probability fields specified in section 7. A selected panel can consume its projection; any later detail endpoint gets the identical server guard. |

Preserve `/loans/me` as an explicitly documented compatibility route while new UI
uses `/applications`; do not silently change a raw-array response into an envelope.
Inventory any non-UI consumers before redacting/changing legacy detail/schedule
or queue contracts; use additive fields or a documented migration where required.
No legacy route remains an unguarded alternative. All private reads, including
legacy aliases and reviewer queue, send `Cache-Control: private, no-store`.

Lists return `{items, hasMore, nextCursor}`. Default limit 20, maximum 50; these are
technical resource bounds, not lending policy. Strict integers only. Use stable
`date DESC, id DESC` ordering (queue oldest first with matching tuple continuation),
versioned bounded cursors scoped to authenticated member/reviewer feed and loan,
`limit+1` and parameterized queries. A cursor never grants authority. Reviewer
authorization is rechecked on each page. Schedule continuation uses its own
installment ordering, not transaction dates. Summaries spanning tables use a
consistent read transaction and never infer complete totals from a visible page.

History verifies the loan first, then filters both transaction member and parent
loan ownership. Any non-null schedule link must belong to the same loan; malformed
historical relations are not disclosed as another member's data. Surface an
inconsistency safely and deny posting instead of fabricating an empty history.
Amounts stay decimal strings; dates distinguish date-only due dates from instants.
Use T41's exact GBP formatter within its validated precision bounds.

### 13.2 Slider, KYC and scoring policy adapter

Expose an unavailable policy state rather than deriving a cap in the browser.
The roadmap calls for a points multiple; the current `balance × riskMultiplier`
calculation is a mismatch. A policy record/configuration must explicitly specify
the approved GBP-per-point multiple and cap/min/step/rounding rules, plus whether
any approved independent constraints apply. Do not propose a numeric value here.
Server recomputes the cap at submit from current stored inputs and the selected
policy version; it does not trust the displayed slider maximum. Reject stale
policy/changed inputs with a clear refresh path, without discarding an uncertain
request identity.

Use integer minor units for range position and a canonical two-decimal string for
the request, avoiding fractional binary arithmetic. Provide a synchronized labelled
amount input, GBP output and keyboard-operable range with associated instructions
and errors. If no usable cap or cap below the approved minimum exists, disable
submission with a specific explanation; no hard-coded fallback maximum.

Preserve active membership and email-verification checks. Implement a backend
policy evaluator only after KYC/scoring rules are approved: select the authoritative
KYC attempt, validity/address/risk state and saved model score under those rules.
No authoritative result or policy means capability denied, not “KYC passed”.
Missing/expired scores do not trigger compute from a loan view. Synthetic fixtures
can represent these cases but must never impersonate production KYC approval.

For a new synthetic submission, bind the selected saved score/snapshot ID, score,
probability, risk band, points, timestamp/model and policy version in the same
transaction as application creation. Confirm the score belongs to the member and
agree on cached-band disagreement handling before enabling. Preserve null legacy
application snapshots; current-score display is separately labelled. No fabricated
probability, threshold, freshness interval or model validity assertion.

### 13.3 Authorization and durable idempotency before replay

Proposal: additive `LoanOperationRequest` receipt with authenticated member,
operation, target resource, client key, canonical payload hash, mode/policy version,
immutable response status/body and created timestamp; unique `(memberId, key)`
within loan operations so a reused key with another loan/operation conflicts.
An additional payload resource is bound for apply even before an application ID
exists. This is not a new queue or a replacement for T25 receipts.

Processing order:

1. Verify JWT/current member and route authority; validate bounded key/body.
2. For repayment, load the member-owned loan and validate linked ownership before
   reading/replaying any operation result. Check loan capability/mode for this
   caller. Application replay likewise verifies the resulting application's owner.
3. Within the database transaction and concurrency discipline below, find only
   this member's receipt. Compare operation, loan/resource, normalized payload and
   mode. Mismatch gives generic 409 with no foreign record. Matching receipt
   returns the original safe status/body, even if the successful operation itself
   completed the synthetic loan. Do not re-run new-payment eligibility first and
   accidentally deny a valid replay merely because the loan is now completed.
4. No receipt: revalidate all new-operation eligibility and policy constraints,
   allocate/mutate, record audit/provenance and insert the immutable result receipt
   in one transaction. Roll back all effects on any error.
5. Resolve same-key unique conflicts by rereading the authorized receipt after
   rollback, then compare again; no unhandled unique error and no second mutation.
   Exhausted transient retries return an explicit uncertain/retry-same-key result.

Current member authority and fail-closed deployment gates still apply to replay;
do not return successful private results to suspended/closed/foreign callers or
bypass a revoked environment gate. Old transaction-only keys have no payload-bound
receipt: do not manufacture a replay response or guess an allocation. Authorize
first and return a documented conflict/unavailable response with no mutation;
historical reads remain available through safe contracts. Cross-member reuse may
be independently scoped for an owned resource but can never access the other
member's receipt, even when the literal key matches. A foreign target is denied.

### 13.4 Atomic allocation and concurrency invariants

Use a single PostgreSQL transaction per synthetic repayment, with Serializable
isolation and a parameterized row lock on the parent loan before reading schedule
or totals. Every loan-writing path must respect the same parent lock; application
creation uses a member lock for concurrent eligibility/pending-application checks.
Acquire child schedule locks in stable `(installmentNumber ASC, id ASC)` order.
This lock order is a technical deadlock-prevention rule, not an adopted financial
allocation priority. Bounded serialization/deadlock retries reuse the exact same
operation identity. No external network call occurs inside the transaction.

Within the lock, read all relevant rows and evaluate an approved allocation plan.
Candidate for business review only: oldest installment first, include missed
installments with a positive outstanding amount, apply at most each installment's
remaining amount and spread excess to subsequent installments. Approval is needed
for priority, status/early-payment rules and how a missed row changes state. The
implementation must not adopt this candidate merely because it is described here.
Until approved, allocation capability stays disabled.

Similarly, rejecting an amount above eligible outstanding is a proposed safe
overpayment behavior, not approved refund/unallocated-credit policy. No money is
collected in either case. Without an approved surplus rule, deny the operation
before mutation rather than silently truncate, overpay a row or lose the excess.
Loan with no valid schedule, contradictory totals, reversed/unsupported records
or unresolved missed rows cannot be completed by an empty count.

Persist an allocation ledger linking the synthetic repayment to each affected
schedule row with an exact decimal amount; unique repayment/schedule pair and
parent ownership checks. Atomically persist repayment, allocation rows, schedule
totals/status/dates, loan processing state, audit and immutable response receipt.
Proposed invariants, subject to approved allocation semantics:

- Sum of allocations equals accepted synthetic amount; no unexplained remainder.
- Allocations are positive and cannot exceed the eligible remaining row amounts.
- Recorded paid totals are exact; no floating-point conversion or lost increment.
- All allocations, transaction and schedules refer to the same owned synthetic loan.
- Recorded completion requires a nonempty coherent expected schedule, approved
  principal/schedule reconciliation and zero remaining amounts on every relevant
  installment, including missed rows, without unresolved allocation/reversal.
- Completion and remaining totals are computed under the same locks and commit;
  they describe simulation processing, never external collection or settlement.
- A failure at any step leaves all financial rows, receipts and audits unchanged.

Schedule rounding/calendar generation is not needed to display stored schedules.
Use coherent seeded schedules for tests until generation rules are approved;
do not silently rewrite historical rounding defects. No approval-generated live
loan or automated disbursement is enabled by T42.

### 13.5 Provenance storage and settlement representation

Proposed additive persistence distinguishes provenance from processing status:
nullable operation mode/provenance on application, loan and repayment; immutable
simulation receipt/allocation links for new synthetic records. Null historical
provenance remains unknown. Prevent synthetic writes against historical/unknown
or externally sourced loans even if their recorded status is active.

Read contracts expose provenance `historical_unknown` or `simulation` and separate
`recordedStatus` and `settlementStatus`. T42 returns `unverified` for historical
records and `not_applicable_simulation` for test outcomes. No T42 writer can set
`externally_verified`. A future verified classification would require separately
approved durable settlement evidence and reconciliation; T38 observations alone
do not qualify. Do not create an empty “verified” field that UI code treats as proof.
No historical migration backfill upgrades money provenance.

## 14. Acceptance matrix and proposed change inventory

| Area | Required acceptance evidence |
| --- | --- |
| Original surfaces | Every row in section 1 has a route/component and browser assertion. Slider, purpose, submit, status, principal, table, repayment form/history and reviewer queue cannot disappear behind a scope reduction. |
| Authorization/replay | Real JWT missing/forged/expired cases; A uses B's key on B's loan (deny, no disclosure), A uses B's key on A's loan (no B result), same member/key on another loan (409), changed amount/purpose/term (409), exact replay after completion (identical safe result), legacy key (safe refusal). No unauthorized result precedes ownership. |
| Concurrency | Parallel identical keys produce one application/repayment; distinct keys serialize without lost amounts, excess or premature completion. Inject failures after each write; all roll back. Force serialization failure and bounded retry exhaustion; identity remains unchanged. Check receipt/allocation/audit counts and exact totals. |
| Allocation | Test approved installment priority/status rules, partial/multiple/missed installments, last penny, exact completion, excess rejection or approved surplus behavior, empty/incoherent schedule and historical/synthetic mismatch. No policy means no write. |
| Score/queue | Staff/Admin authorized, member/forged role forbidden, removed admin denied on next read; correct member-bound snapshot, null legacy snapshots, separate current score, model/date context, no compute on visit and no raw KYC/staff/key leakage. Unsupported roles receive no inferred grant. |
| Capability/eligibility | Default/staging/production denial even with flag, wrong database identity/non-synthetic member denial, policy absent/stale/null cap, zero/unknown points/risk, changed inputs at submit, KYC/scoring states per approved rules, no legacy balance formula presented as points cap. |
| Browser accessibility | Keyboard slider arrows/Home/End and exact amount synchronization, named controls/GBP output, purpose errors, focus on status/history changes, screen-reader table headings/live notices, axe and mobile overflow for member and reviewer states. Disabled forms emit zero POSTs. |
| Session | Real PostgreSQL plus existing Redis auth: concurrent 401 single refresh, CAS/logout race, direct protected URL, member switch while reads/submissions resolve, role revocation, empty browser storage and preserved T41 savings navigation/attempts. |
| Infrastructure | No new queue framework/broker or Redis job keys. No T38 activation or T36 retry/schema change. If a deferred pg-boss job is explicitly approved, prove transactional enqueue rollback, durable dedupe after job deletion, bounded retry/dead-letter, worker crash recovery and graceful shutdown. |
| Regression | API build/unit/e2e; web typecheck/lint/build/production and T40/T41 browser suites; T25 atomic/idempotency/points safeguards, T36 reminders, T37 auth, T38 webhook evidence and T39 public restrictions. Exercise existing T27/T34 foundations in dedicated loan tests. Any affected T28–T35 behavior needs regression coverage; no unsupported blanket T25–T41 pass claim. |

Proposed application changes after approval: extend the loans module with minimal
read/capability providers, strict DTOs and guarded synthetic request/allocation
services; register them without a new architecture/module split. Add the receipt,
allocation and nullable provenance/snapshot fields via reviewed Prisma migration
with clean-install/upgrade/historical-preservation tests. Add explicit server gate
checks to the legacy write paths and private headers/projections to reads. Extend
T41's session allowlist/provider only as necessary; add loan routes/components and
a bounded reviewer queue, reusing existing styles, forms, GBP and accessible states.
No dependency is needed for the range, table or review panel.

Add dedicated loan unit and real-service e2e suites, a synthetic browser fixture
and member/reviewer browser journey, then wire passing checks into existing CI.
Real-service tests require isolated loopback PostgreSQL and existing auth Redis,
synthetic identities, exact fixture cleanup and no database reset/Redis flush.
Any additive schema installation is explicit; no production migration is run.
Implementation order is backend gates/authorization and contracts, transaction
safety, session/UI and tests, within T42 rather than new roadmap stages. Policy
branches are enabled only after their listed decisions are approved. Stop here
for review; no application edit or implementation authorization is implied.

## 15. Conditional implementation authorization and actual boundary

The user subsequently authorized the T42 technical foundation on main: member and
reviewer reads/pages, disabled forms and repayment security remediation, with no
migration or synthetic execution. This supersedes earlier instructions to stop
before all application edits, but does not approve the broader receipt/allocation
migration or policy-dependent execution described in this proposal.

Actual implementation denies all loan financial execution and legacy repayment
replays after ownership validation. No replay is represented as payload/mode bound
when that evidence does not exist. Successful durable replay, simulation provenance
and allocation persistence remain blocked on explicit migration/write-contract
approval. Slider and amount-input surfaces exist disabled with no invented cap;
active synchronization/submission is not claimed. Review is read-only. Current
contracts, compatibility changes, exact test results and full inventory are in
`T42-loan-implementation.md`. Original T42/T43 requirements/dependencies remain
unchanged, and T42 is not declared operationally complete.
