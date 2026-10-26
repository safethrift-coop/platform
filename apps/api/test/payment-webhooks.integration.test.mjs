import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
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
  { concurrency: false, timeout: 30000 },
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
    afterEach(async () => {
      await jobs.boss.offWork(PAYMENT_QUEUES.events);
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
      const body = bytes(stripe());
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
      assert.equal((await eventRow(unknown.id)).status, 'ignored');
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
    it('persists worker failure, expiration retry and successful recovery using real pg-boss', async () => {
      const row = await receiveStripe(stripe());
      // Isolate this target from earlier queued fixtures without deleting their identities.
      const queued = await tx((t) =>
        t.paymentWebhookEvent.findMany({
          where: { status: 'queued', id: { not: row.id } },
        }),
      );
      for (const other of queued) await service.process(other.id);
      for (const job of await jobs.boss.findJobs(PAYMENT_QUEUES.events))
        if (job.id !== row.jobId && ['created', 'retry'].includes(job.state))
          await jobs.boss.cancel(PAYMENT_QUEUES.events, job.id);
      await jobs.boss.update(PAYMENT_QUEUES.events, undefined, {
        id: row.jobId,
        expireInSeconds: 1,
        heartbeatSeconds: null,
        retryLimit: 2,
        retryDelay: 0,
        retryBackoff: false,
      });
      const [leased] = await jobs.boss.fetch(PAYMENT_QUEUES.events, {
        includeMetadata: true,
      });
      assert.equal(leased.id, row.jobId);
      // Abandoned lease is recovered by expiration, as after a worker process dies.
      await delay(1100);
      await jobs.boss.supervise(PAYMENT_QUEUES.events);
      let calls = 0;
      await jobs.boss.work(
        PAYMENT_QUEUES.events,
        { pollingIntervalSeconds: 0.5 },
        async ([job]) => {
          if (++calls === 1) throw new Error('fixture transient failure');
          await service.process(job.data.eventId);
        },
      );
      await waitFor(
        async () =>
          (await eventRow(row.providerEventId)).status === 'quarantined',
      );
      assert.equal(calls, 2);
      assert.equal(
        await tx((t) =>
          t.paymentObservation.count({ where: { eventId: row.id } }),
        ),
        1,
      );
    });
    it('retains exhausted processing in review and dead-letter storage without infinite requeues', async () => {
      const row = await receiveStripe(stripe());
      const queued = await tx((t) =>
        t.paymentWebhookEvent.findMany({
          where: { status: 'queued', id: { not: row.id } },
        }),
      );
      for (const other of queued) await service.process(other.id);
      for (const job of await jobs.boss.findJobs(PAYMENT_QUEUES.events))
        if (job.id !== row.jobId && ['created', 'retry'].includes(job.state))
          await jobs.boss.cancel(PAYMENT_QUEUES.events, job.id);
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
