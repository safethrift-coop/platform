# T38 fixture ownership correction — proposed, not applied

Date: 2026-10-29. Branch: `main`.
Target: `apps/api/test/payment-webhooks.integration.test.mjs`.
Current target SHA-256:
`c3678cf0f7f01741951cbc9ce952c406e7c6d6f376e32efa967f8236e18ae60a`.

`candidate.patch` is a new three-hunk correction against the current working-tree
test, including the already applied recovery correction. It is not the original
missing patch, nor a replacement for the earlier reviewed artifact. Do not apply
it on top of a different baseline without checking the target first.

## Complete intake/job ownership audit

Line references below refer to the unchanged current test, before this proposal.
All incoming requests in cases 1–15 use the same explicitly constructed `service`
instance, injected into the raw-body HTTP controller by `useValue`.

| Case / current line | Event/job creation path | Current tracking gap / proposed coverage |
| --- | --- | --- |
| 1. Raw HTTP / 189 | Signed Stripe HTTP request returns 200 and commits an event and evidence job. Tampered, unsigned and oversized requests are rejected. | Successful HTTP bypasses both helpers; instance wrapper now covers it. Rejections are not registered. |
| 2. Invalid replay/scope/signature / 222 | Direct `service.receive`: expired Stripe signature, live mode, wrong Stripe account, wrong GoCardless organisation, wrong secret. | Direct calls bypass helpers, but all are expected to reject. No identity is added after a rejection; rejected delivery rows confer no ownership. |
| 3. Concurrent delivery/idempotency / 253 | Two direct concurrent Stripe receives, then processing, job deletion and another direct receive of the same event. | All three bypass helper tracking. One persisted event identity is registered idempotently; the final accepted replay adds a delivery, without recreating the deleted job. |
| 4. GoCardless batch / 284 | `receiveGc` with payment, mandate, duplicate payment and unsupported customer event. | Already helper-tracked. Wrapper tracks all distinct committed scoped identities, including the ignored event, which has no job. |
| 5. Contradictory facts / 323 | Three accepted single-event GoCardless helper calls, followed by evidence processing. | Already helper-tracked; wrapper preserves coverage. Processing creates observations, not event/jobs. |
| 6. Completion/refund/dispute / 365 | Three accepted Stripe helper calls with different facts; processing afterward. | Already helper-tracked; wrapper preserves coverage. |
| 7. Enqueue rollback / 402 | GoCardless helper invokes real enqueue once; second enqueue is forced to throw. Transaction rolls back all events/jobs/delivery. | No ownership registration after original intake rejects. No transient transaction identity is adopted. |
| 8. Final receipt rollback / 433 | Direct signed Stripe HTTP request; database receipt constraint forces rollback and HTTP 503. | Bypasses helpers but is not successful intake. Wrapper does not register a rolled-back event. |
| 9. Observation rollback / 485 | Accepted Stripe helper before a separate processing transaction is forced to fail. | Accepted event remains owned; processing rollback adds no event/job. |
| 10. Missing-job recovery / 524 | Accepted Stripe helper; explicit job deletions; concurrent/repeated `service.recover()` may enqueue replacement jobs and update the same event's jobId. | Keep ownership of persisted event identity; resolve its current jobId again at preparation time, rather than caching an obsolete broker ID. |
| 11. Worker expiration/retry / 539 | Accepted Stripe helper creates target. Manual fetch, supervision and worker retries reuse that target job. | Wrapper owns target before preparation. Existing exact job/retry assertions and cleanup are unchanged. |
| 12. Exhaustion/dead letter / 704 | Accepted Stripe helper; manual fetch/fail creates terminal failure/dead-letter effects; recovery marks review. | Event owned by wrapper. Dead-letter queue is separate from the evidence-queue ownership guard. Existing cleanup limitations below remain. |
| 13. Identity collision / 734 | Accepted Stripe helper and accepted conflicting repeat of the same provider identity; receive returns success with persisted review receipt/state. | Wrapper registers the same scoped persisted ID, not a second identity; original collision assertions remain. |
| 14. Cross-scope observation / 750 | Accepted Stripe helper; direct cross-scope observation insertion must fail. | Original accepted identity owned; failed observation insertion creates no event/job. |
| 15. Disabled/scope-changed / 770 | Accepted Stripe helper first, then processing denied under changed scope/disabled configuration; direct disabled intake rejects. | Initial event owned; rejected direct intake adds nothing. |
| 16. Nest worker lifecycle / 787 | Separate Nest module creates existing queues/schedule and may process prior queued evidence or run recovery; direct `boss.send` after shutdown must reject. | No incoming receive/HTTP request on this separate instance. Schedule/recovery queue is not claimed as a provider fixture. After-stop send is expected to create no job. No new worker is introduced by the proposal. |

Other writes in setup are member/savings fixture data, not webhook event/job
intake. The test's direct `jobs.enqueue` override delegates within the original
receive transaction and is covered by commit/rejection outcome. There are no
successful standalone direct `boss.send` calls in the suite.

The known missing HTTP fixture from the previous failed run was job
`efb2af73-feac-4246-8265-e8972ff79a56`, event
`10dce641-94bd-44ff-838e-357eec65fe00`, provider event
`evt_70711494-7858-46a1-bfbb-0b91e93aeb53`. These are historical diagnostic
identities, not hardcoded candidates or ownership exceptions. The concurrent
intake/replay fixture is also absent from the current registry, although its job
is explicitly deleted before the recovery guard, so that omission does not by
itself establish another pending-job failure at the guard.

