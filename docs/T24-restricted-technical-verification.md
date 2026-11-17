# T24 restricted synthetic technical verification and roadmap reconciliation

Date: 2026-11-17. Repository: `/home/princewill/Projects/safethrift-coop/platform`.
Inspected branch: `main`. HEAD: `6bd95e81a7f66e0690bf8fe410cca5668f55ed54`.

**T24 — RESTRICTED SYNTHETIC FOUNDATION TECHNICALLY VERIFIED.** Restricted
synthetic technical verification is recorded as complete under the user's explicit
acceptance instruction. Full original T24 acceptance and operational activation
remain incomplete and blocked. Independent inspection of the historical T24
acceptance artifacts could not be completed in this reconciliation; the supplied
results below are attributed to the user, rather than represented as newly
verified execution evidence.

**Authoritative scope and record placement.** The
[original master plan](master-plan/Safethrift-T01-T53-Original-Master-Plan.txt)
defines exactly T01–T52. Its filename does not define another milestone. The
[restricted T24 design](master-plan/Safethrift-T24-Restricted-Technical-Design.txt)
is a historical proposal, including its original implementation recommendation,
test matrix and unresolved operational decisions. Both documents are preserved
unchanged. This single acceptance/status record follows the existing per-milestone
reports in `docs/`; no general tracking structure, new milestone, scope change,
acceptance-criteria revision or dependency-graph change is introduced.

Original T24 scope, retained verbatim:

> POST /kyc/submit (creates kyc_verification row, initiates Onfido applicant). POST /webhooks/onfido (raw body, verify HMAC signature, update kyc_verification.status, write audit log). GET /kyc/status. KYC must be verified before loan applications are accepted.

Original direct dependencies: **T13 and T21**. A test-only provider and synthetic
protocol verify a restricted foundation; they do not satisfy live Onfido applicant
creation, external provider approval or real KYC acceptance.

**Evidence access and provenance.** The requested historical artifacts were:

- Acceptance report: `/tmp/safethrift-t24-final-20261116/ACCEPTANCE-REPORT.md`.
- Controlled-host manifest starting reference:
  `/tmp/safethrift-t24-controlled-20261116-xgk_j28evidence-manifest.json`.
- Actual manifest path found: **none**.

Neither requested path exists in the accessible workspace or the separate
read-only host check. The host check found no
`/tmp/safethrift-t24-controlled-20261116*` or
`/tmp/safethrift-t24-final-20261116*` candidates. A project-directory search also
found no replacement T24 acceptance report or evidence manifest. No corrected
manifest path is inferred. The historical logs, snapshots, inspection output,
manifest references and accepted-source hashes therefore remain uninspected;
their integrity and correspondence to current source cannot be certified here.

**Accepted outcomes supplied by the user.** None of these historical execution
outcomes was rerun or independently verified from its T24 artifact in this task.

| Accepted check | Supplied result |
| --- | --- |
| Combined database-backed tests | **133/133 passed** |
| Harness lifecycle/configuration cases | **7/7 passed** |
| T24 supporting provider, verifier and wiring tests | **27/27 passed** |
| T36 PostgreSQL and pg-boss regressions | **53/53 passed** |
| T38 PostgreSQL and pg-boss regressions | **16/16 passed** |
| T37/T40/T41/T42 PostgreSQL regressions | **37/37 passed** |
| Separate empty-database migration check | **All 10 migrations passed** |
| Historical fixtures | Member, KYC, audit, account and savings rows unchanged |
| Financial preservation | **Nine financial-table snapshots unchanged** |
| Sensitive-data inspection | **2,064 PostgreSQL, WAL, log and dump files; 77,434,369 bytes; zero forbidden canaries or raw protocol markers** |
| Concurrent harnesses | Two instances used separate clusters |
| Failure/configuration probes | Injected failure, SIGTERM cleanup, ownership refusal and external database-configuration rejection passed |
| Owned cleanup | **All 14 cluster-creating runs recorded successful owned cleanup** |
| Persisted synthetic verified KYC | Loan submission continued to return **HTTP 403** |
| Normal AppModule isolation | Verified using actual disposable PostgreSQL |

The combined database total, supporting tests and harness cases retain their
supplied categories. This record does not invent a new combined acceptance count.

