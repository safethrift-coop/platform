# T37 GovernanceModule — implementation and verification

Status: T37 complete within the approved scope; all approved functionality and required local checks pass. T36 remains incomplete. No deployment or production-readiness claim is made. The original T01–T52 roadmap is unchanged.

Work began on clean main at `7d89ff03729a9a639b2b2d435bdac322f39c4e73` and preserved the uncommitted member-facing T37 implementation throughout the approved admin continuation. No branch, commit, push, merge, deployment, financial activation or administrative provisioning was performed. T25 source/migrations/tests and T39 files are unchanged.

## Endpoints and policy boundaries

All five original endpoints are registered under `/api/v1`:

| Route | Behavior |
| --- | --- |
| GET /shares/me | Authenticated caller's existing shares only, exact decimal strings, no member override. |
| GET /groups | Safe metadata and only the caller's membership state; no member roster or financial target. |
| GET /groups/:id | Same selection boundary; unknown group 404. |
| POST /groups/:id/join | Active member + forming/active group; ordinary active membership plus audit in one transaction. |
| POST /admin/groups | Current authenticated admin, active member, current authority rechecked inside group/audit transaction. |

Both collections return `{ page, limit, items }`. Defaults page=1 and limit=20; page bounded to 1–1,000,000 and limit to 1–100. Ordering `createdAt DESC, id ASC` is deterministic for a fixed dataset; offset pagination is not a cross-request snapshot during concurrent inserts.

JWT authentication rejects missing, invalid, expired, unknown-member, suspended-member and closed-member tokens. Existing pending members can read metadata and their own shares, but cannot join or create groups. Nonadmin creation is 403. Joins reject pending members with 403 and dissolved groups or any existing membership (including left/suspended) with 409. No automatic reactivation or group officer appointment.

Creation accepts only trimmed groupName (1–200 characters), existing Prisma GroupType, description (1–2,000), and optional facilitatorName (1–200). All four schema types are supported. Unknown fields including targetAmount, role, isAdmin and status are rejected. Prisma's forming default is preserved by omitting status from insertion. No issuance, contributions, payments, voting, share thresholds or capacity policy was introduced.

Joins and creation each use Serializable transactions with at most four P2034 conflict attempts and 503 on exhaustion. Membership uniqueness uses the existing database pair constraint; only its relevant P2002 violation becomes 409. Other database errors propagate. Successful mutations and corresponding AuditLog entries commit together; audit failure rolls back the mutation. Audit contains actor, target record, insert action, relevant new values and available IP/user agent. No immutability is claimed: existing schema comments mention audit triggers absent from checked-in SQL.

## Migration and authority

`20261025010000_member_admin_authority` contains only:

```sql
ALTER TABLE "members" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;
```

Prisma declares `Member.isAdmin Boolean @default(false) @map("is_admin")`. Existing and new members remain nonadmin. No backfill, promotion seed, hardcoded identity, role-management endpoint or other role schema was added. No existing migration was edited. Apply this migration and generate the Prisma client before running the changed API; no non-test database migration was attempted here.

Login and refresh reload trusted database authority. JWT validation also reloads current member status/authority on every authenticated request without caching: a stale signed admin claim is downgraded when isAdmin=false. Database lookup failure cannot grant authority. Existing signed staff/compliance/board role handling and RolesGuard matching are preserved; those policies/provisioning were not redesigned. Login and refresh issue only member/admin claims. Registration and profile updates cannot write isAdmin.

Admin creation uses JWT guard + existing RolesGuard(Admin), then reads active status and isAdmin inside the same Serializable transaction as creation/audit. Revocation committed before a new request's authority read takes effect immediately. A mutation concurrent with revocation may serialize before it; no cancellation of already running transactions is claimed.

Administrative grants/revocations remain separately authorized, reviewed database operations against an identified member, with an AuditLog entry in the same transaction. No grant/revoke operation or tooling was executed or added. Operational refresh-slot deletion may additionally revoke a session; database authority checks are what prevent stale tokens retaining admin privileges.

## Refresh correction

The original lifecycle inspection and complete security explanation are in `T37-refresh-security.md`, written before implementation and updated with results. The correction retains existing opaque UUIDv4 secrets, bcrypt cost 10, one Redis slot per member, seven-day refresh lifetime and 15-minute access JWTs.

