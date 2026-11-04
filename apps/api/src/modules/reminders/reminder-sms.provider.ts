import { Inject, Injectable, Optional } from '@nestjs/common';
import twilio from 'twilio';
import type { SmsPayload } from './reminder-policy';

export type SmsOutcome =
  | { outcome: 'provider_accepted'; externalId: string }
  | { outcome: 'failed'; code: string }
  | { outcome: 'uncertain'; code: string }
  | { outcome: 'simulated' };
export interface TwilioClient {
  messages: {
    create(input: {
      to: string;
      body: string;
      messagingServiceSid: string;
      statusCallback: string;
    }): Promise<{ sid?: string }>;
  };
}
export const T36_TWILIO_CLIENT = Symbol('T36_TWILIO_CLIENT');
export abstract class ReminderSmsProvider {
  abstract send(payload: SmsPayload): Promise<SmsOutcome>;
}
@Injectable()
export class TwilioReminderProvider extends ReminderSmsProvider {
  constructor(
    @Optional()
    @Inject(T36_TWILIO_CLIENT)
    private readonly fakeClient?: TwilioClient,
  ) {
    super();
  }
  async send(payload: SmsPayload): Promise<SmsOutcome> {
    if (process.env.T36_SMS_MODE === 'simulate')
      return { outcome: 'simulated' };
    // Real transport remains disabled. Only an explicitly injected test client may
    // exercise Twilio mode until a separate provider-activation change is approved.
    if (
      process.env.T36_SMS_MODE !== 'twilio' ||
      process.env.NODE_ENV !== 'test' ||
      !this.fakeClient ||
      process.env.T36_TWILIO_FAKE_ENABLED !== 'true'
    )
      return { outcome: 'failed', code: 'external_delivery_disabled' };
    return new TwilioSmsTransport(
      this.fakeClient,
      process.env.TWILIO_MESSAGING_SERVICE_SID ?? '',
    ).send(payload);
  }
}

// Deliberately not registered with Nest or selected by any runtime mode.
export class TwilioSmsTransport extends ReminderSmsProvider {
  constructor(
    private readonly client: TwilioClient,
    private readonly messagingServiceSid: string,
    private readonly configuredCallback?: string,
  ) {
    super();
  }

  async send(payload: SmsPayload): Promise<SmsOutcome> {
    try {
      const callback = new URL(payload.statusCallback);
      const configured =
        this.configuredCallback && new URL(this.configuredCallback);
      if (
        callback.protocol !== 'https:' ||
        (configured &&
          (callback.origin !== configured.origin ||
            callback.pathname !== configured.pathname ||
            [...configured.searchParams].some(
              ([key, value]) =>
                !callback.searchParams.getAll(key).includes(value),
            )))
      )
        return { outcome: 'failed', code: 'invalid_callback' };
    } catch {
      return { outcome: 'failed', code: 'invalid_callback' };
    }
    try {
      const result = await this.client.messages.create({
        to: payload.to,
        body: payload.body,
        statusCallback: payload.statusCallback,
        messagingServiceSid: this.messagingServiceSid,
      });
      if (
        !result ||
        typeof result.sid !== 'string' ||
        !/^SM[0-9a-f]{32}$/i.test(result.sid)
      )
        return { outcome: 'uncertain', code: 'malformed_provider_response' };
      return { outcome: 'provider_accepted', externalId: result.sid };
    } catch (error) {
      const fault = error as { status?: unknown } | null;
      const status = fault?.status;
      if (
        typeof status === 'number' &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429
      )
        return { outcome: 'failed', code: 'provider_rejected' };
      return { outcome: 'uncertain', code: 'provider_outcome_unknown' };
    }
  }
}
// Construction does not perform a request. The worker never invokes this factory;
// live transport requires a separate activation change and authorization.
export function createTwilioSdkClient(
  apiKey: string,
  apiSecret: string,
  accountSid: string,
): ReturnType<typeof twilio> {
  return twilio(apiKey, apiSecret, {
    accountSid,
    autoRetry: false,
    timeout: 15000,
  });
}

// This factory is intentionally unreachable from application configuration.
// Activation requires a separately authorized code change.
export function createDormantTwilioTransport(
  env: NodeJS.ProcessEnv,
  factory: (
    key: string,
    secret: string,
    account: string,
  ) => TwilioClient = createTwilioSdkClient,
): TwilioSmsTransport {
  const account = env.TWILIO_ACCOUNT_SID;
  const key = env.TWILIO_API_KEY_SID;
  const secret = env.TWILIO_API_KEY_SECRET;
  const service = env.TWILIO_MESSAGING_SERVICE_SID;
  const callback = env.T36_TWILIO_STATUS_CALLBACK_URL;
  if (
    !account ||
    !key ||
    !secret ||
    !service ||
    !env.TWILIO_AUTH_TOKEN ||
    !callback
  )
    throw new Error('T36 Twilio configuration incomplete');
  try {
    if (new URL(callback).protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('T36 Twilio callback URL must be valid HTTPS');
  }
  return new TwilioSmsTransport(
    factory(key, secret, account),
    service,
    callback,
  );
}
