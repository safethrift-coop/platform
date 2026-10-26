# T40 membership registration technical foundation

Status: implemented locally on `main`, without commit, push, merge, deployment or
public enablement. The original T01–T52 roadmap is unchanged. T38 remains preserved
at `8da6347`; its defaults and source are unchanged.

## Authoritative workflow and restrictions

Create account → verify email → sign in → complete the original seven-step
membership application → receive a durable receipt → await separate administrative
review.

Account creation writes only a pending, unverified Member and an email-verification
secret in Redis. It does not write a MemberRegistration, submission, declaration,
fee, KYC record, account balance, savings account or financial transaction.

`POST /api/v1/membership/apply` is the sole final-submission endpoint. It requires
authentication, verified email, pending member state, and no existing submitted or
historical registration. Historical registrations are not reclassified and instead
require separate review. No existing member states are changed by migration.

This foundation accepts only synthetic local fixtures. It provides no configuration
that can enable real application collection. New fixture registrations cannot be
approved/rejected through the existing admin actions; those requests are blocked
before the old activation/account-creation code. Existing historical admin behavior
is not redesigned or represented as an approved future T40 policy.

## Collection gates

API defaults:

```dotenv
T40_APPLICATIONS_ENABLED=false
T40_FIXTURE_MODE=false
```

Any attempt to set `T40_APPLICATIONS_ENABLED` to anything except `false` fails
configuration validation. Fixture mode requires all of:

- Explicit `T40_FIXTURE_MODE=true`.
- `NODE_ENV=test`.
- Explicit PostgreSQL URL with loopback host and database name `safethrift_*test`.
- A synthetic `.invalid` account email, checked at both creation and submission.

Production/staging fixture enablement is rejected. The API also checks the gate
at request execution, so changing environment variables after startup cannot
bypass it. Application and account requests receive 403 while closed.

Frontend defaults are closed. A local preview requires `NODE_ENV=development`,
`T40_DEVELOPMENT_PREVIEW=true`, a loopback request host, and a loopback HTTP
`NEXT_PUBLIC_API_URL` ending in `/api/v1`. The final fixture button additionally
requires `T40_LOCAL_FIXTURE_SUBMISSIONS=true`; its default is false.

A production Next build renders closed notices on `/register`, `/login`, and
`/verify-email`, with no inputs/forms and noindex/no-referrer metadata. The routes
are not added to public navigation or the sitemap. Existing T39 copy remains true
and unchanged: the public website accepts no applications.

## API contracts

| Endpoint | Foundation behavior |
| --- | --- |
| `POST /api/v1/auth/register` | Account identity only: name, email, password, DOB, phone and address. Rejects membership tier, declarations, payment fields, migration status and authority fields. Fixture-gated. |
| `POST /api/v1/auth/verify-email` | UUID verification code in JSON body; never put a code in a URL. |
| `POST /api/v1/auth/login` | Existing access-token JSON / HttpOnly refresh-cookie contract; unverified accounts cannot authenticate. |
| `POST /api/v1/auth/refresh` | Existing T37 memberId locator plus HttpOnly cookie; body-secret fallback and Redis CAS implementation unchanged. |
| `GET /api/v1/membership/application` | Own-account minimal personal context, explicit not-submitted/submitted/historical-review/ineligible state, development content version, and receipt recovery. No-store. |
| `POST /api/v1/membership/apply` | Complete application plus member-scoped `Idempotency-Key`; returns durable receipt after commit. No-store. |

Intentional contract corrections:

- Old account-registration payloads containing application fields now receive 400
  rather than silently creating an application. Existing stored rows are untouched.
- Email verification uses POST with a body instead of the former token query GET.
  Notification template links contain no code; the code is separate content.
  Existing query-based verification integrations must migrate. No real verification
  emails are sent by T40 fixture mode; browser/integration tests inject a local
  in-memory mailbox rather than exposing a token endpoint.
- Account identifiers no longer use an unsafe count-plus-one membership-number
  allocator for new accounts. New values use a random UUID suffix; old numbers
  remain unchanged. Account identifiers do not represent membership approval.

The account still needs the personal fields required by the existing Member
schema. Step 1 reviews/edits a separate application snapshot after verification.
Submitting that snapshot does not change the account profile. Reducing initial
account data collection requires a later approved contract/schema decision.

Final submission payload:

```text
personalDetails: firstName, lastName, dateOfBirth, phoneNumber,
                 addressLine1, addressLine2, city, postcode
membershipType: individual | family
householdMembers: [{ fullName, dateOfBirth }]
occupation, referralSource, whyJoining
declarations: four booleans
contentVersion: t40-development-placeholder-v1
signatureText, signedDate
preferredPaymentMethod: direct_debit | bank_transfer | card
```

