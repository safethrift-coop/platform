import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import Stripe from 'stripe';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import database from '../dist/core/database/prisma.service.js';
import jobsModule from '../dist/modules/payment-webhooks/payment-jobs.service.js';
import serviceModule from '../dist/modules/payment-webhooks/payment-webhooks.service.js';
import controllerModule from '../dist/modules/payment-webhooks/payment-webhooks.controller.js';
import configModule from '../dist/modules/payment-webhooks/payment-webhook.config.js';
import bodyModule from '../dist/modules/payment-webhooks/payment-webhook-body.js';
import nestModule from '../dist/modules/payment-webhooks/payment-webhooks.module.js';
const url = process.env.T38_TEST_DATABASE_URL;
if (!url) throw new Error('Explicit T38_TEST_DATABASE_URL required');
const parsed = new URL(url);
if (
  process.env.NODE_ENV !== 'test' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname)
)
  throw new Error('Refusing nonlocal/non-test PostgreSQL');
const original = { ...process.env };
Object.assign(process.env, {
  DATABASE_URL: url,
  T38_WEBHOOKS_ENABLED: 'true',
  T38_ENVIRONMENT: 'test',
  T38_STRIPE_TEST_ACCOUNT_ID: 'acct_fixture',
  T38_STRIPE_TEST_WEBHOOK_SECRET: 'whsec_t38_fixture_secret_only',
  T38_GOCARDLESS_TEST_ACCOUNT_ID: 'ORfixture',
  T38_GOCARDLESS_TEST_WEBHOOK_SECRET: 't38-gocardless-fixture-only',
});
const { PAYMENT_QUEUES, PaymentJobsService } = jobsModule;
let db, jobs, service, sql, app, initial;
let fixtureCleanupBlocked = false;
const fixtureId = randomUUID();
const stripe = (extra = {}) => ({
  id: 'evt_' + randomUUID(),
  object: 'event',
  api_version: configModule.STRIPE_API_VERSION,
  livemode: false,
  account: 'acct_fixture',
  type: 'payment_intent.succeeded',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'pi_' + randomUUID(),
      object: 'payment_intent',
      amount: 1234,
      currency: 'gbp',
      metadata: { memberId: fixtureId },
    },
  },
  ...extra,
});
const gc = (extra = {}) => ({
  id: 'EV' + randomUUID(),
  resource_type: 'payments',
  action: 'confirmed',
  created_at: new Date().toISOString(),
  links: { organisation: 'ORfixture', payment: 'PM' + randomUUID() },
  ...extra,
});
const bytes = (value) => Buffer.from(JSON.stringify(value));
const stripeSign = (body, timestamp) =>
  Stripe.webhooks.generateTestHeaderString({
    payload: body.toString(),
    secret: process.env.T38_STRIPE_TEST_WEBHOOK_SECRET,
    timestamp,
  });
