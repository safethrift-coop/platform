import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import {
  paymentConfig,
  MAX_WEBHOOK_BYTES,
  STRIPE_API_VERSION,
  type PaymentProvider,
} from './payment-webhook.config';

export const STRIPE_EVENTS = [
  'payment_intent.created',
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.succeeded',
  'charge.failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'refund.created',
  'refund.updated',
  'refund.failed',
  'payout.paid',
  'payout.failed',
];
export const GC_PAYMENT_EVENTS = [
  'created',
  'submitted',
  'confirmed',
  'paid_out',
  'failed',
  'cancelled',
  'charged_back',
  'chargeback_cancelled',
  'chargeback_settled',
  'late_failure_settled',
  'resubmission_requested',
  'customer_approval_granted',
  'customer_approval_denied',
];
export const GC_MANDATE_EVENTS = [
  'created',
  'submitted',
  'active',
  'failed',
  'cancelled',
  'expired',
  'reinstated',
  'replaced',
  'consumed',
  'blocked',
  'resubmission_requested',
  'customer_approval_granted',
  'customer_approval_skipped',
];
export const GC_REFUND_EVENTS = [
  'created',
  'paid',
  'failed',
  'refund_settled',
  'funds_returned',
];
export const GC_PAYOUT_EVENTS = [
  'paid',
  'paid_again',
  'fx_rate_confirmed',
  'tax_exchange_rates_confirmed',
];
export interface VerifiedEvent {
  providerEventId: string;
  eventHash: string;
  eventType: string;
  resourceId: string | null;
  resourceType: string;
  occurredAt: Date;
  evidence: Prisma.InputJsonObject;
  supported: boolean;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid object');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,255}$/.test(value))
    throw new Error('Invalid identifier');
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
function amount(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid minor amount');
  return String(value);
}
function currency(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value))
    throw new Error('Invalid currency');
  return value.toUpperCase();
}
export function verifyEvents(
  provider: PaymentProvider,
  body: Buffer,
  signature: string,
): VerifiedEvent[] {
  const config = paymentConfig(provider);
  if (!config) throw new Error('Disabled');
  if (
    !Buffer.isBuffer(body) ||
    body.length === 0 ||
    body.length > MAX_WEBHOOK_BYTES
  )
    throw new Error('Invalid raw body');
  let events: unknown[];
  if (provider === 'stripe') {
    // Static official verifier performs no HTTP requests. Never disable its timestamp tolerance.
    const event = Stripe.webhooks.constructEvent(
      body,
      signature,
      config.secret,
      300,
    );
    const signedAt = signature.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1];
    if (!signedAt || Number(signedAt) > Math.floor(Date.now() / 1000) + 300)
      throw new Error('Invalid signature timestamp');
    if (
      event.livemode !== false ||
      (event.account !== undefined && event.account !== config.accountScope)
    )
      throw new Error('Invalid scope');
    // Own-account snapshot events omit account; the dedicated secret is bound to the configured account.
    if (event.api_version !== STRIPE_API_VERSION)
      throw new Error('Unsupported Stripe snapshot API version');
    events = [event];
  } else {
    if (!/^[a-fA-F0-9]{64}$/.test(signature))
      throw new Error('Invalid signature');
    const expected = createHmac('sha256', config.secret).update(body).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new Error('Invalid signature');
    const envelope = object(JSON.parse(body.toString('utf8')));
    if (
      !Array.isArray(envelope.events) ||
      !envelope.events.length ||
      envelope.events.length > 250
    )
      throw new Error('Invalid events');
    events = envelope.events;
  }
  return events.map((value) => {
    const event = object(value);
    const providerEventId = identifier(event.id);
    const eventType =
      provider === 'stripe'
        ? identifier(event.type)
        : `${identifier(event.resource_type)}.${identifier(event.action)}`;
    const occurredAt =
      provider === 'stripe'
        ? new Date(Number(event.created) * 1000)
        : new Date(String(event.created_at));
    if (!Number.isFinite(occurredAt.getTime()))
      throw new Error('Invalid event date');
    let resourceId: string | null = null;
    let resourceType: string;
    let evidence: Prisma.InputJsonObject;
    let supported: boolean;
    if (provider === 'stripe') {
      const resource = object(object(event.data).object);
      resourceType = identifier(resource.object);
      resourceId = resource.id === undefined ? null : identifier(resource.id);
      supported = STRIPE_EVENTS.includes(eventType);
      evidence = {
        fact: eventType,
        amountMinor: supported
          ? amount(resource.amount ?? resource.amount_total)
          : null,
        refundedAmountMinor: supported
          ? amount(resource.amount_refunded)
          : null,
        currency: supported ? currency(resource.currency) : null,
        // A Checkout completion is only a session observation, regardless of payment_status.
        paymentStatus:
          typeof resource.payment_status === 'string'
            ? resource.payment_status
            : null,
        status: typeof resource.status === 'string' ? resource.status : null,
        paymentId:
          typeof resource.payment_intent === 'string'
            ? resource.payment_intent
            : null,
        chargeId: typeof resource.charge === 'string' ? resource.charge : null,
      };
    } else {
      const links = object(event.links);
      if (links.organisation !== config.accountScope)
        throw new Error('Invalid organisation');
      resourceType = identifier(event.resource_type);
      const key = (
        {
          payments: 'payment',
          mandates: 'mandate',
          refunds: 'refund',
          payouts: 'payout',
        } as Record<string, string>
      )[resourceType];
      resourceId =
        key && links[key] !== undefined ? identifier(links[key]) : null;
      supported =
        (resourceType === 'payments' &&
          GC_PAYMENT_EVENTS.includes(String(event.action))) ||
        (resourceType === 'mandates' &&
          GC_MANDATE_EVENTS.includes(String(event.action))) ||
        (resourceType === 'refunds' &&
          GC_REFUND_EVENTS.includes(String(event.action))) ||
        (resourceType === 'payouts' &&
          GC_PAYOUT_EVENTS.includes(String(event.action)));
      // Standard GoCardless events contain IDs, not payment amounts. Never infer an amount.
      evidence = {
        fact: eventType,
        amountMinor: null,
        currency: null,
        paymentId:
          typeof links.payment === 'string' ? identifier(links.payment) : null,
        payoutId:
          typeof links.payout === 'string' ? identifier(links.payout) : null,
        replacementId:
          typeof links.new_mandate === 'string'
            ? identifier(links.new_mandate)
            : null,
      };
    }
    if ((evidence.amountMinor === null) !== (evidence.currency === null))
      throw new Error('Amount and currency must be paired');
    return {
      providerEventId,
      eventType,
      eventHash: hash(canonical(event)),
      occurredAt,
      resourceId,
      resourceType,
      evidence,
      supported,
    };
  });
}
