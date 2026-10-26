import { createHmac } from 'node:crypto';
import Stripe from 'stripe';
import {
  paymentConfig,
  STRIPE_API_VERSION,
  MAX_WEBHOOK_BYTES,
} from './payment-webhook.config';
import { verifyEvents } from './payment-webhook.policy';
import { PaymentWorkers } from './payment-webhooks.module';
import { PaymentJobsService } from './payment-jobs.service';
import { PaymentWebhooksService } from './payment-webhooks.service';
const original = { ...process.env };
const secret = 'whsec_t38_fixture_secret_only';
const gcSecret = 't38-gocardless-fixture-only';
function configure() {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    T38_WEBHOOKS_ENABLED: 'true',
    T38_ENVIRONMENT: 'test',
    T38_STRIPE_TEST_ACCOUNT_ID: 'acct_fixture',
    T38_STRIPE_TEST_WEBHOOK_SECRET: secret,
    T38_GOCARDLESS_TEST_ACCOUNT_ID: 'ORfixture',
    T38_GOCARDLESS_TEST_WEBHOOK_SECRET: gcSecret,
  });
}
const stripeBody = (extra: object = {}) =>
  Buffer.from(
    JSON.stringify({
      id: 'evt_fixture',
      object: 'event',
      type: 'payment_intent.succeeded',
      api_version: STRIPE_API_VERSION,
      livemode: false,
      created: 1700000000,
      data: {
        object: {
          id: 'pi_fixture',
          object: 'payment_intent',
          amount: 1234,
          currency: 'gbp',
        },
      },
      ...extra,
    }),
  );
const sign = (body: Buffer, timestamp?: number) =>
  Stripe.webhooks.generateTestHeaderString({
    payload: body.toString(),
    secret,
    timestamp,
  });
const gcBody = (organisation = 'ORfixture') =>
  Buffer.from(
    JSON.stringify({
      events: [
        {
          id: 'EVfixture',
          resource_type: 'mandates',
          action: 'active',
          created_at: '2026-10-26T08:00:00Z',
          links: { mandate: 'MDfixture', organisation },
        },
      ],
    }),
  );
const gcSign = (body: Buffer) =>
  createHmac('sha256', gcSecret).update(body).digest('hex');
beforeEach(configure);
afterEach(() => {
  process.env = { ...original };
});
describe('T38 signatures, configuration, and evidence', () => {
  it('is disabled by default, validates both endpoints and prohibits live or production activation', () => {
    expect(paymentConfig(undefined, {})).toBeUndefined();
    for (const patch of [
      { T38_WEBHOOKS_ENABLED: 'yes' },
      { NODE_ENV: 'production' },
      { NODE_ENV: 'staging' },
      { T38_ENVIRONMENT: 'live' },
      { T38_STRIPE_TEST_WEBHOOK_SECRET: '' },
      { T38_GOCARDLESS_TEST_ACCOUNT_ID: '' },
    ])
      expect(() =>
        paymentConfig(undefined, { ...process.env, ...patch }),
      ).toThrow();
  });
  it('uses the official Stripe verifier with exact bytes and timestamp tolerance', () => {
    const body = stripeBody();
    expect(verifyEvents('stripe', body, sign(body))[0].evidence).toMatchObject({
      amountMinor: '1234',
      currency: 'GBP',
    });
    for (const signature of [
      '',
      'invalid',
      sign(body, Math.floor(Date.now() / 1000) - 301),
      sign(body, Math.floor(Date.now() / 1000) + 601),
    ])
      expect(() => verifyEvents('stripe', body, signature)).toThrow();
    expect(() =>
      verifyEvents(
        'stripe',
        Buffer.concat([body, Buffer.from(' ')]),
        sign(body),
      ),
    ).toThrow();
  });
  it('rejects different Stripe accounts, live mode, unsupported API versions and unsafe amounts', () => {
    for (const extra of [
      { account: 'acct_other' },
      { livemode: true },
      { api_version: '2020-08-27' },
      {
        data: {
          object: {
            id: 'pi_fixture',
            object: 'payment_intent',
            amount: Number.MAX_SAFE_INTEGER + 1,
            currency: 'gbp',
          },
        },
      },
    ]) {
      const body = stripeBody(extra);
      expect(() => verifyEvents('stripe', body, sign(body))).toThrow();
    }
  });
  it('checks GoCardless HMAC, exact bytes, organisation, malformed signatures and batch bounds', () => {
    const body = gcBody();
    expect(verifyEvents('gocardless', body, gcSign(body))[0].eventType).toBe(
      'mandates.active',
    );
    for (const signature of ['', 'aa', gcSign(body) + 'ff', 'z'.repeat(64)])
      expect(() => verifyEvents('gocardless', body, signature)).toThrow();
    expect(() =>
      verifyEvents(
        'gocardless',
        Buffer.concat([body, Buffer.from(' ')]),
        gcSign(body),
      ),
    ).toThrow();
    const wrong = gcBody('ORother');
    expect(() => verifyEvents('gocardless', wrong, gcSign(wrong))).toThrow();
    expect(() =>
      verifyEvents('gocardless', Buffer.alloc(MAX_WEBHOOK_BYTES + 1), ''),
    ).toThrow();
    const tooMany = Buffer.from(
      JSON.stringify({
        events: Array.from(
          { length: 251 },
          () =>
            (JSON.parse(body.toString()) as { events: unknown[] }).events[0],
        ),
      }),
    );
    expect(() =>
      verifyEvents('gocardless', tooMany, gcSign(tooMany)),
    ).toThrow();
  });
  it('keeps Checkout completion and mandate activation as observations, with unknown events ignored', () => {
    const body = stripeBody({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_fixture',
          object: 'checkout.session',
          payment_status: 'unpaid',
          amount_total: 1234,
          currency: 'gbp',
        },
      },
    });
    expect(verifyEvents('stripe', body, sign(body))[0].evidence).toMatchObject({
      fact: 'checkout.session.completed',
      paymentStatus: 'unpaid',
    });
    const unknown = stripeBody({ type: 'future.event' });
    expect(verifyEvents('stripe', unknown, sign(unknown))[0].supported).toBe(
      false,
    );
    expect(
      verifyEvents('gocardless', gcBody(), gcSign(gcBody()))[0].evidence
        .amountMinor,
    ).toBeNull();
  });
  it('does not start jobs when disabled', async () => {
    delete process.env.T38_WEBHOOKS_ENABLED;
    const start = jest.fn();
    await new PaymentWorkers(
      { start } as unknown as PaymentJobsService,
      {} as PaymentWebhooksService,
    ).onApplicationBootstrap();
    expect(start).not.toHaveBeenCalled();
  });
});
