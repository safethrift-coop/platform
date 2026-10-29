# T38 replacement ownership and recovery cleanup candidate — NOT APPLIED

Prepared on main, HEAD f75c4515e7f54d228354b87439e3adbd518c740a.
Target: `apps/api/test/payment-webhooks.integration.test.mjs`.
Approved starting SHA-256: `4e9da7737e7bd3367dc340ec71595e42b1a3c5ad23ccb06a5e7883e091432a20`.
Candidate patch SHA-256: `90231e3d25ae40a4375d4f9c38bbc7399642e01b5b10ed867a672101dd4aba27`.
Proposed source SHA-256: `9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a`.

This candidate replaces the historical seven-hunk proposal. Historical artifacts
are unchanged. It is a complete diff against the approved current starting file,
not an incremental patch. Do not apply both candidates.

## Every changed hunk

1. Import beforeEach for the cleanup-failure barrier.
2. Add a process-local fixtureCleanupBlocked latch, initially false.
3. Replace the provider-ID set with a persisted-identity map; remove helper-level
   registration in favor of centralized successful-intake observation.
4. Add ownedPendingFixtures and prepareOwnedFixtures. Resolve registered primary
   IDs plus full provider/environment/accountScope/providerEventId identities.
   Require each pending job's ID to equal the persisted jobId AND its payload
   eventId to equal that persisted event's ID. Validate the entire pending set
   before mutation; reject unknown jobs and all active leases. Process only owned
   sibling events, cancel exact created/retry sibling job IDs, and check cancelled
   state. Preserve the target and all terminal rows.
5. Wrap only this suite's service.receive instance before controller injection.
   Await the original method, then parse accepted inputs and resolve each distinct
   scoped identity using findUniqueOrThrow. Register supported and ignored events.
   Rejected or rolled-back original intake throws before registration. All helper,
   direct-service, and HTTP paths use this instance; no production prototype changes.
6. Add beforeEach barrier and guarded afterEach: explicitly wait for evidence
   workers to drain, refuse mutation after recovery cleanup errors, validate the
   full pending set, cancel exact owned created/retry jobs with diagnostics and
   post-state checks. Any hook error latches the failure; later test bodies fail
   before running, and later hooks drain but refuse fixture cancellation.
7. Remove the obsolete HTTP-path ownedProviderEventIds.add added by 7601f49.
8. Remove the obsolete concurrent direct-service registration added by 7601f49.
9. Preserve ignored GoCardless persistence and additionally require unsupported_event
   reason and null jobId.
10. Replace recovery's weaker provider-ID-only preparation with the shared helper.
11. Replace recovery target cancellation with post-shutdown inspection, and replace
    exhaustion's unscoped processing/cancellation with the shared helper. Inspect
    late monitor errors. Record recovery target job/event IDs, state and retryCount;
    revalidate persisted ownership and broker payload, reject active leases, and
    require completed state on a successful body. Latch any cleanup error.

## Recovery state transitions and failure precedence

Normal path remains unchanged: target created -> manually fetched active at
retryCount 0 -> expired retry at retryCount 0 -> worker delivery at retryCount 1
throws the synthetic failure -> delivery at retryCount 2 processes the event ->
broker completed, business quarantined, exactly one durable observation. The exact
update/fetch/retry/delivery/completion/quarantine/observation assertion block is
byte-for-byte preserved. Finally drains the worker, stops the monitor, checks late
monitor errors and inspects target evidence without cancelling it.

Unexpected body failure: the existing catch marks failed and rethrows the original
error. Finally independently attempts every bounded cleanup operation, records all
errors through t.diagnostic, and does not replace the original body error with an
AggregateError. Active target evidence is diagnosed and rejected, never cancelled
by recovery finally. The failure latch prevents afterEach from cancelling it and
blocks subsequent test bodies. If no active lease exists and shutdown/inspection
succeed, ordinary afterEach may cancel proven-owned created/retry fixtures, with
post-state verification; the original test still fails. A terminal target is kept.

Cleanup-only failure: all cleanup errors are retained and diagnosed; the original
AggregateError behavior fails an otherwise successful body. The latch also makes
teardown fail and blocks subsequent fixture mutation. Missing broker evidence,
changed identity/payload linkage, late monitor errors and active leases are cleanup
failures, not successful teardown.

Failure immediately after manual fetch: expect original injected error, diagnostic
active target, a cleanup error, failed hook/barrier, and retained active broker row.
Do not run the next normal suite or wait for expiration to claim successful cleanup.
This intentionally replaces the historical review's expectation of active-target
cancellation. If the actual broker state has changed naturally, record that state
and establish full cleanup before considering any further run; never force it.