**Historical failures and corrections.** The supplied history includes initial
Jest discovery failures and an initial assertion failure, their corrections and
subsequent passing runs. These historical failures remain failures; the history
must not be described as failure-free. The missing report prevents inspection of
their exact commands, output, correction details and chronological source hashes.
Those details are not reconstructed from current code. Expected injected-failure
and signal probes are distinct from the initial unexpected failures. Existing
reports, logs, evidence and source were neither rewritten nor cleaned up.

**Verification boundary.** The supplied execution boundary used a declared
in-memory test fixture for legacy session dependencies. PostgreSQL and pg-boss
were real disposable services. Redis behavior was outside the T24 verification
scope; no Redis service or BullMQ architecture was introduced. The original
roadmap's historical Redis/BullMQ wording is unchanged. Current job infrastructure
remains PostgreSQL/pg-boss, and existing application session dependencies are not
an additional T24 verification claim.

Independent source inspection supports the intended boundary:

- `apps/api/test/t24-harness-security.sh` explicitly selects
  `T24_SESSION_BACKEND=memory`, applies PostgreSQL migrations, uses the pinned
  pg-boss SQL in regression modes, checks historical/financial snapshots and runs
  the persistence inspector. Its isolation and ownership cleanup code was read,
  without executing the harness.
- `apps/api/test/fixtures/t24-memory-session.ts` explicitly replaces the existing
  session transport in the isolated test process. Its comment states that it makes
  no claim about Redis or distributed sessions; Prisma/PostgreSQL are not mocked.
- `apps/api/test/t24-kyc.integration.e2e-spec.ts` contains persisted synthetic
  verification followed by HTTP 403 assertions, and an AppModule test that queries
  actual database identity and asserts absent KYC routes/providers. These are
  inspected assertions, not newly observed passing tests.
- `apps/api/src/app.module.ts` imports no KYC fixture/provider module.
  `apps/api/src/modules/loans/loans.service.ts` retains unconditional execution
  denial after its existing member/ownership checks.
- Ten migration SQL files exist in the current tree. File inventory alone does
  not independently establish the supplied successful migration execution.

Current source SHA-256 values were calculated independently. These are preservation
and inspection hashes, **not a match to the unavailable T24 accepted-source
manifest**:

| Current file | SHA-256 |
| --- | --- |
| Original master plan | `fc17ea5e60761a885f7c2d4cb42f0b61a43f8f5cda12c05c856541cce9927fa0` |
| Restricted T24 design | `825233503cba2968aec481068bb22df441405d6220cf82b1ea40627116ba0343` |
| T24 harness | `85a66ba2a88c70ed2463c0561737845b0327974c0598f5b3ab61f9e098e89555` |
| T24 memory-session fixture | `107ff35d39c89bea436c0f7f7ee80dd89062e19e97529f2e3ae99fcc0ea24172` |
| T24 PostgreSQL/HTTP integration suite | `3a854da9026d4450f48bf27a0be00994bf2d38342d78370bd8d1c87517416fd4` |
| Existing T24 additive migration | `a437b7a5a1f79cfbfdad5eec1515ad6f1da326c4174ab4ab27c73a37ce87e389` |

The retained [T38 evidence report](T38-payment-webhook-evidence.md) and
[T38/T42 final report](test-artifacts/t38-controlled-verification-2026-10-29/final-verification/RESULTS.md)
were also inspected as historical project records. Their accepted T38 test hash
`9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a`
matches the independently calculated current
`apps/api/test/payment-webhooks.integration.test.mjs` hash. This establishes source
continuity for that test, not independent verification of its supplied T24-era
16/16 rerun. A fuller current-source inventory and evidence-access findings are
saved in the temporary preservation audit referenced below.

**Operational restrictions remain in force.** Technical acceptance grants no
operational activation:

- No live Onfido integration, credentials, provider activation or real KYC
  processing; no live-provider approval or operational KYC-completion claim.
- T13/provider approval and contract remain unverified. T09 incorporation and
  T10/T11 data-controller/privacy obligations must be evidenced before any
  authorized real personal-data collection. KYC authority, expiry, supersession,
  retention, risk and provider-event policy remain unresolved as recorded in the
  restricted design.
- **T19 audit immutability remains a separate prerequisite.** Transactional audit
  insertion does not establish append-only protection. Its required audit-log
  prevention/auto-write triggers are absent from the inspected checked-in
  migrations; unrelated test or expiry-record triggers do not satisfy T19.
- **T29 encryption and secrets handling remain a separate prerequisite**, including
  its original T28 Secrets Manager dependency. No established field-encryption
  service or verified production secret-management acceptance was found.
