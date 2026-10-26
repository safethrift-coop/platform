# T38 secure payment webhook intake and evidence

Status: restricted implementation on `main`; no commit, push, merge or deployment.
The original T01–T52 roadmap is unchanged. T36 remains preserved at `27587d6`.
This module implements evidence intake only, with no payment or membership effects.

## Boundary

Routes:

- `POST /api/v1/webhooks/stripe`
- `POST /api/v1/webhooks/gocardless`

The module has no dependency on membership, savings, points, loan, governance or
notification services. Its database writes target only four new evidence tables
and the isolated `t38_jobs` schema. It never reads webhook metadata to create or
link members, accounts, obligations or financial transactions. No provider API
client is instantiated and no provider HTTP request is made.

No MembershipFeeObligation or BusinessEffectReceipt is introduced. Existing
membership approval, fee constants and notification content remain unchanged;
none constitutes an approved T38 business rule. T25 simulation guards, source,
migrations and tests remain unchanged, as do T36/T37/T39 source and migrations.

## Provider contract verified on 2026-10-26

### Stripe

- Official `stripe` SDK pinned to **23.0.1**.
- Snapshot events with API version **2026-09-30.endive**, matching that SDK.
- Static official `Stripe.webhooks.constructEvent` verifies exact raw bytes with
  the endpoint secret and a **300-second tolerance**. Future signature timestamps
  beyond 300 seconds are also rejected. Event occurrence time is not used as a
  replay cutoff: a legitimately redelivered old event may have a fresh signature.
- Requires `livemode=false`. An explicit event account must equal the configured
  account. Own-account events can omit `account`; in that case account identity
  is bound by the dedicated endpoint signing secret, not by an invented payload
  property. Operators must bind the secret to the correct test account. Connect
  and organisation-wide shared endpoint configurations are not supported.
- Unsupported snapshot API versions fail closed. Unknown event types within the
  supported envelope/version are durably ignored.

Official references:

- https://docs.stripe.com/webhooks
- https://github.com/stripe/stripe-node/blob/master/src/apiVersion.ts
- https://docs.stripe.com/api/checkout/sessions/object

### GoCardless

- Standard documented JSON `events` envelope: event `id`, `resource_type`,
  `action`, `created_at`, and `links`; maximum **250 events per request**.
- HMAC-SHA256 over the unmodified raw body; strict 64-character hexadecimal
  `Webhook-Signature` validation and constant-time comparison. Matches the
  official Node SDK verifier without adding a collection-capable API client.
- Every event must carry the configured `links.organisation`. Missing or wrong
  organisation rejects the entire batch. This deliberately fails closed for
  envelopes that do not provide that scope.
- GoCardless's documented API family is `2015-07-06`; webhook envelopes do not
  supply a Stripe-style `api_version` or signed delivery timestamp. We do not
  invent either. Sandbox identity comes from the sandbox endpoint secret plus
  the configured organisation; the envelope alone does not prove sandbox mode.
- Replays are controlled by durable scoped event IDs, not a fabricated timestamp
  tolerance. Unknown valid resource/actions are durably ignored.

Official references:

- https://docs.gocardless.com/docs/getting-started/stay-up-to-date-with-webhooks
- https://github.com/gocardless/gocardless-nodejs/blob/master/src/webhooks.ts
- https://docs.gocardless.com/docs/getting-started/set-up
- https://docs.gocardless.com/docs/api-reference/events/payment
- https://docs.gocardless.com/docs/api-reference/events/mandate
- https://docs.gocardless.com/docs/api-reference/events/refund
- https://docs.gocardless.com/docs/api-reference/events/payout

## Explicit event allowlist

Stripe:

- `payment_intent.created`, `payment_intent.processing`,
  `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `payment_intent.canceled`.
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`.
- `charge.succeeded`, `charge.failed`, `charge.refunded`.
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.
- `refund.created`, `refund.updated`, `refund.failed`.
- `payout.paid`, `payout.failed`.

GoCardless, by resource type:

