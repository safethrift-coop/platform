import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { PgBoss, TestClock, getConstructionPlans } from 'pg-boss';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import databaseModule from '../dist/core/database/prisma.service.js';
import jobsModule from '../dist/core/jobs/jobs.service.js';
import remindersModule from '../dist/modules/reminders/reminders.service.js';
import deliveryModule from '../dist/modules/reminders/reminder-delivery.service.js';
import providerModule from '../dist/modules/reminders/reminder-email.provider.js';
import workersModule from '../dist/modules/reminders/reminder-workers.service.js';
import webhookModule from '../dist/modules/reminders/reminder-webhook.service.js';
import controllerModule from '../dist/modules/reminders/reminder-webhook.controller.js';
import databaseNestModule from '../dist/core/database/database.module.js';
import loggerNestModule from '../dist/core/logger/logger.module.js';
import remindersNestModule from '../dist/modules/reminders/reminders.module.js';
import scoringModule from '../dist/modules/scoring/scoring.service.js';

const url = process.env.T36_TEST_DATABASE_URL;
if (!url) throw new Error('Explicit T36_TEST_DATABASE_URL required');
const parsed = new URL(url);
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname)) throw new Error('Refusing nonlocal/non-test PostgreSQL');
process.env.DATABASE_URL = url;
process.env.T36_JOBS_ENABLED = 'true';
process.env.T36_EMAIL_MODE = 'resend'; // All sends below use injected fakes, never a network provider.
const { QUEUES, JobsService } = jobsModule;
const logger = { info() {}, warn() {}, error() {} };
let db, jobs, scan, delivery, sql, current;
let send = async () => ({ outcome: 'provider_accepted', externalId: randomUUID() });
const members = [], loans = [], applications = [], accounts = [], eventIds = [], extraBosses = [];
const now = () => new Date();
const yesterday = () => new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), now().getUTCDate() - 1));
const store = (id = current.schedule.id) => db.reminderLog.findFirstOrThrow({ where: { repaymentScheduleId: id } });
async function waitFor(fn, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const result = await fn(); if (result) return result; await delay(20); }
  throw new Error('Timed out waiting for durable job state');
}
async function fixture() {
  const id = randomUUID();
  const member = await db.member.create({ data: { id, membershipNumber: `T36-${id}`, email: `${id}@example.invalid`, firstName: '<Test>', lastName: 'Only', dateOfBirth: new Date('1990-01-01'), phoneNumber: '0000', addressLine1: 'Test', city: 'Test', postcode: 'TEST', passwordHash: 'not-a-login', membershipStatus: 'active', emailVerified: true } });
  members.push(member.id);
  const account = await db.memberAccount.create({ data: { memberId: id, accountType: 'loan', accountNumber: `T36-${id}` } }); accounts.push(account.id);
  const application = await db.loanApplication.create({ data: { memberId: id, requestedAmount: '100', loanPurpose: 'Isolated test', requestedTermMonths: 2 } }); applications.push(application.id);
  const loan = await db.loan.create({ data: { memberId: id, applicationId: application.id, loanAccountId: account.id, principalAmount: '100', termMonths: 2, installmentAmount: '50', maturityDate: new Date('2027-01-01'), loanStatus: 'active', disbursementDate: yesterday() } }); loans.push(loan.id);
  const schedule = await db.repaymentSchedule.create({ data: { loanId: loan.id, installmentNumber: 1, dueDate: yesterday(), principalDue: '50', totalDue: '50', totalPaid: '1.23', status: 'partial' } });
  return { member, account, application, loan, schedule };
}
async function fetchEmail() {
  const [job] = await jobs.boss.fetch(QUEUES.email, { includeMetadata: true });
  assert.ok(job); return { ...job, signal: new AbortController().signal };
}
async function signedEvent(externalId, type, occurred = now(), id = randomUUID(), reminderId) {
  const payload = JSON.stringify({ type, created_at: occurred.toISOString(), data: { email_id: externalId, ...(reminderId ? { tags: { t36_reminder_id: reminderId } } : {}) } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = Buffer.from('T36-test-signing-secret-only');
  process.env.T36_RESEND_WEBHOOK_SECRET = `whsec_${secret.toString('base64')}`;
  const signature = `v1,${createHmac('sha256', secret).update(`${id}.${timestamp}.${payload}`).digest('base64')}`;
  return { payload, headers: { id, timestamp, signature } };
}

describe('T36 — real PostgreSQL and pg-boss', { concurrency: false, timeout: 30000 }, () => {
  before(async () => {
    sql = new pg.Client({ connectionString: url }); await sql.connect();
    db = new databaseModule.PrismaService(); await db.onModuleInit();
    jobs = new JobsService(db, logger); await jobs.start();
    scan = new remindersModule.RemindersService(db, jobs, logger);
    delivery = new deliveryModule.ReminderDeliveryService(db, jobs, { send: (...args) => send(...args) }, logger);
  });
  beforeEach(async () => { current = await fixture(); send = async () => ({ outcome: 'provider_accepted', externalId: randomUUID() }); });
  afterEach(async () => {
    await jobs.boss.offWork(QUEUES.email);
    await jobs.boss.offWork(QUEUES.scan);
    await jobs.boss.offWork(QUEUES.events);
    await jobs.boss.offWork(QUEUES.reconcile);
    for (const boss of extraBosses.splice(0)) await boss.stop();
    // Fixture-only state change prevents old tests participating in later scans.
    await db.member.updateMany({ where: { id: { in: members } }, data: { membershipStatus: 'closed' } });
    const logs = await db.reminderLog.findMany({ where: { memberId: { in: members }, jobId: { not: null } } });
    for (const log of logs) await jobs.boss.cancel(QUEUES.email, log.jobId);
    process.env.T36_EMAIL_MODE = 'resend';
  });
  after(async () => {
    if (jobs) await jobs.stop();
    if (db) {
      const logs = await db.reminderLog.findMany({ where: { memberId: { in: members } } });
      const ids = logs.map(r => r.id);
      await db.reminderAttempt.deleteMany({ where: { reminderId: { in: ids } } });
      await db.reminderProviderEvent.deleteMany({ where: { id: { in: eventIds } } });
      await db.auditLog.deleteMany({ where: { tableName: 'reminder_logs', recordId: { in: ids } } });
      await db.reminderLog.deleteMany({ where: { id: { in: ids } } });
      await db.repaymentSchedule.deleteMany({ where: { loanId: { in: loans } } });
      await db.loan.deleteMany({ where: { id: { in: loans } } });
      await db.loanApplication.deleteMany({ where: { id: { in: applications } } });
      await db.memberAccount.deleteMany({ where: { id: { in: accounts } } });
      await db.member.deleteMany({ where: { id: { in: members } } });
      await db.onModuleDestroy();
    }
    if (sql) await sql.end();
  });

  it('queues one initial reminder atomically, preserves financial rows and suppresses later days even after job deletion', async () => {
    const before = await db.repaymentSchedule.findUnique({ where: { id: current.schedule.id } });
    const results = await Promise.all([scan.scan(), scan.scan()]);
    assert.equal(results.reduce((a,b) => a+b, 0), 1);
    const row = await store();
    assert.equal(row.sentDate, null); assert.equal(row.deliveryStatus, 'queued');
    assert.ok(await jobs.boss.getJobById(QUEUES.email, row.jobId));
    assert.equal(await db.auditLog.count({ where: { recordId: row.id } }), 1);
    await jobs.boss.deleteJob(QUEUES.email, row.jobId);
    assert.equal(await scan.scan(new Date(Date.now() + 86400000)), 0);
    assert.equal(await db.reminderLog.count({ where: { repaymentScheduleId: current.schedule.id } }), 1);
    assert.deepEqual(await db.repaymentSchedule.findUnique({ where: { id: current.schedule.id } }), before);
    assert.equal(await db.repaymentTransaction.count({ where: { loanId: current.loan.id } }), 0);
    assert.equal(await db.savingsTransaction.count({ where: { memberId: current.member.id } }), 0);
  });

  it('excludes today, paid, inactive/unverified members and defaulted/restructured/undisbursed loans', async () => {
    await db.repaymentSchedule.update({ where: { id: current.schedule.id }, data: { dueDate: new Date(new Date().toISOString().slice(0,10)) } });
    assert.equal(await scan.scan(), 0);
    await db.repaymentSchedule.update({ where: { id: current.schedule.id }, data: { dueDate: yesterday(), totalPaid: '50' } });
    assert.equal(await scan.scan(), 0);
    await db.repaymentSchedule.update({ where: { id: current.schedule.id }, data: { totalPaid: '1.23' } });
    for (const loanStatus of ['defaulted', 'restructured']) { await db.loan.update({ where: { id: current.loan.id }, data: { loanStatus } }); assert.equal(await scan.scan(), 0); }
    await db.loan.update({ where: { id: current.loan.id }, data: { loanStatus: 'active', disbursementDate: null } }); assert.equal(await scan.scan(), 0);
    await db.loan.update({ where: { id: current.loan.id }, data: { disbursementDate: yesterday() } });
    await db.member.update({ where: { id: current.member.id }, data: { emailVerified: false } }); assert.equal(await scan.scan(), 0);
    await db.member.update({ where: { id: current.member.id }, data: { emailVerified: true, membershipStatus: 'suspended' } }); assert.equal(await scan.scan(), 0);
  });

  it('rolls back reminder and audit when enqueue fails, and rolls back the queued job when audit fails', async () => {
    const original = jobs.enqueue.bind(jobs);
    jobs.enqueue = async () => { throw new Error('enqueue unavailable'); };
    try { await assert.rejects(scan.scan(), /enqueue unavailable/); } finally { jobs.enqueue = original; }
    assert.equal(await db.reminderLog.count({ where: { memberId: current.member.id } }), 0);
    const transaction = db.$transaction.bind(db);
    db.$transaction = (fn, options) => transaction(tx => fn(new Proxy(tx, { get(client, name) {
      if (name !== 'auditLog') return Reflect.get(client, name);
      return { create: args => tx.auditLog.create({ ...args, data: { ...args.data, changedBy: 'missing-t36-actor' } }) };
    } })), options);
    const before = (await jobs.boss.findJobs(QUEUES.email)).length;
    try { await assert.rejects(scan.scan()); } finally { db.$transaction = transaction; }
    assert.equal(await db.reminderLog.count({ where: { memberId: current.member.id } }), 0);
    assert.equal((await jobs.boss.findJobs(QUEUES.email)).length, before);
  });

  it('records acceptance and frozen exact payloads; queued/failed/simulated rows are not sent reminders', async () => {
    await scan.scan(); const job = await fetchEmail();
    const scoring = new scoringModule.ScoringService(db, logger);
    assert.equal(await scoring.computeResponseToReminders(current.member.id, new Date(0), new Date('2100-01-01')), 0.5);
    let captured;
    send = async (payload, key) => { captured = { payload, key }; return { outcome: 'provider_accepted', externalId: 'accepted-' + randomUUID() }; };
    await delivery.deliver(job);
    const row = await store();
    assert.equal(row.deliveryStatus, 'provider_accepted'); assert.ok(row.sentDate); assert.equal(row.deliveredAt, null);
    assert.ok(captured.payload.html.includes('£48.77')); assert.equal(captured.key, row.providerKey);
    assert.deepEqual(captured.payload, row.payload);
    assert.equal(await db.reminderAttempt.count({ where: { reminderId: row.id, outcome: 'provider_accepted' } }), 1);
    assert.equal(await scoring.computeResponseToReminders(current.member.id, new Date(0), new Date('2100-01-01')), 0);
  });

  it('retries uncertain transport outcomes with the identical provider key/body and stops beyond 23 hours', async () => {
    await scan.scan(); const job = await fetchEmail(); const sent = [];
    send = async (payload, key) => { sent.push({ payload, key }); throw new providerModule.ReminderProviderError('network_unknown', true, true); };
    await assert.rejects(delivery.deliver(job));
    assert.equal((await store()).deliveryStatus, 'uncertain');
    await assert.rejects(delivery.deliver({ ...job, retryCount: job.retryCount + 1 }));
    assert.deepEqual(sent[0], sent[1]);
    await db.reminderLog.update({ where: { id: (await store()).id }, data: { firstAttemptAt: new Date(Date.now() - 24*3600000) } });
    await delivery.deliver({ ...job, retryCount: job.retryCount + 2 });
    assert.equal(sent.length, 2); assert.equal((await store()).lastError, 'idempotency_window_expired');
  });

  it('keeps a provider-accepted/DB-write-lost outcome uncertain and safely reuses its key on recovery', async () => {
    await scan.scan(); const job = await fetchEmail(); const keys = [];
    send = async (_payload, key) => { keys.push(key); return { outcome: 'provider_accepted', externalId: 'lost-acceptance' }; };
    const transaction = db.$transaction.bind(db); let calls = 0;
    db.$transaction = (fn, options) => { if (++calls === 2) return Promise.reject(new Error('lost acceptance persistence')); return transaction(fn, options); };
    try { await assert.rejects(delivery.deliver(job)); } finally { db.$transaction = transaction; }
    assert.equal((await store()).deliveryStatus, 'uncertain');
    await delivery.deliver({ ...job, retryCount: job.retryCount + 1 });
    assert.equal((await store()).deliveryStatus, 'provider_accepted'); assert.deepEqual(keys, [keys[0], keys[0]]);
  });

  it('persists permanent failures, skips paid installments and records simulation without acceptance', async () => {
    await scan.scan(); const job = await fetchEmail();
    send = async () => { throw new providerModule.ReminderProviderError('validation_error', false); };
    await delivery.deliver(job); assert.equal((await store()).deliveryStatus, 'failed'); assert.equal((await store()).sentDate, null);
    send = async () => { throw new Error('permanent failure must not send again'); };
    await delivery.deliver({ ...job, retryCount: job.retryCount + 1 });
    current = await fixture(); await scan.scan(); const paidJob = await fetchEmail();
    await db.repaymentSchedule.update({ where: { id: current.schedule.id }, data: { totalPaid: '50', status: 'paid' } });
    await delivery.deliver(paidJob); assert.equal((await store()).deliveryStatus, 'skipped');
    current = await fixture(); await scan.scan(); const simulatedJob = await fetchEmail();
    process.env.T36_EMAIL_MODE = 'simulate';
    await new deliveryModule.ReminderDeliveryService(db, jobs, new providerModule.ResendReminderProvider(), logger).deliver(simulatedJob);
    assert.equal((await store()).deliveryStatus, 'simulated'); assert.equal((await store()).sentDate, null);
  });

  it('verifies signed raw-body webhooks, atomically deduplicates events, and rejects tampering', async () => {
    await scan.scan(); await delivery.deliver(await fetchEmail()); const row = await store();
    const webhooks = new webhookModule.ReminderWebhookService(db, jobs);
    const fixture = await Test.createTestingModule({ controllers: [controllerModule.ReminderWebhookController], providers: [{ provide: webhookModule.ReminderWebhookService, useValue: webhooks }] }).compile();
    const app = fixture.createNestApplication({ rawBody: true, logger: false }); await app.init();
    const event = await signedEvent(row.externalId, 'email.delivered'); eventIds.push(`resend:${event.headers.id}`);
    const post = body => request(app.getHttpServer()).post('/notifications/webhooks/resend').set('Content-Type','application/json').set('svix-id',event.headers.id).set('svix-timestamp',event.headers.timestamp).set('svix-signature',event.headers.signature).send(body);
    try {
      await post(event.payload + ' ').expect(401);
      await Promise.all([post(event.payload).expect(202), post(event.payload).expect(202)]);
      assert.equal(await db.reminderProviderEvent.count({ where: { id: `resend:${event.headers.id}` } }), 1);
      assert.equal(await delivery.processEvent(`resend:${event.headers.id}`), true);
      assert.equal((await store()).deliveryStatus, 'delivered');
      const old = await signedEvent(row.externalId, 'email.failed', new Date(Date.now() - 3600000)); eventIds.push(`resend:${old.headers.id}`);
      await webhooks.receive(Buffer.from(old.payload), old.headers); await delivery.processEvent(`resend:${old.headers.id}`);
      assert.equal((await store()).deliveryStatus, 'delivered');
      const newer = await signedEvent(row.externalId, 'email.bounced', new Date(Date.now() + 1000)); eventIds.push(`resend:${newer.headers.id}`);
      await webhooks.receive(Buffer.from(newer.payload), newer.headers); await delivery.processEvent(`resend:${newer.headers.id}`);
      assert.equal((await store()).deliveryStatus, 'bounced');
      await delivery.processEvent(`resend:${event.headers.id}`); assert.equal((await store()).deliveryStatus, 'bounced');
    } finally { await app.close(); }
  });

  it('reconciles webhook-before-acceptance and missing/exhausted jobs without creating a fresh reminder', async () => {
    await scan.scan(); const row = await store();
    const webhooks = new webhookModule.ReminderWebhookService(db, jobs);
    send = async () => { throw new providerModule.ReminderProviderError('response_lost', true, true); };
    await assert.rejects(delivery.deliver(await fetchEmail()));
    const event = await signedEvent('early-provider-id', 'email.delivered', now(), randomUUID(), row.id); const id = `resend:${event.headers.id}`; eventIds.push(id);
    await webhooks.receive(Buffer.from(event.payload), event.headers);
    assert.equal((await store()).deliveryStatus, 'uncertain');
    await delivery.reconcile();
    assert.equal((await store()).deliveryStatus, 'delivered');
    assert.ok((await store()).sentDate);
    const unrelated = await signedEvent('auth-email-unrelated', 'email.delivered');
    assert.deepEqual(await webhooks.receive(Buffer.from(unrelated.payload), unrelated.headers), { ignored: true });
    assert.equal(await db.reminderProviderEvent.count({ where: { id: `resend:${unrelated.headers.id}` } }), 0);
    current = await fixture(); await scan.scan(); const pending = await store();
    await jobs.boss.deleteJob(QUEUES.email, pending.jobId); await delivery.reconcile();
    assert.equal((await store()).deliveryStatus, 'failed'); assert.equal(await scan.scan(), 0);
    assert.ok(row.id);
  });

  it('runs multiple real workers without duplicate provider calls and drains before Prisma disconnect', async () => {
    await scan.scan(); let calls = 0;
    send = async () => { calls++; return { outcome: 'provider_accepted', externalId: randomUUID() }; };
    const second = new PgBoss({ connectionString: url, schema: 't36_jobs', migrate: false, schedule: false }); second.on('error', () => {}); await second.start(); extraBosses.push(second);
    await Promise.all([jobs.boss.work(QUEUES.email, { includeMetadata: true, pollingIntervalSeconds: 0.5 }, async ([job]) => delivery.deliver(job)), second.work(QUEUES.email, { includeMetadata: true, pollingIntervalSeconds: 0.5 }, async ([job]) => delivery.deliver(job))]);
    await waitFor(async () => (await store()).deliveryStatus === 'provider_accepted');
    await jobs.boss.offWork(QUEUES.email); await second.offWork(QUEUES.email);
    assert.equal(calls, 1);
    assert.equal(await db.reminderAttempt.count({ where: { reminderId: (await store()).id } }), 1);
  });

  it('recovers a killed worker and its durable in-progress attempt through PostgreSQL expiration', async () => {
    await scan.scan(); const row = await store();
    await jobs.boss.update(QUEUES.email, undefined, { id: row.jobId, expireInSeconds: 1, heartbeatSeconds: null, retryLimit: 2, retryDelay: 0, retryBackoff: false });
    const child = fork(new URL('./fixtures/t36-crash-worker.mjs', import.meta.url), { env: { ...process.env, DATABASE_URL: url }, stdio: ['ignore','ignore','inherit','ipc'] });
    try {
      const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
      try { await once(child, 'message'); } finally { clearTimeout(timeout); }
      const exit = once(child,'exit'); child.kill('SIGKILL'); await exit;
      assert.equal(await db.reminderAttempt.count({ where: { reminderId: row.id, outcome: 'attempted' } }), 1);
      await delay(1100); await jobs.boss.supervise(QUEUES.email);
      const job = await fetchEmail(); assert.equal(job.id, row.jobId); assert.ok(job.retryCount > 0);
      await delivery.deliver(job);
      assert.equal((await store()).deliveryStatus, 'provider_accepted');
      assert.equal(await db.reminderAttempt.count({ where: { reminderId: row.id, outcome: 'uncertain' } }), 1);
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
  });

  it('does not open a queue pool after shutdown interrupts startup', async () => {
    const instance = new JobsService(db, logger);
    const results = await Promise.allSettled([instance.start(), instance.stop()]);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled');
    await assert.rejects(instance.start(), /shutting down/);
  });

  it('registers UTC daily and one-recovery schedules, never renewal or SMS, and safely closes a Nest worker context', async () => {
    // Prevent this registration test from delivering fixture emails.
    process.env.T36_EMAIL_MODE = 'disabled';
    const isolatedDb = new databaseModule.PrismaService();
    const fixture = await Test.createTestingModule({ imports: [databaseNestModule.DatabaseModule, loggerNestModule.LoggerModule, remindersNestModule.RemindersModule] }).overrideProvider(databaseModule.PrismaService).useValue(isolatedDb).compile();
    const app = fixture.createNestApplication({ logger: false });
    await app.init();
    const isolatedJobs = fixture.get(JobsService);
    const schedules = await isolatedJobs.boss.getSchedules();
    const daily = schedules.find(s => s.name === QUEUES.scan);
    assert.equal(daily.cron, '0 8 * * *'); assert.equal(daily.timezone, 'UTC'); assert.equal(daily.options.missed, 'once');
    assert.ok(schedules.every(s => !/renewal|sms/.test(s.name)));
    const incoming = isolatedJobs.boss;
    await app.close();
    await assert.rejects(incoming.send(QUEUES.scan, {}));
  });
});

describe('pg-boss UTC cron, outage catch-up and retry backoff on real PostgreSQL with its supported TestClock', { concurrency: false, timeout: 30000 }, () => {
  let boss, clock, sql, schema;
  before(async () => {
    schema = 't36_clock_' + randomUUID().replaceAll('-','').slice(0,12);
    sql = new pg.Client({ connectionString: url }); await sql.connect();
    await sql.query(getConstructionPlans(schema));
    clock = new TestClock('2026-10-01T07:59:00Z');
    boss = new PgBoss({ connectionString: url, schema, migrate: false, clock }); boss.on('error', () => {}); await boss.start();
  });
  after(async () => { if (boss) await boss.stop(); if (sql) { await sql.query(`DROP SCHEMA ${schema} CASCADE`); await sql.end(); } });
  it('fires at 08:00 UTC and collapses a three-day outage into one recovery scan', async () => {
    await boss.createQueue('utc-scan', { retentionSeconds: 604800, deleteAfterSeconds: 604800 });
    await boss.schedule('utc-scan', '0 8 * * *', {}, { tz: 'UTC', missed: 'once' });
    await clock.tick(45000); assert.equal((await boss.findJobs('utc-scan')).length, 0);
    await clock.tick(90000); await waitFor(async () => (await boss.findJobs('utc-scan')).length === 1);
    await clock.setTime('2026-10-04T08:05:00Z'); await clock.tick(60000);
    await waitFor(async () => (await boss.findJobs('utc-scan')).length === 2);
    assert.equal((await boss.findJobs('utc-scan')).length, 2);
  });
  it('persists delayed exponential retries and completes after the provider recovers', async () => {
    await boss.createQueue('retry-test', { retryLimit: 2, retryDelay: 1, retryBackoff: true, retryDelayMax: 4 });
    let calls = 0;
    await boss.work('retry-test', { pollingIntervalSeconds: 0.5 }, async () => { if (++calls === 1) throw new Error('temporary provider error'); });
    const id = await boss.send('retry-test', {});
    await clock.tick(1000);
    const retry = await waitFor(async () => { const j = await boss.getJobById('retry-test', id); return j?.state === 'retry' && j; });
    assert.ok(retry.startAfter.getTime() > retry.startedOn.getTime());
    assert.ok(retry.startAfter.getTime() - retry.startedOn.getTime() <= 4000);
    await clock.tick(5000); await waitFor(async () => (await boss.getJobById('retry-test', id))?.state === 'completed');
    assert.equal(calls, 2);
  });
  it('bounds retries, retains a dead-letter outcome and cleans expired pending jobs', async () => {
    await boss.createQueue('test-dead');
    await boss.createQueue('bounded-retry', { retryLimit: 1, retryDelay: 1, retryBackoff: true, retryDelayMax: 2, deadLetter: 'test-dead' });
    let calls = 0;
    await boss.work('bounded-retry', { pollingIntervalSeconds: 0.5 }, async () => { calls++; throw new Error('provider unavailable'); });
    const id = await boss.send('bounded-retry', {});
    await clock.tick(1000);
    await waitFor(async () => (await boss.getJobById('bounded-retry', id))?.state === 'retry');
    await clock.tick(4000);
    await waitFor(async () => (await boss.getJobById('bounded-retry', id))?.state === 'failed');
    assert.equal(calls, 2);
    assert.equal((await boss.findJobs('test-dead')).length, 1);
    await boss.createQueue('pending-retention', { retentionSeconds: 1, deleteAfterSeconds: 1 });
    const pending = await boss.send('pending-retention', {});
    await clock.setTime(clock.now() + 86401000);
    await boss.supervise('pending-retention');
    assert.equal(await boss.getJobById('pending-retention', pending), null);
  });

});
