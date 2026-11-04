# T36 reminder delivery and verification

## Implemented behavior

The overdue scan runs at 08:00 UTC with one recovery scan after an outage.
It selects installments due before the current UTC date with an outstanding
balance, an active disbursed loan, and an active member with verified email.
Reminder creation, durable job enqueue, and the audit entry share one database
transaction. A database uniqueness constraint prevents another initial overdue
email for the same installment, including after a queue job is deleted.

Delivery freezes the email body and provider idempotency key. Provider acceptance
is recorded separately from confirmed delivery. Uncertain transport outcomes
reuse the original payload and key within the 23-hour retry safety window.
Signed raw-body webhooks are deduplicated and reconciled with acceptance evidence.
Workers use bounded retries and a dead-letter queue, and drain before Prisma
disconnects. The renewal scanner is registered. SMS producers and the SMS worker
are restricted to test-mode simulation; the registered SMS adapter does not
bind a live Twilio client.


## T36 acceptance reconciliation

| Original requirement | Implementation | Evidence | Status and restriction |
| --- | --- | --- | --- |
| 08:00 UTC overdue scan | `reminder-workers.service.ts`, `reminders.service.ts` | UTC schedule and overdue integration cases | Verified for email; SMS producer is test-only. |
| 30-day and 7-day renewals | `renewal-scan.service.ts`, `membership-expiry.service.ts` | Exact-window, concurrent scan, unknown/withdrawn/corrupt and stale-expiry tests | Verified for simulation; expiry evidence is never inferred. |
| Durable queued notifications | `jobs.service.ts`, scanner services | PostgreSQL enqueue, uniqueness, and audit rollback tests | Verified with pg-boss 12.38.0. |
| Resend email delivery | `reminder-email.provider.ts`, `reminder-delivery.service.ts` | Frozen payload, idempotent retry, signed callback and recovery tests | Verified using fakes; live T36 delivery is blocked in every environment. |
| Twilio SMS architecture | `reminder-sms.provider.ts`, `reminder-sms-delivery.service.ts`, `twilio-webhook.controller.ts` | Fake-provider claim, signed callback, concurrency and crash-recovery tests | The SDK-backed transport is implemented but unregistered. Producers and worker run only in test simulation. Activation requires a separate reviewed code/configuration change and authorization. |
| Reminder and attempt logging | `reminders.service.ts`, `renewal-scan.service.ts`, delivery services | PostgreSQL reminder, attempt and audit assertions | Verified for tested paths. |
| Recovery and failure handling | `reminder-workers.service.ts`, SMS and email delivery services | Real worker termination, expiration and retry; dead-letter, uncertain outcome and callback tests | SMS claims prevent automatic resends, but do not establish exactly-once delivery. |

The registered SMS provider rejects live transport even if Twilio mode is
selected; only an injected fake client is allowed in test mode. The dormant transport factory validates the credential contract and constructs an SDK
client only when explicitly invoked; it is not connected to the registered adapter.
Twilio SDK 6.2.0 is pinned and automatic SDK retries are disabled. The database suite removes provider credentials and blocks external fetch;
verification also used a separate non-loopback network guard. No live provider activation is authorized by these checks.

## Configuration and schema installation

The T36 flags default to disabled:

```dotenv
T36_JOBS_ENABLED=false
T36_EMAIL_MODE=disabled
T36_SMS_MODE=disabled
```

Apply application migrations and explicitly install the pinned queue schema
before enabling workers, using the intended database in `DATABASE_URL`:

```sh
pnpm --filter @safethrift/prisma exec prisma migrate deploy
pnpm --filter @safethrift/api jobs:migrate
```

The queue installer verifies the committed SQL against pg-boss 12.38.0 and
checks schema version 46. Runtime startup does not automatically migrate the
queue schema.

Set `T36_JOBS_ENABLED=true` and `T36_EMAIL_MODE=simulate` for simulation.
Simulation records its own outcome without calling Resend. All environments reject `resend` mode in configuration validation and the
registered provider.
The dormant transport is unregistered; activation requires separate authorization
and a reviewed code change. Webhook verification uses `T36_RESEND_WEBHOOK_SECRET`.

## Verification on 2026-10-26

The following checks passed against the current working tree:

- API Nest build.
- All five API unit test suites: 30 tests passed.
- ESLint on the reminder and jobs directories and changed API bootstrap,
  configuration, database, and module files.
- All six Prisma migrations applied to a fresh isolated PostgreSQL 16 database.
- Explicit pinned pg-boss schema installation and version verification.
- Historical migration preservation check: existing tables, audit rows, and
  reminder timestamps preserved; new queued reminders have null sent timestamps;
  initial reminder uniqueness enforced.
- Reminder integration suite: 16 tests passed, including atomic rollback,
  eligibility, frozen payloads, uncertain delivery recovery, signed webhook
  deduplication, reconciliation, concurrent workers, killed-worker recovery,
  shutdown during startup, UTC cron catch-up, retry backoff, dead-letter outcomes,
  and pending job retention.

Database checks used separate temporary local test databases, without application
credentials or live provider calls. The integration suite emits a pg client
concurrent-query deprecation warning; it does not fail the tests. Broader web and
API end-to-end suites were not rerun during this continuation.

To repeat database checks, provide explicit local test database URLs. The
migration preservation check requires an empty database and leaves its fixtures
in that database; use a separate migrated database for integration tests:

```sh
NODE_ENV=test T36_MIGRATION_TEST_DATABASE_URL="$REMINDER_MIGRATION_DB" pnpm --filter @safethrift/api test:reminder-migrations
NODE_ENV=test T36_TEST_DATABASE_DISPOSABLE=true T36_TEST_DATABASE_URL="$REMINDER_INTEGRATION_DB" pnpm --filter @safethrift/api test:reminders
```

Both database names must match `safethrift_*test`, and their host must be local.
The integration suite requires explicit disposable confirmation, exclusively
loopback DNS resolution, and no provider credentials. It blocks external fetch
requests. Append-only renewal fixtures remain as closed members in that database;
use a database dedicated to this suite.
Build the API and install its application and queue schemas before running the
integration suite. CI contains the corresponding setup and verification steps.