- `payments`: `created`, `submitted`, `confirmed`, `paid_out`, `failed`,
  `cancelled`, `charged_back`, `chargeback_cancelled`, `chargeback_settled`,
  `late_failure_settled`, `resubmission_requested`,
  `customer_approval_granted`, `customer_approval_denied`.
- `mandates`: `created`, `submitted`, `active`, `failed`, `cancelled`, `expired`,
  `reinstated`, `replaced`, `consumed`, `blocked`, `resubmission_requested`,
  `customer_approval_granted`, `customer_approval_skipped`.
- `refunds`: `created`, `paid`, `failed`, `refund_settled`, `funds_returned`.
- `payouts`: `paid`, `paid_again`, `fx_rate_confirmed`,
  `tax_exchange_rates_confirmed`.

These are observations, not instructions to collect, refund, resubmit or change
membership. Checkout completion remains a session fact; mandate activation
remains an authorisation fact. Neither becomes collection or settlement.

## Persistence and exact amounts

Migration: `20261026010000_payment_webhook_evidence`.

| Table | Purpose |
| --- | --- |
| `payment_webhook_deliveries` | One receipt per application-level delivery attempt, including rejected signatures/scope and accepted duplicates; raw body SHA-256, outcome, configured scope and associated internal event IDs. |
| `payment_webhook_events` | Durable unique `(provider, environment, accountScope, providerEventId)`, canonical event hash, occurrence/acceptance/processing times, allowlisted evidence, job reference, processing outcome and recovery count. |
| `payment_observations` | One fact per processed payment/session/charge/refund/dispute/payout event, exact optional minor amount/currency, resource scope and mandatory review flag. |
| `mandate_observations` | One fact per processed mandate event, resource scope, replacement ID if supplied, and mandatory review flag. |

Composite foreign keys prevent observations from changing their source event's
provider, environment or account scope. Unique event references prevent duplicate
observations. CHECK constraints bound statuses, recovery counts, hashes, amount
sign, currency form, paired amount/currency, and mandatory review. No old table
is altered by this migration. No historical data or settlement is inferred.

Stripe integer minor amounts are accepted only when JavaScript-safe integers,
converted directly to decimal strings, and stored as `DECIMAL(20,0)`. Currency
is retained in uppercase, without assuming a currency exponent or membership
fee. The charge refund total, object status and correlated payment/charge IDs
are retained separately in selected evidence. GoCardless's standard event does
not contain a payment amount or currency: both remain NULL rather than being
invented. Provider API enrichment and payout allocation reconciliation are not
implemented in this restricted phase.

Raw request bodies, signatures, secrets, arbitrary metadata and personal payment
details are not retained. The event fingerprint covers canonical full event
content; selected evidence excludes PII. Unknown-event identity/type/hash is
retained, but arbitrary unknown payload fields cannot later be reconstructed.
Observations are append-only through this application; no database-wide
immutability or protection against privileged SQL edits is claimed.

## Atomicity, retries, ordering and recovery

1. Verify the complete signed body and each event's scope before intake writes.
2. In one serializable PostgreSQL transaction, insert any new event identities,
   enqueue their pg-boss jobs via the same Prisma transaction, and record the
   delivery receipt. Any enqueue/receipt failure rolls back all new batch work.
3. Return HTTP 200 only after commit. Invalid signed input returns 400;
   unavailable/disabled intake or persistence returns 503. Raw-body/parser limits
   return 400/413/415 without forwarding body excerpts to global error logging.
4. A processing transaction locks the event row, inserts its observation, and
   records its quarantine outcome together. Model and raw-adapter serialization
   conflicts/deadlocks are retried at most three times after the initial attempt.
5. Jobs have five retries, exponential delay from 30 seconds capped at 1,800,
   120-second leases with 30-second heartbeat, one-day pending retention and
   seven-day completed-job retention. Failed jobs go to `t38-dead`.
6. Startup and five-minute UTC recovery scan queued events in bounded pages.
   Missing jobs can be recreated atomically up to three generations. Failed,
   cancelled or anomalously completed jobs without a processed event are moved
   to review. Recovery does not endlessly restart exhausted jobs.
