import { createHmac, randomBytes } from 'node:crypto';
import { SyntheticWebhookVerifier } from './fixtures/t24-synthetic-webhook';

describe('T24 synthetic webhook verification boundary', () => {
  const key = randomBytes(32);
  const verifier = new SyntheticWebhookVerifier(key);
  const raw = Buffer.from(
    JSON.stringify({
      eventId: 'event-1',
      correlationId: 'attempt-1',
      sequence: 1,
      transition: 'verified',
    }),
  );
  const sign = (body: Buffer, signingKey = key) =>
    createHmac('sha256', signingKey).update(body).digest('hex');

  it('authenticates raw bytes and produces stable normalized evidence', () => {
    const result = verifier.verify(raw, sign(raw), 'application/json');
    const reordered = Buffer.from(
      '{"transition":"verified","sequence":1,"correlationId":"attempt-1","eventId":"event-1"}',
    );
    expect(result.event.eventId).toBe('event-1');
    expect(
      verifier.verify(reordered, sign(reordered), 'application/json').hash,
    ).toBe(result.hash);
  });

  it('rejects missing, malformed, wrong-key and tampered signatures', () => {
    for (const signature of [
      undefined,
      'bad',
      sign(raw, randomBytes(32)),
      sign(Buffer.from('other')),
    ]) {
      expect(() => verifier.verify(raw, signature, 'application/json')).toThrow(
        'Invalid synthetic webhook',
      );
    }
  });

  it('rejects oversized, malformed and unrecognized payloads after authentication', () => {
    for (const body of [
      Buffer.from('{'),
      Buffer.alloc(4097, 'x'),
      Buffer.from('{"eventId":"x","identity":"secret"}'),
    ]) {
      expect(() =>
        verifier.verify(body, sign(body), 'application/json'),
      ).toThrow('Invalid synthetic webhook');
    }
    expect(() => verifier.verify(raw, sign(raw), 'text/plain')).toThrow(
      'Invalid synthetic webhook',
    );
  });
});
