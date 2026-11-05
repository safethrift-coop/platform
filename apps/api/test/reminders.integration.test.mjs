import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import twilio from 'twilio';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PgBoss, TestClock, getConstructionPlans } from 'pg-boss';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import databaseModule from '../dist/core/database/prisma.service.js';
import jobsModule from '../dist/core/jobs/jobs.service.js';
import remindersModule from '../dist/modules/reminders/reminders.service.js';
import renewalModule from '../dist/modules/reminders/renewal-scan.service.js';
import expiryModule from '../dist/modules/reminders/membership-expiry.service.js';
import deliveryModule from '../dist/modules/reminders/reminder-delivery.service.js';
import smsDeliveryModule from '../dist/modules/reminders/reminder-sms-delivery.service.js';
import twilioControllerModule from '../dist/modules/reminders/twilio-webhook.controller.js';
import smsProviderModule from '../dist/modules/reminders/reminder-sms.provider.js';
import providerModule from '../dist/modules/reminders/reminder-email.provider.js';
import workersModule from '../dist/modules/reminders/reminder-workers.service.js';
import webhookModule from '../dist/modules/reminders/reminder-webhook.service.js';
import controllerModule from '../dist/modules/reminders/reminder-webhook.controller.js';
import databaseNestModule from '../dist/core/database/database.module.js';
import loggerNestModule from '../dist/core/logger/logger.module.js';
import remindersNestModule from '../dist/modules/reminders/reminders.module.js';
import scoringModule from '../dist/modules/scoring/scoring.service.js';

const suppliedUrl = process.env.T36_TEST_DATABASE_URL;
if (process.env.T36_TEST_DATABASE_DISPOSABLE !== 'true') throw new Error('Explicit T36_TEST_DATABASE_DISPOSABLE=true confirmation required');
for (const name of ['RESEND_API_KEY', 'T36_RESEND_WEBHOOK_SECRET', 'TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID']) {
  if (process.env[name]) throw new Error(`Remove provider credential ${name} before testing`);
}
let url = suppliedUrl;
if (!url) throw new Error('Explicit T36_TEST_DATABASE_URL required');
const parsed = new URL(url);
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname)) throw new Error('Refusing nonlocal/non-test PostgreSQL');
if (parsed.search || parsed.hash) throw new Error('Database URL parameters are not permitted');
const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
if (!addresses.length || addresses.some(({ address }) => !(address.startsWith('127.') && isIP(address) === 4) && address !== '::1')) throw new Error('Database host must resolve exclusively to loopback');
// Prefer IPv4 when localhost resolves to both families: pg's connection-string
// parser retains IPv6 URL brackets in the hostname passed to DNS.
const address = addresses.find(({ address }) => isIP(address) === 4)?.address ?? addresses[0].address;
parsed.hostname = address.includes(':') ? `[${address}]` : address;
url = parsed.toString();
// Tests inject a fake provider; any accidental SDK HTTP request must fail closed.
globalThis.fetch = async () => { throw new Error('External requests forbidden in T36 integration tests'); };
process.env.DATABASE_URL = url;
process.env.T36_JOBS_ENABLED = 'true';
process.env.T36_EMAIL_MODE = 'simulate'; // Injected fakes exercise provider outcomes without enabling live delivery.
process.env.T36_SMS_MODE = 'disabled';
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