## Minimal test-local mechanism

Wrap only the explicitly constructed test instance's `receive` method before
controller injection. The bound original implementation still performs signature
validation, scope enforcement, transactional persistence and acknowledgment.
Original failures propagate without a catch or registry write. After successful
return, parse the acknowledged input, deduplicate batch provider IDs, and look up
each event using the exact persisted composite unique key:
`provider + environment + accountScope + providerEventId`.

Only a successful `findUniqueOrThrow` registers the persisted primary ID together
with that composite identity. A Map makes accepted retries/duplicates idempotent.
Helper-only writes are removed to prevent a second, less precise registry path.
No event/job is claimed by database presence, ID prefix or accountScope alone.
No signature verifier is rerun and no raw body/signature/secret is stored in the map.

Recovery preparation re-queries the full registered identity (including primary ID)
to obtain the current persisted event/job association. A pending evidence job is
owned only if BOTH `event.jobId === job.id` and `event.id === job.data.eventId`.
The unknown-job rejection remains in place and is strengthened against a mismatched
broker payload. No delivery is filtered out of the exact retry assertion.

Production receive/controller/service source is not edited. The test wrapper adds
post-commit read queries; it does not intercept the original transaction, enqueue,
worker registration, production configuration or library prototype.

## Static verification

- `git apply --check --whitespace=error-all` passed against a clean temporary copy
  of the current target and against the untouched working-tree target.
- `node --check` passed against the proposed source under `/tmp`.
- `git diff --check` passed. New artifact text was inspected for whitespace.
- Complete three-hunk diff inspected; exactly one target path.
- Target hash unchanged after generation and verification.
- No timeout, wait, monitor/worker option, exact retry/observation assertion,
  broker/business completion condition or independent cleanup body was changed.
- No database, worker, monitor or integration suite was started in this turn.
- No new correction applied, staged, committed, pushed or deployed. Public website
  redesign and previous T38/T42 work remain untouched.

## Remaining risks / intentionally unchanged behaviour

1. Dedicated database naming is not exclusive process ownership. The full suite
   must run alone. State inspection and ID relationships do not prevent a later
   uncooperative writer from racing the guard.
2. Registry scope is this test process. Prior-run nonterminal fixtures are not
   automatically adopted. In particular, the late fail-closed case creates a queued
   fixture and the final Nest context may or may not drain it before shutdown.
   Consecutive runs could correctly reject a residual prior-run job. This has not
   been runtime-verified; do not clear/adopt such jobs merely to get a pass.
3. The later exhaustion case STILL contains its preexisting queue-wide created/retry
   cancellation loop (current lines 713–715). This proposal introduces no such loop
   and leaves that separate case unchanged. A failed earlier guard does not prevent
   Node from running later cases. Therefore the whole suite is not certified safe
   for a shared/unknown queue, and unknown-job negative verification must select
   only the recovery case. Further suite-wide cleanup containment needs separate
   review if required.
4. A tracking read can fail after successful intake has committed; that must fail
   the fixture rather than be ignored. In the HTTP path it can become a 503 even
   though original intake committed. That is test-instrumentation failure, not an
   application rollback guarantee. Successful registration assumes scope configuration
   remains stable during each await, as the existing serial test setup requires.
5. Other future service instances or HTTP fixtures must install the same test-local
   instrumentation if they accept input. The lifecycle-only Nest context currently
   accepts no incoming requests.
6. Polling deadlines are checked between awaited operations. Cleanup Promise.race
   budgets do not cancel pending database/worker operations. Node timeouts do not
   guarantee completion of finally. Current 180s suite, 90s case, two 15s polling
   phases and 5s cleanup-attempt budgets are unchanged; no increase is proposed.

## Runtime plan after approval

1. Confirm baseline hash and exact patch, apply only after approval, build API and
   run test syntax/relevant lint. Use a new dedicated local
   `safethrift_t38_recovery_*test` database with existing application migrations and
   pinned pg-boss 12.38.0/schema 46 installer. Reserve it exclusively; no T36 overlap.
2. Run five complete suites sequentially without resets. Record every exit/status,
   target event/job and exact retry metadata, one target observation, broker completed
   state, public-table invariant and post-teardown sessions/jobs. Stop on any failure,
   including correct rejection of an earlier run's residual job; propose no cleanup
   broadening without review.
3. Use a temporary diagnostic copy with one deliberate assertion immediately after
   manual fetch. Verify expected injected failure, owned target cancellation, no
   workers/monitor/active lease or cleanup errors; immediately run the complete normal
   suite in the same database without resetting it.
4. Separately use recovery-case-only diagnostic selection to verify the guard rejects
   (a) an unrelated created job, (b) the same provider ID in a different scope and
   (c) a job whose payload/event relationship mismatches. Retain unknown identities;
   do not let the later exhaustion test cancel negative fixtures. Exercise rejected
   and rollback paths and assert no registration for their uncommitted identities.
5. Investigate any cleanup timeout's pending operation rather than equating a timed
   wait with cancellation. Stop before preservation on unresolved cleanup or isolation.

These are proposed checks, not runtime results. The prior candidate passes and the
applied revision's failed run do not establish runtime success for this correction.
