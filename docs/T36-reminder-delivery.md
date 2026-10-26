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
disconnects. Membership renewal and SMS workers are not registered.

## Configuration and schema installation

Both feature flags default to disabled:

```dotenv
T36_JOBS_ENABLED=false
T36_EMAIL_MODE=disabled
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
Simulation records its own outcome without calling Resend. The `resend` mode
is accepted only in development/test; staging and production reject it in
configuration validation and in the provider adapter. Development delivery uses
`RESEND_API_KEY` and `RESEND_FROM_EMAIL`; webhook verification uses
`T36_RESEND_WEBHOOK_SECRET`.

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
NODE_ENV=test T36_TEST_DATABASE_URL="$REMINDER_INTEGRATION_DB" pnpm --filter @safethrift/api test:reminders
```

Both database names must match `safethrift_*test`, and their host must be local.
Build the API and install its application and queue schemas before running the
integration suite. CI contains the corresponding setup and verification steps.