Unknown fields are rejected by Nest. Dates must be actual calendar dates, not
future values; the existing adult 18–120 account bounds are retained. Strings are
trimmed safely with type checks. Family requires at least one household entry;
individual rejects household entries. Twenty entries is an explicitly labelled
technical fixture limit, not an approved family eligibility policy.

## Submission identity, transaction and history

Additive migration:
`20261027010000_membership_application_submission`.

New `membership_application_submissions` table:

- Unique member ID, unique registration ID, and unique member/idempotency-key pair.
- Request fingerprint, submitted timestamp, server signature-capture timestamp,
  client-selected calendar signature date, content version and four versioned
  declaration responses.
- Personal-details snapshot and a mandatory development-fixture marker.
- Foreign keys to the member and newly created registration.
- CHECK constraints for fixture-only/content version, key/hash form, declaration
  array length, snapshot shape and signature date not after receipt date.

No UPDATE/backfill is performed against historical tables. The new table starts
empty; existing registration dates and consent/fee fields do not establish a new
submission or declaration version.

Submission holds the member row lock in a ReadCommitted Prisma transaction, then
checks current eligibility, existing receipt and historical registrations. The
registration, submission identity, durable receipt data and audit record commit
together. The audit contains identifiers/version only, not applicant details.

- Same member/key and normalized payload: original receipt, including original time.
- Same key with different payload: 409.
- Different key after submission: 409.
- Same key belonging to another member: independently scoped.
- Concurrent identical requests: same committed receipt; one registration.
- Concurrent distinct requests: one success, one conflict.
- Persistence/audit failure: all submission writes roll back and a sanitised 503
  is returned. The UI preserves the key and freezes the uncertain payload for an
  unchanged retry or receipt lookup.

One submission per member is a conservative foundation constraint, not an
approved reapplication/renewal policy. New submissions have null fee amount,
fee-paid=false, and the legacy legal-consent fields remain false/NULL.

## Seven-step interface

React Hook Form 7.91.0, Zod 4.6.7 and official resolver 6.0.0 are pinned.

1. Personal Details: review an editable synthetic application snapshot.
2. Membership Type: individual or family, without prices.
3. Household Members: conditional field array; switching to individual clears it.
4. Additional Information: bounded optional fields.
5. Declaration: four explicitly unapproved development placeholders. Both true and
   false are valid fixture responses; no credit-assessment or legal requirement
   is invented.
6. Signature and Date: typed development signature, calendar date and separate
   server capture time; no legal-signature claim.
7. Payment Method: preference enum only. No card/bank details, mandates,
   collections, transactions, payment obligations or fees.

A persistent development privacy placeholder appears through the journey,
including account, verification, login and confirmation. It is not a fabricated
privacy policy. Final receipt wording distinguishes receipt from approval and
payment. Mobile layouts, error associations, step focus and keyboard behavior
are included.

## Authentication and sensitive data

T37's backend refresh secret generation, hashing, cookie flags/path/lifetimes,
member locator, Redis CAS, authority checks and role policy are unchanged.

Frontend access tokens, member locator and unsent form values exist only in
memory. Refresh requests include credentials and only the member locator in the
body. Concurrent 401 responses share a refresh; retried submission requests retain
their exact body/key. Session generation checks prevent a delayed login/refresh
from restoring a cleared session or returning old-user context after logout.
Reload requires login again; there is no new persistent authentication mechanism.

No localStorage/sessionStorage draft, token, analytics or personal URL parameters
are introduced. Registration/auth/application POST bodies are bounded to 32 KiB;
malformed JSON, oversize and compressed-body failures are handled before global
logging so errors cannot expose password/PII excerpts. Prisma submission/account
errors are also sanitised. Application context/receipts use no-store; client
requests use no-store and credentials. Development CORS adds localhost:2025 while
preserving the old localhost:3001 origin and existing production origins.

Account creation and verification still span PostgreSQL and Redis without a
distributed transaction. A Redis outage after account creation can leave a pending
account needing verification recovery. Resend/delivery recovery and operational
mail configuration need review before real applicants; the foundation does not
claim to solve them with a new auth architecture.

## Verification

Verified locally on 2026-10-26:

- API build and Prisma schema validation pass.
- API unit tests: 7 suites, 40 tests pass.
- Full API e2e suite: 5 suites, 55 tests pass, including the 11 T40
  registration tests and existing authentication/governance/savings regressions.