The controller now separates a memberId locator from the cookie/body secret. Only a bcrypt match proves identity; no member lookup occurs for invalid secrets. Invalid or absent slots return generic 401, with dummy bcrypt work for missing slots and no deletion of another member's slot. A Lua compare-and-swap replaces exactly the proven hash with its replacement and TTL atomically. Only its winner receives credentials. A logout/reset deletion or concurrent refresh prevents a stale CAS from recreating the slot. Cross-member substitution, rotation replay and concurrent independent success are rejected.

Cookie refresh body is `{ "memberId": "<id>" }`; optional body-secret fallback is `{ "memberId": "<id>", "refreshToken": "<UUIDv4>" }`. Cookie takes precedence. Roles/unknown fields are rejected. Clients must adopt this corrected contract; the broken refreshToken-as-memberId contract is not retained.

## Actual verification

Dedicated PostgreSQL 16 and Redis 7 containers were used on loopback ports 55437 and 56437 with test-only credentials. Main integration DB: safethrift_governance_test. Separate empty safethrift_governance_migration_test and safethrift_savings_migration_test databases were used for preservation checks. Both dedicated containers were stopped after verification and were not removed. Integration cleanup targets recorded fixture IDs/keys; no database reset or Redis flush was used.

| Check | Actual result |
| --- | --- |
| Prisma generate and validate | PASS |
| Existing migrations plus additive authority migration deployed to isolated DB | PASS: all five migrations present |
| Database-to-Prisma schema diff | PASS: no difference |
| API typecheck | PASS |
| API lint without fixes | PASS |
| API build | PASS |
| API unit tests | PASS: 4 suites, 22 tests |
| Final full API HTTP/PostgreSQL/Redis tests | PASS: 4 suites, 44 tests; exit 0 |
| Full-suite open-handle diagnostic with --testTimeout=30000 | PASS: 44 tests, exit 0, no open handles reported |
| Governance migration preservation | PASS: rows preserved, no promotions, NOT NULL DEFAULT false for new members |
| Existing T25 savings migration preservation | PASS |
| git diff --check | PASS |

An earlier full integration run passed 41 tests. After adding more coverage and timing padding, one grouped crypto-heavy test exceeded Jest's five-second timeout during simultaneous compilation/lint work: 41 passed and one timed out. That failed run is not counted as a pass. Its asynchronous work also produced a Jest open-handle warning. The inactive/unverified cases were split and the real-crypto suite given an explicit 15-second per-test timeout; the final sequential run passed all 44 tests in 40.45 seconds, with exit 0. Jest still emitted a delayed-exit warning; an open-handle diagnostic was run before final delivery. With the original five-second legacy timeout, diagnostic overhead caused one savings HTTP test to time out and then affected the next savings case (42 passed, two failed). No T25 code/tests were changed; the diagnostic rerun used a 30-second command-line timeout and passed all 44 tests in 94.674 seconds with exit 0 and no open handles reported. T25 tests were not edited. Initial new-test typing/formatting/lint findings were corrected; no lint rule was disabled.

Coverage includes real JWT/local authentication, member share isolation, pagination/validation, group eligibility and duplicate states, forced overlapping join arbitration, admin/nonadmin access, forged/expired/stale token claims, promotion/revocation, inactive admins, transaction authority recheck, supported types/defaults, rejected financial/authority fields and real PostgreSQL audit-failure rollback for joins and creation. Auth tests use real bcrypt and Redis for hashing/TTL, cookie/body rotation, concurrent refresh arbitration, cross-member substitution, replay, logout interleaving, reset revocation, expiry, member state and self-promotion rejection. Only HIBP is stubbed for password reset, and throttle quotas are bypassed in the focused auth suite; authentication is not mocked.

Hosted CI was configured for the new migration check and required test environment but not executed. Production verification and T39 checks were not run. No production readiness claim is made.

## Remaining security limits

