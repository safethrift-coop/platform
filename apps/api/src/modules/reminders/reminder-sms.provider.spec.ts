import {
  createDormantTwilioTransport,
  createTwilioSdkClient,
  TwilioReminderProvider,
} from './reminder-sms.provider';
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});
const payload = {
  to: '+447700900123',
  body: 'test',
  statusCallback: 'https://example.invalid/status',
};
describe('Twilio reminder adapter', () => {
  it('constructs the installed SDK without initiating a request', () => {
    const client = createTwilioSdkClient(
      'SK' + 'a'.repeat(32),
      'test-secret',
      'AC' + 'b'.repeat(32),
    );
    expect(typeof client.messages.create).toBe('function');
  });
  it('keeps disabled and simulated modes off the network', async () => {
    const create = jest.fn();
    const provider = new TwilioReminderProvider({
      messages: { create },
    });
    process.env.T36_SMS_MODE = 'disabled';
    expect(await provider.send(payload)).toEqual({
      outcome: 'failed',
      code: 'external_delivery_disabled',
    });
    process.env.T36_SMS_MODE = 'simulate';
    expect(await provider.send(payload)).toEqual({ outcome: 'simulated' });
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    ['timeout', new Error('timeout')],
    ['reset', { code: 'ECONNRESET' }],
    ['server error', { status: 503 }],
  ])('marks %s uncertain', async (_label, error) => {
    process.env.NODE_ENV = 'test';
    process.env.T36_SMS_MODE = 'twilio';
    process.env.T36_TWILIO_FAKE_ENABLED = 'true';
    const provider = new TwilioReminderProvider({
      messages: { create: jest.fn().mockRejectedValue(error) },
    });
    expect(await provider.send(payload)).toEqual({
      outcome: 'uncertain',
      code: 'provider_outcome_unknown',
    });
  });
  it('distinguishes malformed success, rejection, and acceptance', async () => {
    process.env.NODE_ENV = 'test';
    process.env.T36_SMS_MODE = 'twilio';
    process.env.T36_TWILIO_FAKE_ENABLED = 'true';
    const create = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ status: 400 })
      .mockResolvedValueOnce({ sid: `SM${'a'.repeat(32)}` });
    const provider = new TwilioReminderProvider({ messages: { create } });
    expect((await provider.send(payload)).outcome).toBe('uncertain');
    expect((await provider.send(payload)).outcome).toBe('failed');
    expect((await provider.send(payload)).outcome).toBe('provider_accepted');
  });
  it('forbids the real transport even when Twilio mode is selected', async () => {
    process.env.NODE_ENV = 'test';
    process.env.T36_SMS_MODE = 'twilio';
    process.env.T36_TWILIO_FAKE_ENABLED = 'true';
    expect(await new TwilioReminderProvider().send(payload)).toEqual({
      outcome: 'failed',
      code: 'external_delivery_disabled',
    });
  });
});

describe('dormant SDK transport', () => {
  const config = {
    TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32),
    TWILIO_API_KEY_SID: 'SK' + 'b'.repeat(32),
    TWILIO_API_KEY_SECRET: 'secret',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_MESSAGING_SERVICE_SID: 'MG' + 'c'.repeat(32),
    T36_TWILIO_STATUS_CALLBACK_URL: 'https://example.invalid/status',
  };
  it('constructs with the credential contract and sends the frozen payload', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ sid: `SM${'d'.repeat(32)}`, status: 'accepted' });
    const factory = jest.fn().mockReturnValue({ messages: { create } });
    const transport = createDormantTwilioTransport(config, factory);
    expect(factory).toHaveBeenCalledWith(
      config.TWILIO_API_KEY_SID,
      config.TWILIO_API_KEY_SECRET,
      config.TWILIO_ACCOUNT_SID,
    );
    expect(await transport.send(payload)).toEqual({
      outcome: 'provider_accepted',
      externalId: `SM${'d'.repeat(32)}`,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      ...payload,
      messagingServiceSid: config.TWILIO_MESSAGING_SERVICE_SID,
    });
  });
  it('fails closed before construction when credentials or HTTPS callback are missing', () => {
    const factory = jest.fn();
    expect(() =>
      createDormantTwilioTransport(
        { ...config, TWILIO_API_KEY_SECRET: '' },
        factory,
      ),
    ).toThrow();
    expect(() =>
      createDormantTwilioTransport(
        { ...config, T36_TWILIO_STATUS_CALLBACK_URL: 'http://example.invalid' },
        factory,
      ),
    ).toThrow();
    expect(factory).not.toHaveBeenCalled();
  });
  it('does not log sensitive provider errors', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    const error = jest.spyOn(console, 'error').mockImplementation();
    try {
      const transport = createDormantTwilioTransport(config, () => ({
        messages: {
          create: jest
            .fn()
            .mockRejectedValue(
              new Error(
                `${payload.to} ${payload.body} ${config.TWILIO_API_KEY_SECRET}`,
              ),
            ),
        },
      }));
      expect((await transport.send(payload)).outcome).toBe('uncertain');
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