- No synthetic KYC result authorizes a real loan. Loan submission, approval,
  rejection, disbursement and repayment execution remain denied. No real financial
  activation, settlement, collection or payment operation is authorized.
- Existing security, audit, authorization, ownership and financial controls remain
  intact. No service, provider, worker, queue or deployment was activated.

**Next-milestone recommendation and its limits.** No unconditional next outstanding
milestone can be certified from the available acceptance records. The original
graph is a partial order; milestone numbering and T24's restricted technical
classification do not establish a unique successor or satisfy live prerequisites.
There is no comprehensive completion ledger, and the requested T24 artifacts and
full acceptance of relevant earlier foundations remain unavailable.

The recommended next candidate is **T19 — Add Postgres audit trigger (append-only
audit_logs)**, **conditionally eligible only after T18 and its inherited foundations
are accepted**. The immediate planning action is reconciliation of the outstanding
original T18 index requirements, rather than bypassing them to implement T19.
The original plan explicitly says of T19, "This cannot be added later without
risk — do it now". T19 directly gates T25 and T33; these lead through T27/T34/T35
to financial readiness and T43. This gives it a documented priority without adding
an invented dependency to T31 or another milestone.

Original T19 scope/acceptance requirements, retained verbatim:

> Write SQL migration adding prevent_audit_modification() trigger function. Apply BEFORE UPDATE OR DELETE on audit_logs — raises exception if triggered. Also add auto-write triggers on savings_transactions, loans, repayment_transactions, member_accounts, and kyc_verification.

T19's direct prerequisite is **T18**. Its transitive prerequisites are **T01, T02,
T03, T05, T06 and T17**, through T18. The original graph adds no legal/provider
account prerequisite to T19. The presence of foundational source and historical
migration checks is not a blanket full-acceptance sign-off for these milestones.

Original T18 requires the first migration, `(account_id, transaction_date DESC)`
indexes on savings and repayments, `member_id` indexes on child tables and a
partial index for `membership_status = active`. Checked-in SQL has the savings
composite index, but its membership-status index is ordinary, without that partial
predicate. Its repayment composite index is `(loan_id, payment_date DESC)`, and
the repayment table uses those columns. The original literal repayment-index
requirement and current schema therefore need an authoritative reconciliation;
the requirement is not retrospectively replaced here. No external database was
inspected to establish additional manually installed indexes, and no full T18
acceptance record resolves these findings.

**T31 — Add TOTP MFA for staff accounts** is a separate **conditional candidate**,
with original direct prerequisite **T21**, and transitive prerequisites **T01,
T02, T03, T05, T06, T17 and T18**. It has no original T24, T13, T19 or T29
dependency edge. The current T21 foundation and
[T37 authentication records](T37-governance-checkpoint.md) support existing
authentication behavior, but do not establish full original T21 acceptance:
current signing/verification uses `JWT_SECRET`, whereas the original requires
RS256. T40's recorded separation of account creation from membership submission
also differs from the original T21 registration wording. Those recorded boundaries
remain intact and need authoritative acceptance reconciliation. The T24 memory
fixture is not Redis-session verification. No full T21 sign-off was located.

Original T31 scope/acceptance requirements, retained verbatim:

> Install speakeasy and qrcode. POST /auth/mfa/setup (generates secret, returns QR code URL — only for STAFF, COMPLIANCE_OFFICER, BOARD, ADMIN roles). POST /auth/mfa/verify (validates TOTP code, marks mfa_enabled=true on member). Enforce MFA on all admin endpoints — redirect to setup if not enabled.

Its original gate is "Mandatory for all staff before admin portal goes live".
Schema fields alone do not implement MFA: no setup/verify route or MFA enforcement
was found in application source. Existing trusted role handling, including the
current `board_director` role value and the limits recorded in T37, must be
reconciled without inventing privilege grants. No live Onfido/provider gate is
specified for T31 itself. This assessment neither adds an encryption milestone to
T31 nor authorizes handling production MFA secrets or enabling an admin portal.

**Blocked dependent work and unchanged gates.**