7. Event identities have no application TTL or deletion job; queue expiry cannot
   make an old event new. Identical duplicate deliveries get separate receipts.
   Same event ID with different canonical content is retained as an identity
   collision for review; the original evidence is never replaced.

All supported resources are quarantined because internal mappings and business
rules are unapproved. Observations preserve every fact without a mutable
"current payment status". Positive and adverse facts for the same scoped
resource flag the resource history as conflicting observations requiring review.
They may represent retries or reversals; neither occurrence timestamps nor
arrival order chooses a winning state. Different resource IDs (for example,
Stripe charge versus PaymentIntent) are not assumed to be one settlement.

## Configuration and local setup

Defaults:

```dotenv
T38_WEBHOOKS_ENABLED=false
T38_ENVIRONMENT=test
T38_STRIPE_TEST_ACCOUNT_ID=
T38_STRIPE_TEST_WEBHOOK_SECRET=
T38_GOCARDLESS_TEST_ACCOUNT_ID=
T38_GOCARDLESS_TEST_WEBHOOK_SECRET=
```

Only development/test plus `T38_ENVIRONMENT=test` may enable intake. Both providers
must have valid nonempty dedicated configuration before any payment worker starts.
Production/staging enablement and live mode are rejected. Live secret variables
are deliberately not consumed. No provider API key is required.

Against an explicitly selected local test database, apply the application and
independent pinned queue schemas before enabling the module:

```sh
pnpm --filter @safethrift/prisma exec prisma migrate deploy
pnpm --filter @safethrift/api payments:jobs:migrate
pnpm --filter @safethrift/api build
```

The queue installer verifies committed construction SQL against pg-boss 12.38.0
and schema version 46; runtime never migrates the queue schema. Reminder queues,
schema, feature flags, retry policy and schedules are unchanged.

Test commands require explicit local `safethrift_*test` databases and
`NODE_ENV=test`. Use an empty database for migration preservation and a separate,
fully migrated database with `t38_jobs` installed for integration:

```sh
pnpm --filter @safethrift/api test --runInBand
NODE_ENV=test T38_TEST_DATABASE_URL="$T38_INTEGRATION_DB" pnpm --filter @safethrift/api test:payment-webhooks
NODE_ENV=test T38_MIGRATION_TEST_DATABASE_URL="$T38_MIGRATION_DB" pnpm --filter @safethrift/api test:payment-migrations
```

CI now installs the isolated queue schema and runs both T38 database checks.

## Verification results

Verified locally on 2026-10-26 with Node 22.21.1, PostgreSQL 16.15,
Prisma CLI/client generation 7.8.0 and pg-boss 12.38.0:

| Check | Exact result |
| --- | --- |
| Prisma client generation | Passed. |
| Prisma validation | Passed. |
| API TypeScript `tsc --noEmit` | Passed. |
| Full API ESLint, without automatic fixes | Passed, no warnings/errors. |
| API Nest build | Passed. |
| API unit tests | 6 suites, 36 tests passed. |
| T38 real PostgreSQL integration | 16 tests passed; no failures/skips. |
| T38 historical migration preservation | Passed, including nested T37 and T36 preservation checks; every preexisting public table unchanged, four evidence tables empty after migration. |
| Fresh migration deployment | All seven application migrations applied successfully to isolated test databases. |
| Pinned T38 queue installation | Passed; schema version 46 in separate `t38_jobs`. |
| T25 savings and T37 governance PostgreSQL regressions | 2 suites, 33 tests passed. |
| Unchanged T36 PostgreSQL integration | 16 tests passed. |
| Patch whitespace check | `git diff --check` passed. |
| Protected scope comparison | No diff in T25 savings, T36 reminder/jobs, T37 governance, membership/loan service source, T39/web source, or existing migrations. |

The T38 integration suite verifies exact HTTP raw bytes, signature tampering,
unsigned input, replay tolerance, account/environment isolation, duplicate intake
and concurrent processing, GoCardless multi-event envelopes, unknown events,
out-of-order and conflicting facts, queue-deletion replays, whole-batch enqueue
rollback, HTTP 503 plus complete rollback on final receipt constraint failure,
observation/final-status atomicity, bounded concurrent recovery, abandoned lease
expiration, transient worker retry, dead-letter/review handling, identity
collisions, composite scope constraints, disabled execution, and Nest shutdown.
Snapshots compare every non-T38 public table before/after, including a real
pending registration and a nonzero savings fixture; webhook metadata targeting
the fixture cannot change it.