- One refresh session per member; no multi-device inventory or session-family replay detection. A new login replaces the old refresh slot. Lost rotation responses can require login again.
- Logout/password reset revoke refresh state but do not generally invalidate already issued 15-minute access JWTs. Current status/admin authority still applies on every authenticated request.
- Redis persistence/failover durability and stale-backup restoration are outside this patch. Redis and PostgreSQL do not share a transaction. Refresh never returns prepared credentials after failed CAS, but process/response loss after successful CAS is not recoverable by old-secret replay.
- Existing reset-token consumption and new-login/reset races are not redesigned. Database/signing-key compromise and bearer-token theft remain security boundaries. No audit immutability or in-flight cancellation guarantee exists.
- The changed refresh request contract requires client coordination. There is no public administrator provisioning; all members remain nonadmin until a separately approved operation grants authority.

## Changed-file inventory (including preserved member-facing T37 work)

| File | Responsibility |
| --- | --- |
| apps/api/src/app.module.ts | Register GovernanceModule. |
| apps/api/src/modules/governance/governance.module.ts | Wire member/admin controllers and service. |
| apps/api/src/modules/governance/governance.controller.ts | Four member-facing endpoints. |
| apps/api/src/modules/governance/admin-groups.controller.ts | Guarded administrative creation endpoint. |
| apps/api/src/modules/governance/governance.service.ts | Scoped reads, eligibility, transactional joins/creation/audits and retries. |
| apps/api/src/modules/governance/dto/governance.dto.ts | Pagination, identifier, empty join and narrow creation contracts. |
| apps/api/src/modules/governance/governance.spec.ts | Unit policy/transaction/DTO coverage. |
| apps/api/src/core/strategies/jwt.strategy.ts | Current database member status and administrative authority. |
| apps/api/src/core/redis/redis.service.ts | Atomic hash compare-and-swap/delete. |
| apps/api/src/modules/auth/auth.service.ts | Trusted claims, verified-secret refresh and atomic rotation; native cryptographic UUID generation. |
| apps/api/src/modules/auth/auth.controller.ts | Correct locator/secret arguments and accurate reset response documentation. |
| apps/api/src/modules/dto/refresh.dto.ts | Separate validated memberId and optional secret. |
| apps/api/src/modules/auth/auth-security.spec.ts | Unit authority/failure/refresh checks. |
| apps/api/test/governance.integration.e2e-spec.ts | Real JWT/PostgreSQL member/admin and audit/concurrency tests. |
| apps/api/test/auth-security.integration.e2e-spec.ts | Real HTTP/PostgreSQL/Redis/bcrypt lifecycle and self-promotion tests. |
| apps/api/test/verify-governance-migration.mjs | Isolated additive migration/default/preservation verification. |
| packages/prisma/prisma/schema.prisma | Default-false administrative flag only. |
| packages/prisma/prisma/migrations/20261025010000_member_admin_authority/migration.sql | Additive column migration only. |
| apps/api/package.json | Governance migration-check script. |
| .github/workflows/ci.yml | Governance migration preservation and integration environment. |
| docs/T37-governance-checkpoint.md | Implementation, verification, limits and inventory. |
| docs/T37-refresh-security.md | Baseline lifecycle, correction, request contract and security analysis. |

## Reproduction

Use only isolated loopback safethrift_*test PostgreSQL databases and dedicated Redis. Set NODE_ENV=test. Apply all migrations and generate Prisma before testing. Supply explicit GOVERNANCE_TEST_DATABASE_URL, SAVINGS_TEST_DATABASE_URL and DATABASE_URL for the integration DB, AUTH_TEST_REDIS_URL plus REDIS_HOST/REDIS_PORT/REDIS_PASSWORD for dedicated Redis, and dummy JWT/encryption/Resend settings for app boot. The new tests reject absent/nonlocal/non-test service endpoints and never load dotenv as a credential fallback.

```sh
pnpm --filter @safethrift/prisma exec prisma generate
pnpm --filter @safethrift/prisma exec prisma validate
pnpm --filter @safethrift/api exec tsc --noEmit
pnpm --filter @safethrift/api lint --no-fix
pnpm --filter @safethrift/api build
pnpm --filter @safethrift/api test --runInBand
pnpm --filter @safethrift/api test:e2e --runInBand
# Separate initially empty test databases, with corresponding explicit URL vars:
pnpm --filter @safethrift/api test:governance-migrations
pnpm --filter @safethrift/api test:migrations
```
