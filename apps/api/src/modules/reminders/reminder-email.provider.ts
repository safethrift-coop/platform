import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

export interface ReminderEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  tags?: { name: string; value: string }[];
}
export interface EmailAcceptance {
  outcome: 'provider_accepted' | 'simulated';
  externalId?: string;
}
export abstract class ReminderEmailProvider {
  abstract send(
    payload: ReminderEmail,
    key: string,
    signal: AbortSignal,
  ): Promise<EmailAcceptance>;
}
export class ReminderProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly uncertain = false,
  ) {
    super(code);
  }
}
// No selected SMS provider, queue producer or worker is registered.
export interface SmsProvider {
  send(
    to: string,
    text: string,
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<{ externalId: string }>;
}

// Installed Resend exposes fetchRequest publicly but not signal in SendOptions.
// A request-local subclass bounds the SDK's actual fetch, without global mutation.
class AbortableResend extends Resend {
  constructor(
    key: string,
    private readonly signal: AbortSignal,
  ) {
    super(key);
  }
  override fetchRequest<T>(path: string, options: object = {}) {
    return super.fetchRequest<T>(path, { ...options, signal: this.signal });
  }
}

@Injectable()
export class ResendReminderProvider extends ReminderEmailProvider {
  async send(
    payload: ReminderEmail,
    key: string,
    signal: AbortSignal,
  ): Promise<EmailAcceptance> {
    if (signal.aborted) throw new ReminderProviderError('aborted', true, true);
    if (process.env.T36_EMAIL_MODE === 'simulate')
      return { outcome: 'simulated' };
    if (
      process.env.T36_EMAIL_MODE !== 'resend' ||
      !['development', 'test'].includes(process.env.NODE_ENV ?? '')
    )
      throw new ReminderProviderError('external_delivery_disabled', false);
    // A transport timeout may occur after acceptance. Keep the same key and body
    // on retry; never interpret a timeout as proof that no email was sent.
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 15000);
    try {
      const { data, error } = await new AbortableResend(
        process.env.RESEND_API_KEY ?? 're_disabled',
        controller.signal,
      ).emails.send(payload, { idempotencyKey: key });
      if (error) {
        const status = 'statusCode' in error ? Number(error.statusCode) : 0;
        const retryable =
          status === 0 ||
          status === 429 ||
          status >= 500 ||
          error.name === 'concurrent_idempotent_requests';
        throw new ReminderProviderError(
          error.name,
          retryable,
          status === 0 ||
            status >= 500 ||
            error.name === 'concurrent_idempotent_requests',
        );
      }
      if (!data?.id)
        throw new ReminderProviderError('missing_provider_id', true, true);
      return { outcome: 'provider_accepted', externalId: data.id };
    } catch (error) {
      if (error instanceof ReminderProviderError) throw error;
      throw new ReminderProviderError('provider_transport_unknown', true, true);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }
}