Tests used separate local databases for T38, migration preservation, and existing
regressions, without application credentials or provider API keys. No provider
network calls were made. The unchanged T36 suite emitted its existing pg
concurrent-query deprecation warning; tests still passed. Full auth-security,
app smoke, web, and hosted provider suites were not run in this continuation.
Initial T38 concurrency runs exposed a real duplicate-observation race; event
row locking plus bounded retries for Prisma model conflicts and the observed
pg-adapter SQLSTATE 40001 representation resolved it. Final tests pass.

The temporary PostgreSQL server was stopped after verification.

## Changed-file inventory

New implementation:

- `apps/api/src/modules/payment-webhooks/payment-webhook.config.ts`
- `apps/api/src/modules/payment-webhooks/payment-webhook.policy.ts`
- `apps/api/src/modules/payment-webhooks/payment-webhook-body.ts`
- `apps/api/src/modules/payment-webhooks/payment-webhooks.controller.ts`
- `apps/api/src/modules/payment-webhooks/payment-webhooks.service.ts`
- `apps/api/src/modules/payment-webhooks/payment-webhooks.module.ts`
- `apps/api/src/modules/payment-webhooks/payment-jobs.service.ts`

New verification and operations:

- `apps/api/src/modules/payment-webhooks/payment-webhook.spec.ts`
- `apps/api/test/payment-webhooks.integration.test.mjs`
- `apps/api/test/verify-payment-migration.mjs`
- `apps/api/scripts/migrate-payment-jobs.mjs`
- `packages/prisma/pgboss/12.38.0-payment-install.sql`
- `packages/prisma/prisma/migrations/20261026010000_payment_webhook_evidence/migration.sql`
- `docs/T38-payment-webhook-evidence.md`

Modified integration points:

- `apps/api/src/app.module.ts`: register the isolated module.
- `apps/api/src/main.ts`: register the bounded raw-body parser.
- `apps/api/src/core/config/env.validation.ts`: fail closed on T38 configuration.
- `apps/api/.env.example`: disabled-by-default test-only configuration.
- `apps/api/package.json` and `pnpm-lock.yaml`: pinned Stripe SDK and direct
  Express 5.2.1 dependency matching Nest's existing version; verification scripts.
- `packages/prisma/prisma/schema.prisma`: four additive evidence models.
- `.github/workflows/ci.yml`: payment schema installation and database checks.


## Remaining boundaries and decisions

- No hosted provider delivery or dashboard registration was performed. Fixtures
  use official signature generation/local HMAC and real PostgreSQL/pg-boss.
- No live keys, collection, refund, mandate action, payment initiation or provider
  reconciliation request is implemented.
- This is review-only evidence reconciliation, not proof of bank settlement or
  a mapping to a membership fee. GoCardless amounts require future trusted API
  enrichment; payout allocation and fee accounting require separate rules.
- No replay UI, manual retry endpoint, retention purge or automatic remediation
  of quarantined resources is introduced. Operations can inspect durable tables
  and queues; retention/access policy needs approval before hosted use.
- Provider endpoint secrets must be correctly paired with their test account or
  organisation. Own-account Stripe events and GoCardless sandbox identity rely
  on that trusted endpoint configuration. Secret rotation requires coordinated
  configuration updates; simultaneous old/new secrets are not implemented.
- Body limit is 512 KiB. A larger signed batch must not be silently accepted;
  any future limit increase needs review. Pre-parser/disabled requests do not
  create durable delivery receipts; application-level verification rejections do.
- Membership fee amounts, waivers, periods, review/payment ordering, activation,
  settlement threshold, refunds/disputes, overpayments, dual-provider payments
  and financial posting all remain unapproved. Existing admin approval behavior
  must be resolved separately before payment-driven activation.
