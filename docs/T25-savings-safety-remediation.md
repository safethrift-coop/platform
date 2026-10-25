# T25 savings transaction safety remediation

Status: implemented and verified locally; awaiting independent review. No commit, push, pull request, deployment, public operation or payment integration is authorised or performed.

## Baseline and roadmap boundaries

Audited `main` at `3ac36f38edec2fca7e963bb044fb5043fc75138e` with a clean working tree. Created `fix/t25-savings-transaction-safety` from that verified baseline. No existing work was discarded. This is remediation of T25 and its directly connected points/compliance event processing, not a new roadmap milestone. The original T01–T52 roadmap remains authoritative and unchanged. No T39 source or frontend functionality changed. No distributed lock, outbox, worker, provider, new dependency or modular-monolith redesign was introduced.

## Confirmed defects and corrections

- Savings read balances outside transactions and wrote replacement values. Financial rows and balances could disagree under concurrent operations. The mutation now uses atomic increment/decrement inside a Serializable transaction; withdrawal is conditional on sufficient funds. Membership, ownership, active savings type/status and existing GSA restrictions are read inside that same transaction. PostgreSQL serialization/deadlock conflicts (`P2034`) retry the whole transaction at most four times; exhausted conflicts return 503 asking the caller to retain its key. Other errors do not receive blind retries.
- Replay returned another member's row when a supplied key matched, without binding member/account/amount/operation, and first/replay response shapes differed. Missing keys were generated silently. Both endpoints now require a client key of 1–128 safe ASCII characters. A shared unique registry binds the key to authenticated member, account, operation and normalized amount plus note/reason. New success responses are persisted as JSON in the same transaction and replayed unchanged, including the historical balance after that operation. Cross-member/payload/operation conflicts return generic 409 without returning the prior record.
- Separate per-table unique keys allowed a deposit and withdrawal to use one key. The new registry enforces a shared key namespace in PostgreSQL. Existing per-table unique constraints remain. The unique-claim loser rolls back before reading committed state and returning a matching replay. A uniqueness failure with no committed matching registry row remains a database error, rather than a false success.
- The previous Decimal.js calculations returned to floating-point values before persistence/events. Mutation amounts are now decimal strings, validated as greater than zero, at most 10000.00 and at most two fractional digits. Database updates, balances, event data and snapshots remain exact decimals/strings. Points convert only final floored integer counts to numbers; compliance sums and comparisons also remain decimal operations.
- GSA goal state was a separate post-commit write. It now changes atomically with balance, financial record and replay snapshot. The existing once-reached rule is preserved: reaching a goal permits subsequent withdrawals even if the balance later falls below the target. No cooling-off policy has been invented.
- Deposit events were emitted inside the transaction. The event now includes the stable deposit transaction ID and is dispatched only after successful commit. Failed attempts and request replays emit no event. Listener failures are logged and cannot roll back or change the committed financial response.
- Points had no deduplication and used read/replace totals. Processing now validates against the committed registry event and deposit, inserts a unique transaction receipt, and increments the member's points atomically in the same transaction. `ON CONFLICT DO NOTHING` via Prisma `skipDuplicates` arbitrates concurrent duplicate deliveries, including zero-point receipts. A failed points update rolls its receipt back. Historical deposits are not automatically replayed or re-awarded.

## Simulation restriction and API contract

`SAVINGS_SIMULATION_ENABLED` defaults to the literal string `false` and validates only `true`/`false`. The service permits mutation only when the flag is explicitly `true` AND `NODE_ENV` is explicitly `development` or `test`. Missing/unknown environments, staging and production reject regardless of the flag. The gate applies before replay lookup as well as before new writes.

Example development/test request, never a payment instruction:

```http
POST /api/v1/accounts/<account-id>/deposit
Authorization: Bearer <test-token>
Idempotency-Key: <client-generated-stable-key>
Content-Type: application/json

{"amount":"12.34","note":"Development simulation"}
```

JSON numeric amounts are intentionally rejected; clients must send strings. Successful responses retain `transaction` and `newBalance`, with monetary strings and explicit `simulation: true`, `settlement: "not_settled"`. Persisted rows have `isSimulation: true` and `channel: "simulation"`. A `completed` row means the simulated internal operation completed, never external settlement. Swagger descriptions say so. No real funds are accepted or moved.