const gcSign = (body) =>
  createHmac('sha256', process.env.T38_GOCARDLESS_TEST_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
const ownedEvents = new Map();
const receiveStripe = async (event) => {
  const body = bytes(event);
  await service.receive('stripe', body, stripeSign(body));
  return eventRow(event.id);
};
const receiveGc = async (events) => {
  const body = bytes({ events });
  await service.receive('gocardless', body, gcSign(body));
  return eventRow(events[0].id);
};
const tx = (fn) => db.$transaction(fn);
const eventRow = (id) =>
  tx((t) =>
    t.paymentWebhookEvent.findFirstOrThrow({ where: { providerEventId: id } }),
  );
async function ownedPendingFixtures() {
  const owned = await tx((transaction) =>
    transaction.paymentWebhookEvent.findMany({
      where: { OR: [...ownedEvents.values()] },
    }),
  );
  const pending = (await jobs.boss.findJobs(PAYMENT_QUEUES.events)).filter(
    (job) => ['created', 'retry', 'active'].includes(job.state),
  );
  const diagnostic = JSON.stringify(
    pending.map((job) => ({
      id: job.id,
      eventId: job.data?.eventId,
      state: job.state,
      retryCount: job.retryCount,
    })),
  );
  assert.ok(
    pending.every((job) =>
      owned.some(
        (event) => event.jobId === job.id && event.id === job.data?.eventId,
      ),
    ),
    `Refusing recovery with unknown nonterminal jobs; retain them for review: ${diagnostic}`,
  );
  assert.ok(
    pending.every((job) => job.state !== 'active'),
    `Refusing fixture preparation with active leases; retain them for review: ${diagnostic}`,
  );
  return { owned, pending };
}
async function prepareOwnedFixtures(target) {
  const { owned, pending } = await ownedPendingFixtures();
  for (const other of owned)
    if (other.id !== target.id && other.status === 'queued')
      await service.process(other.id);
  for (const job of pending)
    if (job.id !== target.jobId && ['created', 'retry'].includes(job.state)) {
      await jobs.boss.cancel(PAYMENT_QUEUES.events, job.id);
      assert.equal(
        (await jobs.boss.getJobById(PAYMENT_QUEUES.events, job.id))?.state,
        'cancelled',
        `Owned fixture preparation did not cancel job ${job.id}`,
      );
    }
}
async function snapshot() {
  const { rows } = await sql.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('payment_webhook_events','payment_webhook_deliveries','payment_observations','mandate_observations') ORDER BY tablename",
  );
  const result = [];
  for (const { tablename } of rows) {
    assert.match(tablename, /^[a-z_]+$/);
    result.push([
      tablename,
      (
        await sql.query(
          `SELECT to_jsonb(t) AS row FROM ${tablename} t ORDER BY to_jsonb(t)::text`,
        )
      ).rows,
    ]);
  }
  return JSON.stringify(result);
}
async function waitFor(fn) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (await fn()) return;
    await delay(30);
  }
  throw new Error('Timed out waiting for durable state');
}
describe(
  'T38 isolated real PostgreSQL intake and evidence',
  { concurrency: false, timeout: 180000 },
  () => {
    before(async () => {
      sql = new pg.Client({ connectionString: url });
      await sql.connect();
      await sql.query(
        `INSERT INTO members (member_id,membership_number,first_name,last_name,date_of_birth,phone_number,email,address_line_1,city,postcode,password_hash,updated_at,membership_status) VALUES ($1,$1,'Fixture','Only','1990-01-01','0000',$2,'Test','Test','TEST','not-a-login',NOW(),'pending')`,
        [fixtureId, fixtureId + '@example.invalid'],
      );
      await sql.query(
        `INSERT INTO member_registration (registration_id,member_id,membership_fee_paid,registration_channel) VALUES ($1,$1,false,'web_portal')`,
        [fixtureId],
      );
      await sql.query(
        `INSERT INTO member_accounts (account_id,member_id,account_type,account_number,current_balance,updated_at) VALUES ($1,$1,'savings_fsa',$1,12.34,NOW())`,
        [fixtureId],
      );
      await sql.query(
        `INSERT INTO savings_transactions (savings_txn_id,member_id,account_id,amount,transaction_type,status,is_simulation) VALUES ($1,$1,$1,12.34,'deposit','completed',true)`,
        [fixtureId],
      );
      db = new database.PrismaService();
      await db.onModuleInit();
      jobs = new PaymentJobsService(db);
      await jobs.start();
      service = new serviceModule.PaymentWebhooksService(db, jobs);
      // Cover helper, direct-service and HTTP intake through this same instance.
      const receive = service.receive.bind(service);
      service.receive = async (provider, body, signature) => {
        const result = await receive(provider, body, signature);
        // Rejected/rolled-back intake never reaches ownership registration.
        // Successful intake persists supported AND ignored events; only supported
        // events receive jobs. Missing persisted identities must still fail.
        const { environment, accountScope } = configModule.paymentConfig(provider);
        const payload = JSON.parse(body.toString('utf8'));
        const events = provider === 'stripe' ? [payload] : payload.events;
        for (const providerEventId of new Set(events.map((event) => event.id))) {
          const identity = { provider, environment, accountScope, providerEventId };
          const persisted = await tx((transaction) =>
            transaction.paymentWebhookEvent.findUniqueOrThrow({
              where: {
                provider_environment_accountScope_providerEventId: identity,
              },
              select: { id: true },
            }),
          );
          ownedEvents.set(persisted.id, { id: persisted.id, ...identity });
        }
        return result;
      };
      const module = await Test.createTestingModule({
        controllers: [controllerModule.PaymentWebhooksController],
        providers: [
          { provide: serviceModule.PaymentWebhooksService, useValue: service },
        ],
      }).compile();
      app = module.createNestApplication({ rawBody: true, logger: false });
      bodyModule.configurePaymentWebhookBody(app);
      app.setGlobalPrefix('api/v1');
      await app.init();
      initial = await snapshot();
    });
    beforeEach(() => {
      assert.equal(fixtureCleanupBlocked, false,
        'Prior fixture cleanup failed; stop verification and preserve evidence');
    });
    afterEach(async (t) => {
      try {
        await jobs.boss.offWork(PAYMENT_QUEUES.events, { wait: true });
        assert.equal(fixtureCleanupBlocked, false,
          'Recovery cleanup failed; refuse further fixture mutation');
        // Validate the whole pending set before cancelling any exact owned ID.
        const { pending } = await ownedPendingFixtures();
        for (const job of pending) {
          t.diagnostic(`Cancelling owned fixture job ${job.id} from ${job.state}`);
          await jobs.boss.cancel(PAYMENT_QUEUES.events, job.id);
          assert.equal(
            (await jobs.boss.getJobById(PAYMENT_QUEUES.events, job.id))?.state,
            'cancelled',
            `Owned fixture cleanup did not cancel job ${job.id}`,
          );
        }
      } catch (error) {
        fixtureCleanupBlocked = true;
        throw error;
      }
    });
    after(async () => {
      if (sql && initial)
        assert.equal(
          await snapshot(),
          initial,
          'Every preexisting table including membership/financial/audit rows must be unchanged',
        );
      if (app) await app.close();
      if (jobs) await jobs.stop();
      if (db) await db.onModuleDestroy();
      if (sql) {
        await sql.query('DELETE FROM savings_transactions WHERE member_id=$1', [
          fixtureId,
        ]);
        await sql.query('DELETE FROM member_accounts WHERE member_id=$1', [
          fixtureId,
        ]);
        await sql.query('DELETE FROM member_registration WHERE member_id=$1', [
          fixtureId,
        ]);
        await sql.query('DELETE FROM members WHERE member_id=$1', [fixtureId]);
        await sql.end();
      }
      process.env = original;
    });
    it('verifies actual HTTP raw bytes, rejects tampering, unsigned and oversized bodies', async () => {
      const event = stripe();
      const body = bytes(event);
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', stripeSign(body))
        .send(body.toString())
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', stripeSign(body))
        .send(body.toString() + ' ')
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .send(stripe())
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/gocardless')
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            padding: 'x'.repeat(configModule.MAX_WEBHOOK_BYTES),
          }),
        )
        .expect(413);
      assert.ok(
        (await tx((t) =>
          t.paymentWebhookDelivery.count({ where: { outcome: 'rejected' } }),
        )) >= 2,
      );
    });
    it('rejects replay outside Stripe tolerance, live mode, wrong account, wrong organisation and wrong secret', async () => {
      let body = bytes(stripe());
      await assert.rejects(
        service.receive(
          'stripe',
          body,
          stripeSign(body, Math.floor(Date.now() / 1000) - 301),
        ),
      );
      for (const extra of [{ livemode: true }, { account: 'acct_other' }]) {
        body = bytes(stripe(extra));
        await assert.rejects(service.receive('stripe', body, stripeSign(body)));
      }
      body = bytes({
        events: [
          gc({ links: { organisation: 'ORother', payment: 'PMother' } }),
        ],
      });
      await assert.rejects(service.receive('gocardless', body, gcSign(body)));
      body = bytes(stripe());
      await assert.rejects(
        service.receive(
          'stripe',
          body,
          Stripe.webhooks.generateTestHeaderString({
            payload: body.toString(),
            secret: 'whsec_other_fixture_only',
          }),
        ),
      );
    });
    it('deduplicates concurrent deliveries, repeated processing and queue deletion replays', async () => {
      const event = stripe(),
        body = bytes(event);
      await Promise.all([
        service.receive('stripe', body, stripeSign(body)),
        service.receive('stripe', body, stripeSign(body)),
      ]);
      let row = await eventRow(event.id);
      await Promise.all([service.process(row.id), service.process(row.id)]);
      assert.equal(
        await tx((t) =>
          t.paymentWebhookEvent.count({ where: { providerEventId: event.id } }),
        ),
        1,
      );
      assert.equal(
        await tx((t) =>
          t.paymentObservation.count({ where: { eventId: row.id } }),
        ),
        1,
      );
      await jobs.boss.deleteJob(PAYMENT_QUEUES.events, row.jobId);
      await service.receive('stripe', body, stripeSign(body));
      row = await eventRow(event.id);
      assert.equal(row.status, 'quarantined');
      const observation = await tx((t) =>
        t.paymentObservation.findUniqueOrThrow({ where: { eventId: row.id } }),
      );
      assert.equal(observation.amountMinor.toString(), '1234');
      assert.equal(observation.currency, 'GBP');
    });
    it('stores a multi-event GoCardless batch atomically, including duplicate and unknown events', async () => {
      const first = gc(),
        mandate = gc({
          resource_type: 'mandates',
          action: 'active',
          links: { organisation: 'ORfixture', mandate: 'MDfixture' },
        }),
        unknown = gc({
          resource_type: 'customers',
          action: 'created',
          links: { organisation: 'ORfixture', customer: 'CUfixture' },
        });
      await receiveGc([first, mandate, first, unknown]);
      for (const event of [first, mandate])
        await service.process((await eventRow(event.id)).id);
      const ignored = await eventRow(unknown.id);
      assert.equal(ignored.status, 'ignored');
      assert.equal(ignored.reason, 'unsupported_event');
      assert.equal(ignored.jobId, null);
      const row = await eventRow(mandate.id);
      assert.equal(
        (
          await tx((t) =>
            t.mandateObservation.findUniqueOrThrow({
              where: { eventId: row.id },
            }),
          )
        ).fact,
        'mandates.active',
      );
      const paymentRow = await eventRow(first.id);
      assert.equal(
        (
          await tx((t) =>
            t.paymentObservation.findUniqueOrThrow({
              where: { eventId: paymentRow.id },
            }),
          )
        ).amountMinor,
        null,
      );
    });
    it('quarantines contradictory/out-of-order collection, payout and failure facts without overwriting history', async () => {
      const payment = 'PM' + randomUUID();
      for (const [action, date] of [
        ['paid_out', '2026-10-25'],
        ['confirmed', '2026-10-24'],
        ['failed', '2026-10-26'],
      ]) {
        const row = await receiveGc([
          gc({
            action,
            created_at: date + 'T08:00:00Z',
            links: { organisation: 'ORfixture', payment },
          }),
        ]);
        await service.process(row.id);
      }
      const rows = await tx((t) =>
        t.paymentObservation.findMany({ where: { resourceId: payment } }),
      );
      assert.deepEqual(rows.map((r) => r.fact).sort(), [
        'payments.confirmed',
        'payments.failed',
        'payments.paid_out',
      ]);
      assert.ok(
        rows.every(
          (r) =>
            r.reviewRequired && r.amountMinor === null && r.currency === null,
        ),
      );
      for (const row of rows)
        assert.equal(
          (
            await tx((t) =>
              t.paymentWebhookEvent.findUniqueOrThrow({
                where: { id: row.eventId },
              }),
            )
          ).reason,
          'unmatched_resource_conflicting_observations',
        );
    });
    it('preserves completion/refund/dispute observations separately and never infers settlement', async () => {
      for (const [type, object] of [
        ['checkout.session.completed', 'checkout.session'],
        ['charge.refunded', 'charge'],
        ['charge.dispute.created', 'dispute'],
      ]) {
        const row = await receiveStripe(
          stripe({
            type,
            data: {
              object: {
                id: 'res_' + randomUUID(),
                object,
                amount: 1234,
                currency: 'gbp',
                payment_status: 'unpaid',
              },
            },
          }),
        );
        await service.process(row.id);
        assert.equal(
          (await eventRow(row.providerEventId)).status,
          'quarantined',
        );
        assert.equal(
          (
            await tx((t) =>
              t.paymentObservation.findUniqueOrThrow({
                where: { eventId: row.id },
              }),
            )
          ).fact,
          type,
        );
      }
    });
    it('rolls back all batch events, delivery and queued work on enqueue failure', async () => {
      const first = gc(),
        second = gc();
      const originalEnqueue = jobs.enqueue.bind(jobs);
      let calls = 0;
      jobs.enqueue = async (...args) => {
        if (++calls === 2) throw new Error('fixture enqueue failure');
        return originalEnqueue(...args);
      };
      const before = await tx((t) => t.paymentWebhookDelivery.count());
      const jobsBefore = (await jobs.boss.findJobs(PAYMENT_QUEUES.events))
        .length;
      try {
        await assert.rejects(receiveGc([first, second]));
      } finally {
        jobs.enqueue = originalEnqueue;
      }
      assert.equal(
        await tx((t) =>
          t.paymentWebhookEvent.count({
            where: { providerEventId: { in: [first.id, second.id] } },
          }),
        ),
        0,
      );
      assert.equal(await tx((t) => t.paymentWebhookDelivery.count()), before);
      assert.equal(
        (await jobs.boss.findJobs(PAYMENT_QUEUES.events)).length,
        jobsBefore,
      );
    });
    it('returns HTTP 503 and rolls back events/jobs when the final receipt cannot commit', async () => {
      const event = stripe(),
        body = bytes(event);
      const originalTransaction = db.$transaction.bind(db);
      const before = await tx((t) => t.paymentWebhookDelivery.count());
      const jobsBefore = (await jobs.boss.findJobs(PAYMENT_QUEUES.events))
        .length;
      db.$transaction = (fn, opts) =>
        originalTransaction(
          (t) =>
            fn(
              new Proxy(t, {
                get(target, name) {
                  if (name !== 'paymentWebhookDelivery')
                    return Reflect.get(target, name);
                  return {
                    create: (args) =>
                      t.paymentWebhookDelivery.create({
                        ...args,
                        data: {
                          ...args.data,
                          outcome: 'fixture_invalid_outcome',
                        },
                      }),
                  };
                },
              }),
            ),
          opts,
        );
      try {
        await request(app.getHttpServer())
          .post('/api/v1/webhooks/stripe')
          .set('Content-Type', 'application/json')
          .set('Stripe-Signature', stripeSign(body))
          .send(body.toString())
          .expect(503);
      } finally {
        db.$transaction = originalTransaction;
      }
      assert.equal(await tx((t) => t.paymentWebhookDelivery.count()), before);
      assert.equal(
        await tx((t) =>
          t.paymentWebhookEvent.count({ where: { providerEventId: event.id } }),
        ),
        0,
      );
      assert.equal(
        (await jobs.boss.findJobs(PAYMENT_QUEUES.events)).length,
        jobsBefore,
      );
    });
    it('rolls back observation insertion when final event update fails', async () => {
      const row = await receiveStripe(stripe());
      const originalTransaction = db.$transaction.bind(db);
      db.$transaction = (fn, opts) =>
        originalTransaction(
          (t) =>
            fn(
              new Proxy(t, {
                get(target, name) {
                  if (name !== 'paymentWebhookEvent')
                    return Reflect.get(target, name);
                  return new Proxy(target.paymentWebhookEvent, {
                    get(model, method) {
                      if (method === 'update')
                        return async () => {
                          throw new Error('fixture final update failure');
                        };
                      return Reflect.get(model, method);
                    },
                  });
                },
              }),
            ),
          opts,
        );
      try {
        await assert.rejects(service.process(row.id), /fixture final update/);
      } finally {
        db.$transaction = originalTransaction;
      }
      assert.equal(
        await tx((t) =>
          t.paymentObservation.count({ where: { eventId: row.id } }),
        ),
        0,
      );
      assert.equal((await eventRow(row.providerEventId)).status, 'queued');
      await service.process(row.id);
    });
    it('recovers missing jobs once under concurrent recovery and bounds recovery generations', async () => {
      const row = await receiveStripe(stripe());
      await jobs.boss.deleteJob(PAYMENT_QUEUES.events, row.jobId);
      await Promise.all([service.recover(), service.recover()]);
      let current = await eventRow(row.providerEventId);
      assert.equal(current.recoveries, 1);
      assert.notEqual(current.jobId, row.jobId);
      for (let n = 0; n < 3; n++) {
        await jobs.boss.deleteJob(PAYMENT_QUEUES.events, current.jobId);
        await service.recover();
        current = await eventRow(row.providerEventId);
      }
      assert.equal(current.status, 'review');
      assert.equal(current.recoveries, 3);
    });
    it('persists worker failure, expiration retry and successful recovery using real pg-boss', { timeout: 90000 }, async (t) => {
      assert.match(
        parsed.pathname,
        /^\/safethrift_t38_recovery_[a-z0-9_]*test$/,
        'Recovery requires a dedicated safethrift_t38_recovery_*test database',
      );
      const row = await receiveStripe(stripe());
      const monitor = new PgBoss({
        connectionString: url,
        schema: jobsModule.PAYMENT_SCHEMA,
        migrate: false,
        createSchema: false,
        supervise: false,
        schedule: false,
        monitorIntervalSeconds: 1,
      });
      const monitorErrors = [];
      monitor.on('error', (error) => monitorErrors.push(error));
      let workerId;
      let failed = false;
      const cleanupErrors = [];
      const bounded = async (label, fn, milliseconds) => {
        let timer;
        try {
          return await Promise.race([
            Promise.resolve().then(fn),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`${label} exceeded ${milliseconds}ms`)),
                milliseconds,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
      const cleanup = async (label, fn) => {
        try {
          await bounded(label, fn, 5000);
        } catch (error) {
          cleanupErrors.push(error);
          t.diagnostic(`${label}: ${error.stack ?? error}`);
        }
      };
      const deliveries = [];
      try {
        await prepareOwnedFixtures(row);
        await monitor.start();
        const updated = await jobs.boss.update(PAYMENT_QUEUES.events, undefined, {
          id: row.jobId,
          expireInSeconds: 1,
          heartbeatSeconds: null,
          retryLimit: 2,
          retryDelay: 0,
          retryBackoff: false,
        });
        assert.deepEqual(updated, { jobs: [row.jobId], updated: 1 });
        const [leased] = await jobs.boss.fetch(PAYMENT_QUEUES.events, {
          includeMetadata: true,
        });
        assert.equal(leased.id, row.jobId);
        assert.equal(leased.retryCount, 0);
        // Observe expiration recovery rather than assuming a monitor claim is due.
        await waitFor(async () => {
          await monitor.supervise(PAYMENT_QUEUES.events);
          const target = await jobs.boss.getJobById(
            PAYMENT_QUEUES.events,
            row.jobId,
          );
          return target?.state === 'retry' && target.retryCount === 0;
        });
        workerId = await jobs.boss.work(
          PAYMENT_QUEUES.events,
          { pollingIntervalSeconds: 0.5, includeMetadata: true },
          async ([job]) => {
            deliveries.push({ id: job.id, retryCount: job.retryCount });
            assert.equal(job.id, row.jobId);
            assert.equal(job.data.eventId, row.id);
            if (job.id === row.jobId && job.retryCount === 1)
              throw new Error('fixture transient failure');
            await service.process(job.data.eventId);
          },
        );
        await waitFor(async () => {
          const target = await jobs.boss.getJobById(
            PAYMENT_QUEUES.events,
            row.jobId,
          );
          return (
            target?.state === 'completed' &&
            (await eventRow(row.providerEventId)).status === 'quarantined'
          );
        });
        await bounded(
          'drain owned worker',
          () => jobs.boss.offWork(PAYMENT_QUEUES.events, {
            id: workerId,
            wait: true,
          }),
          5000,
        );

        assert.deepEqual(deliveries, [
          { id: row.jobId, retryCount: 1 },
          { id: row.jobId, retryCount: 2 },
        ]);
        assert.equal(
          (await jobs.boss.getJobById(PAYMENT_QUEUES.events, row.jobId))
            .retryCount,
          2,
        );
        assert.equal(
          await tx((t) =>
            t.paymentObservation.count({ where: { eventId: row.id } }),
          ),
          1,
        );
        assert.deepEqual(monitorErrors, []);
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        // A failed or stalled action must not prevent the remaining attempts.
        await cleanup('stop owned worker', async () => {
          if (workerId)
            await jobs.boss.offWork(PAYMENT_QUEUES.events, {
              id: workerId,
              wait: true,
            });
        });
        await cleanup('stop local monitor', () =>
          monitor.stop({ graceful: true, timeout: 4000 }),
        );
        await cleanup('verify monitor errors after shutdown', async () => {
          assert.deepEqual(monitorErrors, []);
        });
        // Inspection only: never cancel a recovery lease to make teardown pass.
        await cleanup('inspect owned recovery target', async () => {
          const identity = ownedEvents.get(row.id);
          assert.ok(identity, 'Recovery target is not registered as owned');
          const persisted = await tx((transaction) =>
            transaction.paymentWebhookEvent.findFirstOrThrow({
              where: identity,
            }),
          );
          const target = await jobs.boss.getJobById(
            PAYMENT_QUEUES.events,
            row.jobId,
          );
          t.diagnostic(`Recovery target: ${JSON.stringify({
            jobId: row.jobId,
            eventId: row.id,
            state: target?.state ?? 'missing',
            retryCount: target?.retryCount ?? null,
          })}`);
          assert.ok(target, 'Recovery target broker evidence is missing');
          assert.equal(persisted.jobId, target.id);
          assert.equal(target.data?.eventId, persisted.id);
          assert.notEqual(target.state, 'active',
            'Recovery target retains an active lease; preserve evidence and stop');
          if (!failed) assert.equal(target.state, 'completed');
        });
        // A timed-out cleanup operation may still be running. Block subsequent
        // fixture mutation even when the original test failure is rethrown.
        if (cleanupErrors.length) fixtureCleanupBlocked = true;
        if (!failed && cleanupErrors.length)
          throw new AggregateError(cleanupErrors, 'Recovery cleanup failed');
      }
    });
    it('retains exhausted processing in review and dead-letter storage without infinite requeues', async () => {
      const row = await receiveStripe(stripe());
      await prepareOwnedFixtures(row);
      await jobs.boss.update(PAYMENT_QUEUES.events, undefined, {
        id: row.jobId,
        retryLimit: 0,
      });
      const [job] = await jobs.boss.fetch(PAYMENT_QUEUES.events);
      assert.equal(job.id, row.jobId);
      await jobs.boss.fail(PAYMENT_QUEUES.events, job.id, {
        reason: 'fixture_failure',
      });
      assert.equal(
        (await jobs.boss.getJobById(PAYMENT_QUEUES.events, job.id)).state,
        'failed',
      );
      await service.recover();
      assert.equal((await eventRow(row.providerEventId)).status, 'review');
      assert.ok((await jobs.boss.findJobs(PAYMENT_QUEUES.dead)).length >= 1);
      await service.recover();
      assert.equal((await eventRow(row.providerEventId)).jobId, row.jobId);
    });
    it('preserves identity collisions for review and prevents conflicting reprocessing', async () => {
      const event = stripe();
      const row = await receiveStripe(event);
      await receiveStripe({ ...event, type: 'payment_intent.payment_failed' });
      assert.equal(
        (await eventRow(event.id)).reason,
        'event_identity_collision',
      );
      await service.process(row.id);
      assert.equal(
        await tx((t) =>
          t.paymentObservation.count({ where: { eventId: row.id } }),
        ),
        0,
      );
    });
    it('rejects cross-scope evidence at the database boundary and preserves all non-T38 rows', async () => {
      const row = await receiveStripe(stripe());
      await assert.rejects(
        tx((t) =>
          t.paymentObservation.create({
            data: {
              eventId: row.id,
              provider: 'stripe',
              environment: 'test',
              accountScope: 'acct_other',
              resourceId: 'pi_fixture',
              resourceType: 'payment_intent',
              fact: 'payment_intent.succeeded',
              occurredAt: new Date(),
            },
          }),
        ),
      );
      assert.equal(await snapshot(), initial);
    });
    it('fails closed when disabled or scope changes while work is queued', async () => {
      const row = await receiveStripe(stripe());
      process.env.T38_STRIPE_TEST_ACCOUNT_ID = 'acct_other';
      try {
        await assert.rejects(service.process(row.id), /scope mismatch/);
      } finally {
        process.env.T38_STRIPE_TEST_ACCOUNT_ID = 'acct_fixture';
      }
      process.env.T38_WEBHOOKS_ENABLED = 'false';
      try {
        await assert.rejects(service.process(row.id), /disabled/);
        const body = bytes(stripe());
        await assert.rejects(service.receive('stripe', body, stripeSign(body)));
      } finally {
        process.env.T38_WEBHOOKS_ENABLED = 'true';
      }
    });
    it('starts only T38 schedules and drains a real Nest worker context before disconnect', async () => {
      const isolated = new database.PrismaService();
      const module = await Test.createTestingModule({
        imports: [nestModule.PaymentWebhooksModule],
      })
        .overrideProvider(database.PrismaService)
        .useValue(isolated)
        .compile();
      const context = module.createNestApplication({ logger: false });
      await context.init();
      const localJobs = module.get(PaymentJobsService);
      const schedules = await localJobs.boss.getSchedules();
      assert.ok(schedules.every((s) => s.name === PAYMENT_QUEUES.recovery));
      assert.equal(schedules[0].timezone, 'UTC');
      const boss = localJobs.boss;
      await context.close();
      await assert.rejects(
        boss.send(PAYMENT_QUEUES.events, { eventId: randomUUID() }),
      );
    });
  },
);
