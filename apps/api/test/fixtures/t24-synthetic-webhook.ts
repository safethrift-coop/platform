import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** This protocol is exclusively for synthetic tests; it is not an Onfido contract. */
export interface SyntheticWebhookEvent {
  eventId: string;
  correlationId: string;
  sequence: number;
  transition: 'in_progress' | 'verified' | 'rejected' | 'expired';
}

export class SyntheticWebhookVerifier {
  constructor(private readonly key: Buffer) {
    if (key.length < 32) throw new Error('A synthetic signing key is required');
  }

  verify(
    raw: Buffer,
    signature: string | undefined,
    contentType: string | undefined,
  ): {
    event: SyntheticWebhookEvent;
    hash: string;
  } {
    if (
      !Buffer.isBuffer(raw) ||
      raw.length === 0 ||
      raw.length > 4096 ||
      contentType !== 'application/json'
    ) {
      throw new Error('Invalid synthetic webhook');
    }
    if (!signature || !/^[a-f0-9]{64}$/.test(signature))
      throw new Error('Invalid synthetic webhook');
    const expected = createHmac('sha256', this.key).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new Error('Invalid synthetic webhook');
    let value: unknown;
    try {
      value = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new Error('Invalid synthetic webhook');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid synthetic webhook');
    const event = value as Record<string, unknown>;
    if (
      Object.keys(event).sort().join(',') !==
        'correlationId,eventId,sequence,transition' ||
      typeof event.eventId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(event.eventId) ||
      typeof event.correlationId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(event.correlationId) ||
      !Number.isSafeInteger(event.sequence) ||
      (event.sequence as number) < 1 ||
      !['in_progress', 'verified', 'rejected', 'expired'].includes(
        event.transition as string,
      )
    ) {
      throw new Error('Invalid synthetic webhook');
    }
    const normalized: SyntheticWebhookEvent = {
      eventId: event.eventId,
      correlationId: event.correlationId,
      sequence: event.sequence as number,
      transition: event.transition as SyntheticWebhookEvent['transition'],
    };
    return {
      event: normalized,
      hash: createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex'),
    };
  }
}