- Web production build and ESLint pass.
- Production checks: 22 tests pass, including the closed registration, login and
  verification routes, public-site/SEO checks, schemas and memory-only sessions.
- T40 migration preservation passes, including the chained T37/T36/T38 historical
  preservation checks. All eight migrations deploy successfully to a fresh DB.
- T36 reminders: 16 tests pass. T38 payment webhooks: 16 tests pass.
- Individual and family browser journeys pass against real local PostgreSQL,
  Redis, API and frontend: verification/login, seven steps, household clearing,
  receipt recovery, keyboard focus, no mobile overflow, zero axe violations,
  empty browser storage and no sensitive URL parameters.
- Browser screenshots were visually reviewed. The development privacy notice
  remains present in the normal page layout; its former sticky positioning could
  obscure the confirmation heading and was removed. Browser checks pass again
  after this correction.

Synthetic browser results and screenshots are in `/tmp/safethrift-t40-browser`.
Fresh databases `safethrift_t40_test` and `safethrift_t40_migration_test` were
created in the dedicated existing SafeThrift test PostgreSQL container on
loopback port 55437; dedicated test Redis used loopback port 56437. No development
or other project's services were used. Both dedicated containers were stopped
after verification; the containers and databases are retained for inspection.

The first extra T38 regression run overlapped the full API suite and its global
database-preservation snapshot detected those concurrent fixtures. A subsequent
run passed all 16 tests with a stable snapshot. Run preservation suites without
concurrent fixture writes to their database.

The bare web `test` command requires an already-running site for its HTTP tests;
the passing `test:production` harness starts the production site itself. Next's
Turbopack build and loopback server/browser tests required execution outside the
restricted sandbox because local port binding is blocked there.

## Local reproducibility

Tests require explicit loopback test services, never development credentials or a
production fallback. Run eight application migrations first. Existing T36/T38
regressions also need their independently installed pinned queue schemas.

```sh
pnpm --filter @safethrift/prisma exec prisma generate
pnpm --filter @safethrift/prisma exec prisma validate
pnpm --filter @safethrift/api build
pnpm --filter @safethrift/web build
pnpm --filter @safethrift/api test --runInBand
pnpm --filter @safethrift/web test:registration
pnpm --filter @safethrift/web test:production
```

With `NODE_ENV=test`, explicit `T40_TEST_DATABASE_URL` and `AUTH_TEST_REDIS_URL`:

```sh
pnpm --filter @safethrift/api exec jest --config test/jest-e2e.json --runInBand registration.integration.e2e-spec.ts
pnpm --filter @safethrift/web test:registration:browser
```

The browser harness launches loopback-only API/dev servers on 3040/2025 and a fresh
headless Chrome profile. A fake mailbox transfers verification codes only through
parent/child IPC; there is no test-code HTTP endpoint in application code. HIBP and
notification delivery are faked in this harness; authentication, Redis rotation,
Prisma and PostgreSQL remain real. Browser artifacts default to
`/tmp/safethrift-t40-browser` and contain synthetic fixture information only.

For an explicitly empty database, `NODE_ENV=test` plus
`T40_MIGRATION_TEST_DATABASE_URL` runs `test:registration-migrations`, chaining the
existing historical preservation checks without resetting any database.

CI adds schema/session unit checks, T40 migration preservation, the registration
URL for the existing e2e step, production closed-route tests and synthetic browser
journeys. No CI deployment step or public collection switch was introduced.

## Decisions before completing/publicly enabling T40

- Approved privacy notice, controller/contact information, purposes, lawful bases,
  retention, rights, recipients, household-data handling and any profiling details.
- Approved terms and four exact declaration texts, versioning and requiredness;
  in particular whether credit assessment belongs in membership registration.
- Household eligibility, authority to supply another person's data and treatment
  of minors; technical array/date bounds are not an approved eligibility policy.
- Signature/date meaning and evidential retention requirements.
- Handling of historical registrations, reapplications, rejected/closed accounts
  and subsequent changes to application snapshots.
- Whether applications may open while fee amounts/waivers/periods remain undecided.
  No £30/£50 claim appears in the new flow and no fee is assigned. Old historical
  approval constants remain separate and require their own reviewed decision.
- Operational verification delivery/resend, cross-service failure recovery,
  approved site/API origins, public form abuse controls and publication approval.
- An explicit reviewed change is required to replace fixture-only database/API
  restrictions with any approved real-application contract. Environment flags
  alone cannot do that in this implementation.