describe('T36 — real PostgreSQL and pg-boss', { concurrency: false, timeout: 60000 }, () => {
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
    for (const log of logs) await jobs.boss.cancel(log.reminderChannel === 'sms' ? QUEUES.sms : QUEUES.email, log.jobId);
    await jobs.boss.offWork(QUEUES.sms);
    process.env.T36_SMS_MODE = 'disabled';
    process.env.T36_EMAIL_MODE = 'simulate';
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

  it('enforces renewal uniqueness and rolls back expiry and reminder evidence', async () => {
    const expiryId = randomUUID(), firstId = randomUUID();
    await sql.query('BEGIN');
    try {
      await sql.query(`INSERT INTO membership_expiry_records (id, member_id, expires_on, source_reference, authority_reference) VALUES ($1, $2, CURRENT_DATE + 30, 'test', 'test')`, [expiryId, current.member.id]);
      const insert = `INSERT INTO reminder_logs (reminder_id, member_id, reminder_type, reminder_channel, membership_expiry_record_id, membership_expires_on, renewal_window_days) VALUES ($1, $2, 'membership_renewal', 'email', $3, CURRENT_DATE + 30, 30)`;
      await sql.query(insert, [firstId, current.member.id, expiryId]);
      await sql.query('SAVEPOINT duplicate_check');
      await assert.rejects(sql.query(insert, [randomUUID(), current.member.id, expiryId]), { code: '23505' });
      await sql.query('ROLLBACK TO SAVEPOINT duplicate_check');
    } finally {
      await sql.query('ROLLBACK');
    }
    assert.equal((await sql.query('SELECT 1 FROM membership_expiry_records WHERE id = $1', [expiryId])).rowCount, 0);
    assert.equal((await sql.query('SELECT 1 FROM reminder_logs WHERE reminder_id = $1', [firstId])).rowCount, 0);
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

  it('queues eligible overdue SMS independently of email exactly once under concurrent scans', async () => {
    process.env.T36_SMS_MODE = 'simulate'; process.env.T36_EMAIL_MODE = 'disabled';
    await db.member.update({ where: { id: current.member.id }, data: { emailVerified: false, phoneNumber: '+447700900123', phoneVerifiedAt: now(), phoneVerificationSource: 'test', smsReminderPermissionAt: now(), smsReminderPermissionSource: 'test' } });
    const results = await Promise.all([scan.scan(), scan.scan()]); assert.equal(results.reduce((a,b) => a+b, 0), 1);
    const rows = await db.reminderLog.findMany({ where: { memberId: current.member.id } }); assert.equal(rows.length, 1); assert.equal(rows[0].reminderChannel, 'sms');
    assert.ok(await jobs.boss.getJobById(QUEUES.sms, rows[0].jobId)); assert.equal(await db.auditLog.count({ where: { recordId: rows[0].id } }), 1);
  });
  it('does not queue SMS without verified, unrevoked permission', async () => {
    process.env.T36_SMS_MODE = 'simulate'; process.env.T36_EMAIL_MODE = 'disabled';
    const base = { phoneNumber: '+447700900123', phoneVerifiedAt: now(), phoneVerificationSource: 'test', smsReminderPermissionAt: now(), smsReminderPermissionSource: 'test', smsReminderPermissionRevokedAt: null };
    for (const changes of [{ phoneVerifiedAt: null, phoneVerificationSource: null }, { smsReminderPermissionAt: null, smsReminderPermissionSource: null }, { smsReminderPermissionRevokedAt: new Date(Date.now() + 1000) }, { phoneNumber: 'bad' }]) {
      await db.member.update({ where: { id: current.member.id }, data: { ...base, ...changes } }); assert.equal(await scan.scan(), 0);
    }
    assert.equal(await db.reminderLog.count({ where: { memberId: current.member.id } }), 0);
  });
  it('rolls back SMS reminder and pg-boss job after enqueue failure', async () => {
    process.env.T36_SMS_MODE = 'simulate'; process.env.T36_EMAIL_MODE = 'disabled';
    await db.member.update({ where: { id: current.member.id }, data: { phoneNumber: '+447700900123', phoneVerifiedAt: now(), phoneVerificationSource: 'test', smsReminderPermissionAt: now(), smsReminderPermissionSource: 'test' } });
    const original = jobs.enqueue.bind(jobs); let jobId;
    jobs.enqueue = async (...args) => { jobId = await original(...args); throw new Error('sms enqueue failure'); };
    try { await assert.rejects(scan.scan(), /sms enqueue failure/); } finally { jobs.enqueue = original; }
    assert.ok(jobId); assert.ok(!(await jobs.boss.getJobById(QUEUES.sms, jobId))); assert.equal(await db.reminderLog.count({ where: { memberId: current.member.id } }), 0);
  });
  it('rolls back overdue SMS, the pg-boss job, and audit on an audit insertion failure', async () => {
    process.env.T36_SMS_MODE = 'simulate'; process.env.T36_EMAIL_MODE = 'disabled';
    await db.member.update({ where: { id: current.member.id }, data: { phoneNumber: '+447700900123', phoneVerifiedAt: now(), phoneVerificationSource: 'test', smsReminderPermissionAt: now(), smsReminderPermissionSource: 'test' } });
    const transaction = db.$transaction.bind(db), original = jobs.enqueue.bind(jobs); let jobId, reminderId, providerCalls = 0;
    const provider = { send: async () => { providerCalls++; return { outcome: 'simulated' }; } };
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), provider);
    await jobs.boss.work(QUEUES.sms, { includeMetadata: true, pollingIntervalSeconds: 0.5 }, async ([job]) => service.deliver(job));
    jobs.enqueue = async (...args) => { reminderId = args[2].reminderId; jobId = await original(...args); return jobId; };
    db.$transaction = (fn, options) => transaction(tx => fn(new Proxy(tx, { get(client, name) {
      if (name !== 'auditLog') return Reflect.get(client, name);
      return { create: args => tx.auditLog.create({ ...args, data: { ...args.data, changedBy: 'missing-t36-actor' } }) };
    } })), options);
    try { await assert.rejects(scan.scan()); } finally { db.$transaction = transaction; jobs.enqueue = original; }
    assert.ok(jobId); assert.equal(await db.reminderLog.count({ where: { id: reminderId } }), 0);
    assert.ok(!(await jobs.boss.getJobById(QUEUES.sms, jobId)));
    await delay(750); await jobs.boss.offWork(QUEUES.sms);
    assert.equal(await db.auditLog.count({ where: { recordId: reminderId } }), 0); assert.equal(providerCalls, 0);
  });
  async function smsFixture() {
    process.env.T36_SMS_MODE = 'simulate';
    process.env.T36_TWILIO_STATUS_CALLBACK_URL = 'https://example.invalid/status';
    await db.member.update({ where: { id: current.member.id }, data: { phoneNumber: '+447700900123', phoneVerifiedAt: now(), phoneVerificationSource: 'test', smsReminderPermissionAt: now(), smsReminderPermissionSource: 'test' } });
    const id = randomUUID(), jobId = randomUUID();
    await db.reminderLog.create({ data: { id, memberId: current.member.id, relatedLoanId: current.loan.id, repaymentScheduleId: current.schedule.id, reminderType: 'late_payment', reminderChannel: 'sms', jobId, providerKey: `t36-sms/${id}` } });
    await jobs.boss.send(QUEUES.sms, { reminderId: id }, { id: jobId });
    const job = { id: jobId, data: { reminderId: id }, retryCount: 0, retryLimit: 5, signal: new AbortController().signal };
    return { id, job };
  }
  it('serializes concurrent SMS claims, persists before dispatch, and never repeats a job', async () => {
    const { id, job } = await smsFixture(); let calls = 0, release, started;
    const entered = new Promise(resolve => { started = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    const provider = { send: async payload => { calls++; const row = await db.reminderLog.findUniqueOrThrow({ where: { id } }); assert.equal(row.deliveryStatus, 'dispatch_claimed'); assert.deepEqual(row.payload, payload); started(); await blocked; return { outcome: 'simulated' }; } };
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), provider);
    const first = service.deliver(job); await entered;
    await Promise.all([service.deliver(job), service.deliver({ ...job, retryCount: 1 })]);
    assert.equal(calls, 1); assert.equal(await db.reminderAttempt.count({ where: { reminderId: id, outcome: 'dispatch_claimed' } }), 1);
    release(); await first; await service.deliver(job);
    assert.equal(calls, 1); assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'simulated');
  });
  it('runs two real pg-boss SMS workers with one fake-provider call', async () => {
    const { id } = await smsFixture(); let calls = 0;
    const provider = { send: async () => { calls++; return { outcome: 'simulated' }; } };
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), provider);
    const second = new PgBoss({ connectionString: url, schema: 't36_jobs', migrate: false, schedule: false }); second.on('error', () => {}); await second.start(); extraBosses.push(second);
    const handler = async ([job]) => service.deliver(job);
    await Promise.all([jobs.boss.work(QUEUES.sms, { includeMetadata: true, pollingIntervalSeconds: 0.5 }, handler), second.work(QUEUES.sms, { includeMetadata: true, pollingIntervalSeconds: 0.5 }, handler)]);
    await waitFor(async () => (await db.reminderLog.findUnique({ where: { id } }))?.deliveryStatus === 'simulated');
    await jobs.boss.offWork(QUEUES.sms); await second.offWork(QUEUES.sms);
    assert.equal(calls, 1); assert.equal(await db.reminderAttempt.count({ where: { reminderId: id } }), 1);
  });
  it('allows only one of two simultaneous PostgreSQL SMS claims and one provider create', async () => {
    const { id, job } = await smsFixture(); let calls = 0;
    process.env.T36_SMS_MODE = 'twilio'; process.env.T36_TWILIO_FAKE_ENABLED = 'true';
    const provider = new smsProviderModule.TwilioReminderProvider({ messages: { create: async () => { calls++; return { sid: 'SM' + 'b'.repeat(32) }; } } });
    const a = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), provider);
    const b = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), provider);
    try { await Promise.all([a.deliver(job), b.deliver(job)]); } finally { delete process.env.T36_TWILIO_FAKE_ENABLED; }
    assert.equal(calls, 1); assert.equal(await db.reminderAttempt.count({ where: { reminderId: id } }), 1);
  });
  it('does not dispatch a persisted claim after restart before a request', async () => {
    const { id, job } = await smsFixture(); const token = randomUUID();
    await db.$transaction(async tx => {
      await tx.reminderAttempt.create({ data: { id: token, reminderId: id, jobId: job.id, retryCount: 0, outcome: 'dispatch_claimed' } });
      await tx.reminderLog.update({ where: { id }, data: { deliveryStatus: 'dispatch_claimed', attemptToken: token, firstAttemptAt: now(), payload: { to: '+447700900123', body: 'frozen', statusCallback: 'https://example.invalid/status' } } });
    });
    let calls = 0; const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), { send: async () => { calls++; return { outcome: 'simulated' }; } });
    await service.deliver({ ...job, retryCount: 1 }); assert.equal(calls, 0);
    assert.equal(await db.reminderAttempt.count({ where: { reminderId: id } }), 1);
  });
  it('persists an ambiguous Twilio 5xx as uncertain and does not call again', async () => {
    const { id, job } = await smsFixture(); let calls = 0;
    process.env.T36_SMS_MODE = 'twilio'; process.env.T36_TWILIO_FAKE_ENABLED = 'true';
    const adapter = new smsProviderModule.TwilioReminderProvider({ messages: { create: async () => { calls++; throw { status: 503 }; } } });
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), adapter);
    try { await service.deliver(job); await service.deliver({ ...job, retryCount: 1 }); } finally { delete process.env.T36_TWILIO_FAKE_ENABLED; }
    assert.equal(calls, 1); assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'uncertain');
  });
  it('survives a worker restart after claim and a provider outcome lost after acceptance', async () => {
    const { id, job } = await smsFixture(); let calls = 0, release, started;
    const entered = new Promise(resolve => { started = resolve; }); const blocked = new Promise(resolve => { release = resolve; });
    const provider = { send: async () => { calls++; started(); await blocked; return { outcome: 'provider_accepted', externalId: 'SM' + 'a'.repeat(32) }; } };
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), provider);
    const first = service.deliver(job); await entered;
    const restarted = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), provider);
    await restarted.deliver({ ...job, retryCount: 1 }); assert.equal(calls, 1);
    const transaction = db.$transaction.bind(db); db.$transaction = () => Promise.reject(new Error('injected persistence failure'));
    release(); try { await assert.rejects(first, /injected persistence failure/); } finally { db.$transaction = transaction; }
    assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'dispatch_claimed');
    await restarted.deliver({ ...job, retryCount: 2 }); assert.equal(calls, 1);
  });
  it('validates signed Twilio callbacks and preserves terminal status across duplicates and out-of-order events', async () => {
    const { id, job } = await smsFixture();
    process.env.T36_TWILIO_STATUS_CALLBACK_URL = 'https://example.invalid/api/v1/notifications/webhooks/twilio';
    process.env.TWILIO_AUTH_TOKEN = 'test-only-token'; process.env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32);
    const sid = 'SM' + randomUUID().replaceAll('-', '');
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), { send: async () => ({ outcome: 'provider_accepted', externalId: sid }) });
    await service.deliver(job);
    const row = await db.reminderLog.findUniqueOrThrow({ where: { id } });
    const url = new URL(row.payload.statusCallback);
    const fixture = await Test.createTestingModule({ controllers: [twilioControllerModule.TwilioWebhookController], providers: [{ provide: databaseModule.PrismaService, useValue: { $transaction: db.$transaction.bind(db) } }] }).compile();
    const app = fixture.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1'); await app.init();
    const sendCallback = (body, signature) => request(app.getHttpServer()).post(url.pathname + url.search).type('form').set('x-twilio-signature', signature).send(body);
    const body = status => ({ AccountSid: process.env.TWILIO_ACCOUNT_SID, MessageSid: sid, MessageStatus: status });
    const sign = params => twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN, url.toString(), params);
    try {
      const delivered = body('delivered'); await sendCallback(delivered, 'invalid').expect(401);
      const wrongAccount = { ...delivered, AccountSid: 'AC' + 'c'.repeat(32) }; await sendCallback(wrongAccount, sign(wrongAccount)).expect(400);
      const wrongSid = { ...delivered, MessageSid: 'SM' + 'd'.repeat(32) }; await sendCallback(wrongSid, sign(wrongSid)).expect(400);
      await sendCallback(delivered, sign(delivered)).expect(204); await sendCallback(delivered, sign(delivered)).expect(204);
      const failed = body('failed'); await sendCallback(failed, sign(failed)).expect(204);
      for (const event of [delivered, failed]) eventIds.push('twilio:' + createHash('sha256').update(JSON.stringify([sid, event.MessageStatus, ''])).digest('hex'));
      assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'delivered');
      assert.equal(await db.reminderProviderEvent.count({ where: { externalId: sid } }), 2);
    } finally { await app.close(); delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_ACCOUNT_SID; }
  });
  it('correlates a delayed signed SMS callback after an uncertain provider outcome', async () => {
    const { id, job } = await smsFixture();
    process.env.T36_TWILIO_STATUS_CALLBACK_URL = 'https://example.invalid/api/v1/notifications/webhooks/twilio';
    process.env.TWILIO_AUTH_TOKEN = 'test-only-token'; process.env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32);
    let calls = 0; const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), { send: async () => { calls++; throw new Error('timeout'); } });
    await service.deliver(job); const row = await db.reminderLog.findUniqueOrThrow({ where: { id } }); assert.equal(row.deliveryStatus, 'uncertain');
    const url = new URL(row.payload.statusCallback), sid = 'SM' + randomUUID().replaceAll('-', '');
    const params = { AccountSid: process.env.TWILIO_ACCOUNT_SID, MessageSid: sid, MessageStatus: 'delivered' };
    const signature = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN, url.toString(), params);
    const fixture = await Test.createTestingModule({ controllers: [twilioControllerModule.TwilioWebhookController], providers: [{ provide: databaseModule.PrismaService, useValue: { $transaction: db.$transaction.bind(db) } }] }).compile();
    const app = fixture.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1'); await app.init();
    try {
      await request(app.getHttpServer()).post(url.pathname + url.search).type('form').set('x-twilio-signature', signature).send(params).expect(204);
      eventIds.push('twilio:' + createHash('sha256').update(JSON.stringify([sid, 'delivered', ''])).digest('hex'));
      const updated = await db.reminderLog.findUniqueOrThrow({ where: { id } }); assert.equal(updated.deliveryStatus, 'delivered'); assert.equal(updated.externalId, sid);
      await service.deliver({ ...job, retryCount: 1 }); assert.equal(calls, 1);
    } finally { await app.close(); delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_ACCOUNT_SID; }
  });
  it('reconciles a missing claimed job to uncertainty without another send', async () => {
    const { id, job } = await smsFixture(); const token = randomUUID(); let calls = 0;
    await db.$transaction(async tx => {
      await tx.reminderAttempt.create({ data: { id: token, reminderId: id, jobId: job.id, retryCount: 0, outcome: 'dispatch_claimed' } });
      await tx.reminderLog.update({ where: { id }, data: { deliveryStatus: 'dispatch_claimed', attemptToken: token, firstAttemptAt: now() } });
    });
    await jobs.boss.deleteJob(QUEUES.sms, job.id);
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), { send: async () => { calls++; return { outcome: 'simulated' }; } });
    await service.reconcile(jobs); assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'uncertain');
    await service.deliver({ ...job, retryCount: 1 }); assert.equal(calls, 0);
  });
  it('records dead-letter evidence without dispatching a failed SMS job', async () => {
    const { id, job } = await smsFixture();
    await jobs.boss.update(QUEUES.sms, undefined, { id: job.id, retryLimit: 0 });
    const [active] = await jobs.boss.fetch(QUEUES.sms, { includeMetadata: true }); assert.equal(active.id, job.id);
    await jobs.boss.fail(QUEUES.sms, job.id);
    const dead = await jobs.boss.findJobs(QUEUES.dead, { data: { reminderId: id } }); assert.equal(dead.length, 1);
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), { send: async () => { throw new Error('must not send'); } });
    await service.reconcile(jobs); assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).lastError, 'sms_job_dead_lettered');
    await jobs.boss.deleteJob(QUEUES.dead, dead[0].id);
  });
  it('rejects an email reminder at the SMS worker', async () => {
    await scan.scan(); const row = await store(); let calls = 0;
    process.env.T36_SMS_MODE = 'simulate';
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), { send: async () => { calls++; return { outcome: 'simulated' }; } });
    await assert.rejects(service.deliver({ id: row.jobId, data: { reminderId: row.id }, retryCount: 0, retryLimit: 5, signal: new AbortController().signal }), /channel mismatch/);
    assert.equal(calls, 0);
  });
  it('naturally expires and retries an orphaned SMS job without a second provider request', { timeout: 25000 }, async () => {
    const { id, job } = await smsFixture(); let calls = 0, first, restarted, supervisor;
    await jobs.boss.update(QUEUES.sms, undefined, { id: job.id, expireInSeconds: 1, heartbeatSeconds: null, retryLimit: 2, retryDelay: 0, retryBackoff: false });
    const spawn = point => fork(new URL('./fixtures/t36-sms-crash-worker.mjs', import.meta.url), { env: { ...process.env, T36_JOB_ID: job.id, T36_REMINDER_ID: id, T36_CRASH_POINT: point }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    try {
      first = spawn('accepted-before-persistence');
      const [claim] = await once(first, 'message', { signal: AbortSignal.timeout(8000) }); assert.equal(claim.event, 'accepted-before-persistence'); calls++;
      const firstExit = once(first, 'exit'); first.kill('SIGKILL'); await firstExit;
      assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'dispatch_claimed');
      const orphan = await jobs.boss.getJobById(QUEUES.sms, job.id); assert.equal(orphan.state, 'active');
      supervisor = new PgBoss({ connectionString: url, schema: 't36_jobs', migrate: false, schedule: false, superviseIntervalSeconds: 1, monitorIntervalSeconds: 1 }); supervisor.on('error', () => {}); await supervisor.start();
      restarted = spawn('unexpected-create');
      const [result] = await once(restarted, 'message', { signal: AbortSignal.timeout(15000) });
      if (result.event === 'unexpected-create') calls++;
      assert.equal(result.event, 'done');
      await waitFor(async () => (await jobs.boss.getJobById(QUEUES.sms, job.id))?.state === 'completed', 5000);
      const recovered = await jobs.boss.getJobById(QUEUES.sms, job.id); assert.ok(recovered.retryCount > 0);
      assert.equal(calls, 1); assert.equal(await db.reminderAttempt.count({ where: { reminderId: id, outcome: 'dispatch_claimed' } }), 1);
    } finally {
      for (const child of [first, restarted]) if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
      if (supervisor) await supervisor.stop();
    }
  });
  for (const point of ['before-create', 'accepted-before-persistence']) {
    it(`survives an actual SMS process kill at ${point} without a second request`, async () => {
      const { id, job } = await smsFixture(); let calls = 0;
      await jobs.boss.update(QUEUES.sms, undefined, { id: job.id, expireInSeconds: 1, heartbeatSeconds: null, retryLimit: 2, retryDelay: 0, retryBackoff: false });
      const spawn = crashPoint => fork(new URL('./fixtures/t36-sms-crash-worker.mjs', import.meta.url), { env: { ...process.env, T36_JOB_ID: job.id, T36_REMINDER_ID: id, T36_CRASH_POINT: crashPoint }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      const child = spawn(point);
      try {
        const [msg] = await once(child, 'message', { signal: AbortSignal.timeout(12000) }); assert.equal(msg.event, point);
        if (point === 'accepted-before-persistence') calls++;
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
        assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'dispatch_claimed');
        // Explicitly fail the orphaned pg-boss attempt so its configured retry is replayed.
        await jobs.boss.fail(QUEUES.sms, job.id);
        const restarted = spawn('unexpected-create');
        try { const [restart] = await once(restarted, 'message', { signal: AbortSignal.timeout(12000) }); if (restart.event === 'unexpected-create') calls++; assert.equal(restart.event, 'done'); await waitFor(async () => (await jobs.boss.getJobById(QUEUES.sms, job.id))?.state === 'completed'); const exit = once(restarted, 'exit'); restarted.kill('SIGTERM'); await exit; } finally { if (restarted.exitCode === null && restarted.signalCode === null) restarted.kill('SIGKILL'); }
        assert.equal(calls, point === 'accepted-before-persistence' ? 1 : 0);
        assert.equal(await db.reminderAttempt.count({ where: { reminderId: id } }), 1);
      } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
    });
  }
  it('does not claim on a pre-claim transaction failure and safely claims on retry', async () => {
    const { id, job } = await smsFixture(); let calls = 0;
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), { send: async () => { calls++; return { outcome: 'simulated' }; } });
    const transaction = db.$transaction.bind(db); db.$transaction = () => Promise.reject(new Error('pre-claim failure'));
    try { await assert.rejects(service.deliver(job), /pre-claim failure/); } finally { db.$transaction = transaction; }
    assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'queued'); assert.equal(calls, 0);
    await service.deliver(job); assert.equal(calls, 1);
  });
  it('persists uncertain SMS outcomes and never resends on restart', async () => {
    const { id, job } = await smsFixture(); let calls = 0;
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), { send: async () => { calls++; throw new Error('timeout'); } });
    await service.deliver(job); assert.equal((await db.reminderLog.findUniqueOrThrow({ where: { id } })).deliveryStatus, 'uncertain');
    await service.deliver({ ...job, retryCount: 1 }); assert.equal(calls, 1);
  });
  it('registers UTC daily renewal and overdue schedules and safely closes a Nest worker context', async () => {
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
    assert.ok(schedules.some(s => s.name === 't36-renewal-scan' && s.cron === '0 8 * * *' && s.timezone === 'UTC'));
    assert.ok(schedules.every(s => !/sms/.test(s.name)));
    const incoming = isolatedJobs.boss;
    await app.close();
    await assert.rejects(incoming.send(QUEUES.scan, {}));
  });
});