The registry reserves only committed successes: failed validation or rolled-back attempts leave no claim, financial record, balance change or response snapshot. Retrying an uncertain outcome with the SAME key safely distinguishes a committed success from an operation that rolled back. Failed business responses are not persisted as replay outcomes.

Historical rows have `is_simulation = NULL`, representing unknown historical provenance. Any legacy transaction key without a saved registry response is rejected with 409 for manual review, including keys present in both old tables. Existing data is never re-keyed, relabelled, recalculated or assigned fabricated snapshots. There is no automatic historical points reconciliation.

## Additive migrations and independent verification

1. `20261024010000_restore_compliance_flags`: creates only the previously declared `ComplianceFlagStatus`, `ComplianceFlagType`, `compliance_flags`, its three indexes and member foreign key. Comparing a database built from the two old migrations against the unchanged baseline Prisma schema independently reproduced exactly these missing objects. The correction matches that generated diff, excluding comments/whitespace.
2. `20261024010100_savings_transaction_safety`: adds nullable `is_simulation` columns to deposits and withdrawals; creates `savings_requests` with key primary key and unique transaction ID, JSON response/event snapshots and request identity; creates `savings_points_receipts` with deposit ID primary key and deposit foreign key. The registry's transaction ID intentionally spans two existing financial tables and is not a polymorphic foreign key. Its row and referenced financial row are created atomically by the service.

No existing migration was edited and neither new migration updates/deletes existing rows. `prisma migrate deploy` successfully created an isolated database from all four migrations. Prisma's database-to-schema comparison reports no difference. `test:migrations` independently builds an empty disposable database from the two old migrations, inserts legacy rows (including a cross-table duplicate key), applies both new migrations, and verifies row equality, unchanged balances/keys, NULL historical labels and usable compliance foreign key/table.

An existing database may have been changed through `db push` or manual SQL. Inspect migration history and schema drift before any eventual application outside tests: a pre-existing compliance table will intentionally cause the CREATE migration to fail rather than silently accepting an unverified definition. This work did not inspect or reconcile a production database.

## Tests and actual local verification

Runtime: Node 22.21.1 / pnpm 10.33.0. PostgreSQL 16 and Redis 7 were provisioned in dedicated local disposable containers, separate from the repository's development services. Test suites require an explicit loopback `SAVINGS_TEST_DATABASE_URL` with a `safethrift_*test` database name and `NODE_ENV=test`; there is no fallback to application credentials. Migration tests additionally refuse any nonempty public schema. Integration cleanup targets only recorded test member IDs and request keys. No reset or destructive migration command was used.