## Bounded cleanup conflict and limits

The existing Promise.race bounds reporting, not operation execution. A timed-out
stop/offWork/inspection can continue after the timeout. No test-only assertion can
prove such an operation was aborted. The smallest adjustment here preserves the
budgets and independent cleanup attempts, reports every error, and latches the run
as failed so later fixture mutation cannot treat timeout as successful teardown.
Runtime process/session inspection remains required. No timeout was increased.

Ownership validation and cancellation are separate broker operations, so exclusive
DB use is mandatory; this is not an atomic defense against concurrent writers or
workers. No queue-wide cancellation is introduced. afterEach's database/broker calls
retain the suite's existing outer timeout rather than adding cancellation semantics.
The original suite-wide after hook checks preservation before resource cleanup; a
snapshot assertion failure can prevent later closes. This remains a disclosed
preexisting limitation, not proof of teardown safety. The failure latch does not
stop Node reporting later failed hooks; it prevents their bodies from executing.
The original service recover and final Nest context can inspect queued events;
negative diagnostics must exclude later lifecycle cases with targeted selection.

Post-commit instrumentation reads can fail after original intake commits. Such a
failure must remain a failure; no rollback is inferred. Registry scope is read
after receive, assuming fixture configuration stays stable during intake. Existing
nonownership eventRow helper remains unchanged; ownership checks use full identities.

## Static verification performed

- Branch main; starting working tree/index clean; target hash matches approval.
- Complete 11-hunk diff targets exactly the approved test file.
- git apply --check --whitespace=error-all passes against the untouched target.
- Applied only to a fresh temporary copy; resulting bytes match prepared source.
- node --check passes on the applied temporary source.
- No ownedProviderEventIds references remain in proposed source.
- All 16 existing test names and their order are preserved.
- Original recovery update/fetch/retry/assertion block is byte-for-byte preserved.
- Original exhaustion update/fetch/fail/review/dead-letter assertion block preserved.
- git diff --check passes; patch and proposed source have no trailing whitespace.
- No production, migrations, CI, app, queue configuration or historical artifact edits.
- No database, browser, integration suite, service or financial execution run.

## Runtime verification plan — requires separate approval

1. Recheck main, target and patch hashes, scope and index. Apply only this reviewed
   replacement after explicit approval. Build required API output without source
   changes; run syntax and whitespace checks again.
2. Create one NEW exclusive local safethrift_t38_recovery_*test database. Apply
   existing application migrations and pinned installer; verify pg-boss 12.38.0,
   schema 46, no unexpected sessions and no preexisting evidence jobs. Never reuse
   retained failure databases or change production queue configuration.
3. Run five complete checked-in suites sequentially on that same DB, without resets.
   Stop on first nonzero exit, failed hook, timeout, cleanup diagnostic, unknown job
   or active lease. For each retain TAP/exit/duration, target event/job IDs and exact
   retry trace 1/2, completion/quarantine/one observation, non-T38 snapshot result,
   cancellation diagnostics, all remaining nonterminal jobs, and resource/session
   shutdown evidence. Supplement assertions with read-only DB/process inspection;
   do not claim those fields are all printed by the unchanged acceptance block.
4. After five passes, inject failure immediately after target fetch only in a
   temporary diagnostic copy and select only that recovery case. Expect active
   lease preservation and verification failure. Record broker state and shutdown.
   If any lease or unresolved operation remains, STOP: no immediate normal run,
   no reset, cancellation, forced expiry or masking cleanup. Only a proven clean
   teardown with no active lease permits a subsequent approved normal run.
5. In separate isolated diagnostic DBs, select only recovery or exhaustion; seed
   unknown pending jobs, cross-scope identities, mismatched job/event payloads and
   owned active leases. Verify rejection before mutation and byte/state preservation
   of unrelated records. Do not allow later tests to touch diagnostic jobs. Inject
   stop/cancel/post-state failures in temporary copies to verify error visibility,
   original-error precedence and the latch. Inspect for continuing callbacks.
6. After successful required T38 verification, run T36, T42, relevant T37 auth,
   T40/T41, API build and applicable web typecheck/lint/production checks sequentially
   for database-wide preservation work. A deliberate active-lease failure blocks
   this readiness sequence until explicitly reviewed; it is not a passed teardown.
7. CI already provisions a dedicated T38 database in eb20253. Inspect compatibility
   at execution time; no CI changes are part of this candidate.

## Decision

Prepared only. Static review is not runtime acceptance. The deliberate-fetch failure
is designed to stop on retained active evidence, so do not promise every prior
verification step can finish automatically. T38 remediation and T42 preservation
readiness remain unverified. Await review and explicit application/runtime approval.