// Expiry evidence is append-only. These explicitly disposable-database fixtures
// remain as closed members after the suite, preserving their historical chains.
describe('T36 renewal — PostgreSQL and transactional pg-boss', { concurrency: false, timeout: 30000 }, () => {
  let db, jobs, expiry, renewal, delivery, member, root;
  const fixtureMembers = [];
  const logFor = () => db.reminderLog.findFirstOrThrow({ where: { memberId: member.id, reminderType: 'membership_renewal' } });
  async function record(previous, days) {
    const [{ date }] = await db.$queryRaw`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + ${days}::int AS date`;
    return expiry.record({ memberId: member.id, expiresOn: days === null ? null : date, sourceReference: 'disposable-test', authorityReference: 'disposable-test', expectedPredecessorId: previous });
  }
  before(async () => {
    db = new databaseModule.PrismaService(); await db.onModuleInit();
    jobs = new JobsService(db, logger); await jobs.start();
    expiry = new expiryModule.MembershipExpiryService(db);
    renewal = new renewalModule.RenewalScanService(db, jobs, expiry);
    delivery = new deliveryModule.ReminderDeliveryService(db, jobs, { send: (...args) => send(...args) }, logger);
  });
  beforeEach(async () => {
    const id = randomUUID();
    member = await db.member.create({ data: { id, membershipNumber: `T36-RENEWAL-${id}`, email: `${id}@example.invalid`, firstName: 'Renewal', lastName: 'Test', dateOfBirth: new Date('1990-01-01'), phoneNumber: '0000', addressLine1: 'Test', city: 'Test', postcode: 'TEST', passwordHash: 'not-a-login', membershipStatus: 'active', emailVerified: true } });
    fixtureMembers.push(id); root = await record(null, 30);
    send = async () => ({ outcome: 'provider_accepted', externalId: `renewal-${randomUUID()}` });
  });
  afterEach(async () => {
    await db.member.update({ where: { id: member.id }, data: { membershipStatus: 'closed' } });
    const logs = await db.reminderLog.findMany({ where: { memberId: member.id, jobId: { not: null } } });
    for (const row of logs) await jobs.boss.cancel(QUEUES.email, row.jobId);
  });
  after(async () => { if (jobs) await jobs.stop(); if (db) await db.onModuleDestroy(); });

  async function enableRenewalSms() {
    process.env.T36_SMS_MODE = 'simulate'; process.env.T36_EMAIL_MODE = 'disabled';
    await db.member.update({ where: { id: member.id }, data: { emailVerified: false, phoneNumber: '+447700900123', phoneVerifiedAt: now(), phoneVerificationSource: 'test', smsReminderPermissionAt: now(), smsReminderPermissionSource: 'test' } });
  }
  it('rolls back renewal SMS, its actual pg-boss job, and audit when audit insertion fails', async () => {
    await enableRenewalSms(); const transaction = db.$transaction.bind(db), original = jobs.enqueue.bind(jobs); let jobId, reminderId, providerCalls = 0;
    const provider = { send: async () => { providerCalls++; return { outcome: 'simulated' }; } };
    const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, expiry, provider);
    await jobs.boss.work(QUEUES.sms, { includeMetadata: true, pollingIntervalSeconds: 0.5 }, async ([job]) => service.deliver(job));
    jobs.enqueue = async (...args) => { reminderId = args[2].reminderId; jobId = await original(...args); return jobId; };
    db.$transaction = (fn, options) => transaction(tx => fn(new Proxy(tx, { get(client, name) {
      if (name !== 'auditLog') return Reflect.get(client, name);
      return { create: args => tx.auditLog.create({ ...args, data: { ...args.data, changedBy: 'missing-t36-actor' } }) };
    } })), options);
    try { await assert.rejects(renewal.scan()); } finally { db.$transaction = transaction; jobs.enqueue = original; }
    await delay(750); await jobs.boss.offWork(QUEUES.sms);
    process.env.T36_SMS_MODE = 'disabled'; process.env.T36_EMAIL_MODE = 'simulate';
    assert.ok(jobId); assert.equal(await db.reminderLog.count({ where: { id: reminderId } }), 0);
    assert.ok(!(await jobs.boss.getJobById(QUEUES.sms, jobId)));
    assert.equal(await db.auditLog.count({ where: { recordId: reminderId } }), 0); assert.equal(providerCalls, 0);
  });
  it('does not infer an unknown expiry for an SMS-eligible member', async () => {
    await db.member.update({ where: { id: member.id }, data: { membershipStatus: 'closed' } });
    const id = randomUUID(); member = await db.member.create({ data: { id, membershipNumber: `T36-UNKNOWN-${id}`, email: `${id}@example.invalid`, firstName: 'Unknown', lastName: 'Test', dateOfBirth: new Date('1990-01-01'), phoneNumber: '0000', addressLine1: 'Test', city: 'Test', postcode: 'TEST', passwordHash: 'not-a-login', membershipStatus: 'active', emailVerified: false } }); fixtureMembers.push(id);
    await enableRenewalSms();
    try { assert.equal(await expiry.current(member.id), null); assert.equal(await renewal.scan(), 0); assert.equal(await db.reminderLog.count({ where: { memberId: member.id } }), 0); }
    finally { process.env.T36_SMS_MODE = 'disabled'; process.env.T36_EMAIL_MODE = 'simulate'; }
  });
  it('does not use a withdrawn or stale expiry to authorize an SMS', async () => {
    await enableRenewalSms();
    try {
      await record(root.id, null); assert.equal(await renewal.scan(), 0); assert.equal(await db.reminderLog.count({ where: { memberId: member.id } }), 0);
    } finally { process.env.T36_SMS_MODE = 'disabled'; process.env.T36_EMAIL_MODE = 'simulate'; }
  });
  it('does not use a superseded target-date expiry record', async () => {
    await enableRenewalSms();
    try { await record(root.id, 15); assert.equal(await renewal.scan(), 0); assert.equal(await db.reminderLog.count({ where: { memberId: member.id } }), 0); }
    finally { process.env.T36_SMS_MODE = 'disabled'; process.env.T36_EMAIL_MODE = 'simulate'; }
  });
  it('fails closed on a corrupted expiry chain in a rolled-back PostgreSQL transaction', async () => {
    await enableRenewalSms(); const rollback = new Error('test rollback');
    try {
      await assert.rejects(db.$transaction(async tx => {
        // Test-only corruption is local to this transaction and is rolled back.
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        await tx.membershipExpiryRecord.create({ data: { id: randomUUID(), memberId: member.id, expiresOn: root.expiresOn, sourceReference: 'test-corrupt', authorityReference: 'test', replacesRecordId: randomUUID() } });
        const facade = { $queryRaw: tx.$queryRaw.bind(tx), $transaction: async fn => fn(tx) };
        const scanner = new renewalModule.RenewalScanService(facade, jobs, expiry);
        await assert.rejects(scanner.scan(), /Invalid membership expiry chain/);
        assert.equal(await tx.reminderLog.count({ where: { memberId: member.id } }), 0);
        throw rollback;
      }), error => error === rollback);
      assert.equal((await expiry.current(member.id)).id, root.id);
    } finally { process.env.T36_SMS_MODE = 'disabled'; process.env.T36_EMAIL_MODE = 'simulate'; }
  });
  it('queues the exact seven-day renewal SMS window', async () => {
    process.env.T36_SMS_MODE = 'simulate'; process.env.T36_EMAIL_MODE = 'disabled';
    try {
      await db.member.update({ where: { id: member.id }, data: { emailVerified: false, phoneNumber: '+447700900123', phoneVerifiedAt: now(), phoneVerificationSource: 'test', smsReminderPermissionAt: now(), smsReminderPermissionSource: 'test' } });
      await record(root.id, 7); assert.equal(await renewal.scan(), 1);
      const row = await logFor(); assert.equal(row.reminderChannel, 'sms'); assert.equal(row.renewalWindowDays, 7); assert.equal(await renewal.scan(), 0); assert.equal(await db.reminderLog.count({ where: { memberId: member.id, reminderChannel: 'sms' } }), 1); await jobs.boss.cancel(QUEUES.sms, row.jobId);
    } finally { process.env.T36_SMS_MODE = 'disabled'; process.env.T36_EMAIL_MODE = 'simulate'; }
  });
  it('queues renewal SMS independently and skips dispatch after expiry correction', async () => {
    process.env.T36_SMS_MODE = 'simulate'; process.env.T36_EMAIL_MODE = 'disabled'; process.env.T36_TWILIO_STATUS_CALLBACK_URL = 'https://example.invalid/status';
    try {
      await db.member.update({ where: { id: member.id }, data: { emailVerified: false, phoneNumber: '+447700900123', phoneVerifiedAt: now(), phoneVerificationSource: 'test', smsReminderPermissionAt: now(), smsReminderPermissionSource: 'test' } });
      const results = await Promise.all([renewal.scan(), renewal.scan()]); assert.equal(results.reduce((a,b) => a+b, 0), 1);
      const row = await logFor(); assert.equal(row.reminderChannel, 'sms'); assert.ok(await jobs.boss.getJobById(QUEUES.sms, row.jobId));
      await record(root.id, 15); let calls = 0;
      const service = new smsDeliveryModule.ReminderSmsDeliveryService(db, expiry, { send: async () => { calls++; return { outcome: 'simulated' }; } });
      await service.deliver({ id: row.jobId, data: { reminderId: row.id }, retryCount: 0, retryLimit: 5, signal: new AbortController().signal });
      assert.equal(calls, 0); assert.equal((await logFor()).deliveryStatus, 'skipped');
      await jobs.boss.cancel(QUEUES.sms, row.jobId);
    } finally { process.env.T36_SMS_MODE = 'disabled'; process.env.T36_EMAIL_MODE = 'simulate'; }
  });
  it('concurrent scans commit one reminder, job and audit while preserving financial and expiry evidence', async () => {
    const beforeMember = await db.member.findUniqueOrThrow({ where: { id: member.id } });
    const results = await Promise.all([renewal.scan(), renewal.scan()]);
    assert.equal(results.reduce((a, b) => a + b, 0), 1);
    assert.equal(await renewal.scan(), 0);
    const logs = await db.reminderLog.findMany({ where: { memberId: member.id, reminderType: 'membership_renewal' } });
    assert.equal(logs.length, 1);
    const row = logs[0]; assert.equal(row.membershipExpiryRecordId, root.id); assert.equal(row.renewalWindowDays, 30); assert.equal(row.reminderChannel, 'email');
    const job = await jobs.boss.getJobById(QUEUES.email, row.jobId); assert.equal(job.data.reminderId, row.id);
    assert.equal(await db.auditLog.count({ where: { tableName: 'reminder_logs', recordId: row.id } }), 1);
    assert.deepEqual(await db.member.findUniqueOrThrow({ where: { id: member.id } }), beforeMember);
    assert.equal(await db.savingsTransaction.count({ where: { memberId: member.id } }), 0);
    assert.equal((await expiry.current(member.id)).id, root.id);
    assert.equal((await db.membershipExpiryRecord.findUniqueOrThrow({ where: { id: root.id } })).sourceReference, 'disposable-test');
  });
  it('rolls back the actual pg-boss insert and reminder when enqueue fails after insert', async () => {
    const original = jobs.enqueue.bind(jobs); let jobId, reminderId;
    jobs.enqueue = async (...args) => { reminderId = args[2].reminderId; jobId = await original(...args); throw new Error('injected enqueue failure'); };
    try { await assert.rejects(renewal.scan(), /injected enqueue failure/); } finally { jobs.enqueue = original; }
    assert.ok(jobId); assert.ok(!(await jobs.boss.getJobById(QUEUES.email, jobId)));
    assert.equal(await db.reminderLog.count({ where: { memberId: member.id } }), 0);
    assert.equal(await db.auditLog.count({ where: { tableName: 'reminder_logs', recordId: reminderId } }), 0);
  });
  it('rolls back the actual job and reminder when audit insertion fails', async () => {
    const transaction = db.$transaction.bind(db), original = jobs.enqueue.bind(jobs); let jobId;
    jobs.enqueue = async (...args) => { jobId = await original(...args); return jobId; };
    db.$transaction = (fn, options) => transaction(tx => fn(new Proxy(tx, { get(client, name) {
      if (name !== 'auditLog') return Reflect.get(client, name);
      return { create: args => tx.auditLog.create({ ...args, data: { ...args.data, changedBy: 'missing-t36-actor' } }) };
    } })), options);
    try { await assert.rejects(renewal.scan()); } finally { db.$transaction = transaction; jobs.enqueue = original; }
    assert.ok(jobId); assert.ok(!(await jobs.boss.getJobById(QUEUES.email, jobId)));
    assert.equal(await db.reminderLog.count({ where: { memberId: member.id } }), 0);
    assert.equal(await db.auditLog.count({ where: { tableName: 'reminder_logs', newValue: { contains: jobId } } }), 0);
  });
  it('retries an injected serialization conflict then commits through the real transaction adapter', async () => {
    const transaction = db.$transaction.bind(db); let attempts = 0;
    db.$transaction = (fn, options) => { if (++attempts === 1) return Promise.reject(Object.assign(new Error('injected conflict'), { code: 'P2034' })); return transaction(fn, options); };
    try { assert.equal(await renewal.scan(), 1); } finally { db.$transaction = transaction; }
    assert.equal(attempts, 2); const row = await logFor(); assert.ok(await jobs.boss.getJobById(QUEUES.email, row.jobId));
  });
  it('retries a PostgreSQL serialization conflict caused by a concurrent member update', async () => {
    const blocker = new pg.Client({ connectionString: url }); await blocker.connect();
    const transaction = db.$transaction.bind(db); let attempts = 0, scanPromise;
    try {
      await blocker.query('BEGIN');
      await blocker.query('UPDATE members SET first_name = first_name WHERE member_id = $1', [member.id]);
      db.$transaction = (fn, options) => { attempts++; return transaction(fn, options); };
      scanPromise = renewal.scan();
      await waitFor(async () => {
        const result = await blocker.query("SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database() AND wait_event_type = 'Lock' AND pg_backend_pid() = ANY(pg_blocking_pids(pid))");
        return result.rowCount > 0;
      });
      await blocker.query('COMMIT');
      assert.equal(await scanPromise, 1);
      assert.ok(attempts >= 2, `expected a serialization retry, got ${attempts} attempts`);
      const row = await logFor(); assert.ok(await jobs.boss.getJobById(QUEUES.email, row.jobId));
    } finally {
      db.$transaction = transaction;
      await blocker.query('ROLLBACK').catch(() => {});
      if (scanPromise) await scanPromise.catch(() => {});
      await blocker.end();
    }
  });
  it('revalidates expiry corrected after candidate selection and before the transaction', async () => {
    const transaction = db.$transaction.bind(db); let corrected = false;
    db.$transaction = async (fn, options) => {
      if (!corrected) { corrected = true; db.$transaction = transaction; await record(root.id, 15); db.$transaction = transaction; }
      return transaction(fn, options);
    };
    try { assert.equal(await renewal.scan(), 0); } finally { db.$transaction = transaction; }
    assert.equal(await db.reminderLog.count({ where: { memberId: member.id } }), 0);
  });
  it('skips an unsent email after a correction and retains its old expiry evidence', async () => {
    await renewal.scan(); const row = await logFor(); await record(root.id, 15);
    let calls = 0; send = async () => { calls++; throw new Error('must not send'); };
    await delivery.deliver({ id: row.jobId, data: { reminderId: row.id }, retryCount: 0, retryLimit: 5, signal: new AbortController().signal });
    const updated = await db.reminderLog.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(calls, 0); assert.equal(updated.deliveryStatus, 'skipped'); assert.equal(updated.membershipExpiryRecordId, root.id);
    assert.ok(await db.membershipExpiryRecord.findUnique({ where: { id: root.id } }));
  });
  it('correlates a signed renewal webhook after an uncertain response and preserves delivered history after correction', async () => {
    await renewal.scan(); const row = await logFor();
    let frozen;
    send = async (payload, key) => { frozen = { payload, key }; assert.deepEqual((await db.reminderLog.findUniqueOrThrow({ where: { id: row.id } })).payload, payload); throw new providerModule.ReminderProviderError('timeout', true, true); };
    const job = { id: row.jobId, data: { reminderId: row.id }, retryCount: 0, retryLimit: 5, signal: new AbortController().signal };
    await assert.rejects(delivery.deliver(job));
    assert.equal(frozen.key, `t36-renewal/${row.id}`);
    assert.equal(frozen.payload.tags[0].value, row.id);
    const event = await signedEvent(`renewal-webhook-${randomUUID()}`, 'email.delivered', now(), randomUUID(), row.id);
    const webhooks = new webhookModule.ReminderWebhookService(db, jobs);
    assert.deepEqual(await webhooks.receive(Buffer.from(event.payload), event.headers), { received: true });
    assert.equal(await delivery.processEvent(`resend:${event.headers.id}`), true);
    const delivered = await db.reminderLog.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(delivered.deliveryStatus, 'delivered');
    await record(root.id, 15);
    await delivery.deliver({ ...job, retryCount: 1 });
    const after = await db.reminderLog.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.deliveryStatus, 'delivered'); assert.equal(after.externalId, delivered.externalId);
    assert.deepEqual(after.payload, frozen.payload);
  });
  it('enforces append-only history and rejects cross-member expiry references', async () => {
    await assert.rejects(db.membershipExpiryRecord.update({ where: { id: root.id }, data: { sourceReference: 'tampered' } }));
    await assert.rejects(db.membershipExpiryRecord.delete({ where: { id: root.id } }));
    const replacement = await record(root.id, 7);
    assert.equal((await expiry.current(member.id)).id, replacement.id);
    assert.equal((await db.membershipExpiryRecord.findUniqueOrThrow({ where: { id: root.id } })).sourceReference, 'disposable-test');
    const otherId = randomUUID();
    await db.member.create({ data: { id: otherId, membershipNumber: `T36-RENEWAL-${otherId}`, email: `${otherId}@example.invalid`, firstName: 'Other', lastName: 'Test', dateOfBirth: new Date('1990-01-01'), phoneNumber: '0000', addressLine1: 'Test', city: 'Test', postcode: 'TEST', passwordHash: 'not-a-login', membershipStatus: 'closed', emailVerified: true } }); fixtureMembers.push(otherId);
    await assert.rejects(db.membershipExpiryRecord.create({ data: { id: randomUUID(), memberId: otherId, expiresOn: root.expiresOn, sourceReference: 'test', authorityReference: 'test', replacesRecordId: root.id } }));
    await assert.rejects(db.reminderLog.create({ data: { id: randomUUID(), memberId: otherId, reminderType: 'membership_renewal', reminderChannel: 'email', membershipExpiryRecordId: root.id, membershipExpiresOn: root.expiresOn, renewalWindowDays: 30 } }));
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