| Verification | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` from root | PASS; no lockfile/dependency changes |
| `pnpm --filter @safethrift/prisma exec prisma validate` | PASS |
| `pnpm --filter @safethrift/api exec tsc --noEmit` | PASS |
| `pnpm --filter @safethrift/api lint --no-fix` | PASS; runs existing ESLint configuration without mutating files |
| `pnpm --filter @safethrift/api build` | PASS |
| `pnpm --filter @safethrift/api test --runInBand` | PASS: 2 suites, 5 tests |
| `pnpm --filter @safethrift/api test:e2e --runInBand` with isolated test configuration | PASS: 2 suites, 22 tests (21 savings integration cases and existing application health check) |
| `pnpm --filter @safethrift/api test:migrations` against an empty dedicated test database | PASS: historical gap and legacy preservation checks |
| `prisma migrate deploy` on dedicated savings test database | PASS: all four migrations |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS: no schema difference |
| `git diff --check` | PASS |

Concurrency cases rendezvous after actual database reads so conflicting requests overlap deterministically, without sleeps. Coverage includes deposit/deposit, competing withdrawals, mixed deposit/withdrawal, duplicate deposit/withdrawal keys, cross-operation races, altered request/member/account/detail, legacy ambiguity, forced PostgreSQL unique failure after balance/goal changes, committed event visibility, listener failure isolation, concurrent points deduplication, concurrent distinct points awards, zero-point receipts, PostgreSQL integer-overflow rollback of points receipts, ownership/status/membership/type restrictions, GSA milestone arithmetic and state, HTTP contract validation, and production/staging/default-disable behavior. Unit tests cover amount/key validation and bounded conflict retries/exhaustion.

Initial verification exposed Jest's CommonJS handling of the existing ESM-only `uuid` dependency. Savings now uses Node's built-in `randomUUID`; the e2e Jest configuration transforms the existing UUID package used by auth/loans so the existing full application can boot, without mocking financial behavior or adding dependencies. Initial test-harness lint failures were fixed with explicit Prisma delegate types; no lint rule was disabled.

CI now runs migration-preservation checks in a separate empty database and runs the full API e2e/PostgreSQL suite using its existing PostgreSQL/Redis services. Hosted Actions is NOT RUN because nothing has been committed or pushed. T39 checks were not rerun for this backend-only remediation; its source is unchanged.

## Remaining blockers and limits

- **Live financial operations remain blocked.** There is no payment confirmation, settlement source or regulatory/business approval. Enabling simulation can never enable production mutations.
- **In-process delivery is not durable.** A crash after deposit commit and before/during listener dispatch can leave points or compliance processing missing. Replaying the financial request intentionally does not dispatch another event. Stored event snapshots and receipts support review but are not an outbox and no automated delivery/reconciliation worker exists. Durable delivery and recovery require a separately approved design before live operations.
- Existing historical balance/transaction inconsistencies and previously missing/duplicated points cannot be repaired safely from this change alone. No data corrections were attempted.
- Existing compliance flag creation remains best-effort and its open-flag check is not a database deduplication guarantee under concurrent distinct deposits. This remediation preserves its rules and adjusts decimal/event compatibility; it does not redesign compliance case management.
- Existing points breakdown is an estimate from deposits and does not reproduce every per-deposit floor or GSA bonus. Points receipts now make new awards auditable; historical reporting/reconciliation remains separate work.
- Existing schema comments describe audit triggers/append-only protection absent from the checked-in SQL. No such control is claimed or added here.
- Account-number generation/account reopening and combined transaction pagination have separate existing defects, recorded in Phase 1 and not expanded into this patch.
- The environment gate is not deployment isolation: simulation databases must remain separate from any future live database. Existing loan or other modules are outside this approved savings patch.
- Independent code/migration review is still required. No production-readiness claim is made.

## Changed-file responsibilities

- Savings service/controller/DTOs and `savings-safety.ts`: atomic mutations, validation, simulation gate, replay contract and bounded retries.
- `savings-safety.spec.ts`: unit regression coverage.
- Prisma service: typed transaction callback/options and new model delegates.
- Points event/service: exact event values, stable transaction ID, committed-event lookup and transactional receipt/increment.
- Compliance service: decimal-safe handling of the shared event; existing rule policy unchanged.
- Environment validation and `.env.example`: explicit default-off simulation configuration.
- Prisma schema and the two new migration directories: reviewed additive persistence changes.
- `savings.integration.e2e-spec.ts`, `verify-savings-migrations.mjs`, API package scripts and Jest e2e configuration: real PostgreSQL/HTTP/migration regression checks and existing ESM compatibility.
- CI workflow: execute the new checks on isolated CI test services.
- This report: baseline, defects, API contract, evidence, scope and live-operation blockers.

## Reproduction

Use dedicated empty loopback PostgreSQL test databases (one for integration, one for migration preservation) and isolated Redis. Do not point these commands at an application, staging or production database. Supply dummy JWT/encryption/Resend configuration for full-app health boot.

```sh
pnpm install --frozen-lockfile
# DATABASE_URL must target the dedicated integration test database.
pnpm --filter @safethrift/prisma exec prisma generate
pnpm --filter @safethrift/prisma exec prisma migrate deploy
pnpm --filter @safethrift/prisma exec prisma validate
pnpm --filter @safethrift/api exec tsc --noEmit
pnpm --filter @safethrift/api lint --no-fix
pnpm --filter @safethrift/api build
pnpm --filter @safethrift/api test --runInBand
# NODE_ENV=test; SAVINGS_TEST_DATABASE_URL targets the migrated integration DB.
pnpm --filter @safethrift/api test:e2e --runInBand
# Change SAVINGS_TEST_DATABASE_URL to the separate EMPTY migration-test DB.
pnpm --filter @safethrift/api test:migrations
```

Tests explicitly enable simulation only within isolated cases and also verify that staging/production reject it. The regular application remains disabled by default.