| Milestone or operational surface | Original dependencies | Current readiness and reason |
| --- | --- | --- |
| Full/live T24 | T13, T21 | **Blocked.** Restricted synthetic verification does not establish T13 approval, full T21 acceptance, real KYC or the separately required T19/T29 controls. |
| T29 field encryption | T28, T22 | **Blocked for operational acceptance.** T28's legal/provider and Secrets Manager acceptance and T22's full acceptance are unverified. T28 requires T09, T13, T14, T15 and T16; T22 requires T21. |
| T33 global audit/ownership controls | T21, T19 | **Blocked for full acceptance.** T19 is absent; existing endpoint-specific guards and transactional audit writes do not constitute the complete original global controls. |
| T35 compliance | T33, T34 | **Blocked for full acceptance.** T33 inherits missing T19; T34 depends on T25, T26 and T27, whose restricted foundations do not authorize financial execution. Existing AML code alone is not full acceptance. |
| T43 admin portal | T23, T24, T27, T35, T31 | **Blocked.** T31 is not implemented, T24 remains restricted, T35 inherits T19/T33 gaps, and full T23/T27 acceptance is not established. T23 requires T21/T22; T27 requires T25/T26; T25 requires T21/T18/T19. |
| Live T36 reminders/notifications | T27, T16 | **Blocked.** Existing [T36 record](T36-reminder-delivery.md) retains disabled live email/SMS transport and test-only/fake boundaries. T16 approval and operational T27 acceptance remain unverified. The supplied 53/53 regression result activates neither provider nor worker. |
| Live/financial T38 payment processing | T14, T15, T28 | **Blocked.** Existing signature-verified evidence intake is restricted and has no membership, financial-posting or settlement authority. Provider/legal/secrets acceptance and business rules remain unverified/unapproved. The supplied 16/16 regression result changes none of these restrictions. |
| T42 loan execution/full functionality | T27, T34, T41 | **Blocked.** Its [existing acceptance record](T42-loan-implementation.md) preserves disabled execution and outstanding policy/persistence approvals. Synthetic T24 verification satisfies no real-loan gate. |

Original T43 scope/acceptance requirements remain:

> Role-gated to STAFF and above. Sections: Membership queue (approve/reject with notes), Member management (search, view profile, view KYC status, freeze), Loan queue (review application, score, probability, savings history), Compliance flags (view, resolve, add notes), BullMQ board at /admin/queues (visual job monitoring).

The [existing T42 scope reconciliation](T42-loan-readiness-assessment.md)
already records PostgreSQL/pg-boss as the project's job-monitoring infrastructure.
The monitoring function remains within T43; no Redis/BullMQ implementation or
architectural detour follows from its historical wording. T48 requires T43 along
with T40/T41/T42, and T52 requires T44/T30/T31/T32/T33; neither receives a release
or operational readiness claim from this reconciliation. Legal/provider gates are
unverified, rather than assumed approved or known to have failed.

**Repository preservation.** Initial index: no staged changes. Initial working
tree: one modified tracked file (`packages/prisma/prisma/schema.prisma`) and 17
untracked files. All 667 tracked files and 17 existing untracked files were hashed
before any repository edit; file modes and the raw/index-entry hashes were also
recorded. The T24 schema, migration, fixtures, tests and both authoritative
master-plan documents were existing work and were preserved.

Final preservation comparison: **passed**. Branch remains `main`; HEAD remains
`6bd95e81a7f66e0690bf8fe410cca5668f55ed54`. The raw index and every index entry
are unchanged, with no staged changes. All **684 pre-existing tracked/untracked
files** retain their baseline bytes and modes, and the existing unstaged tracked
diff is identical. All 17 original untracked files remain untracked and unchanged.
Final working tree: the same one modified tracked schema file and 18 untracked
files, with this record as the only addition. **The only repository file changed
by this task is `docs/T24-restricted-technical-verification.md` (new, untracked).**
Application code, migrations, configuration and all unrelated existing work remain
unchanged. Documentation links, original-scope quotations and whitespace checks
passed.

Temporary audit directory:
`/tmp/safethrift-t24-roadmap-reconciliation-20261117-smdfix5j/`. Its `baseline.json`,
initial status/index/diffs, `inspected-source-hashes.json`,
`evidence-access-checks.json` and `repository-preservation.json` document this
reconciliation's actual observations;
they are not replacement historical T24 acceptance evidence.

No application implementation, schema/migration/dependency/environment or
infrastructure change, test/service execution, branch change, commit, amendment,
reset, stash, rebase, cherry-pick, push or deployment was performed. Stop after
this record and assessment; implementing any milestone requires explicit further
authorization and satisfaction of its recorded prerequisites.
