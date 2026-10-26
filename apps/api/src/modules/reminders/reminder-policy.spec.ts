import { Prisma } from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import type { Logger } from 'winston';
import { validate } from '../../core/config/env.validation';
import { PrismaService } from '../../core/database/prisma.service';
import { JobsService, RETRY_OPTIONS } from '../../core/jobs/jobs.service';
import { ReminderWorkersService } from './reminder-workers.service';
import { ReminderDeliveryService } from './reminder-delivery.service';
import { RemindersService } from './reminders.service';
import { ResendReminderProvider } from './reminder-email.provider';
import {
  eligible,
  overdueEmail,
  utcDate,
  type Installment,
} from './reminder-policy';

const env = { ...process.env };
const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
} as unknown as Logger;
const fixture = () =>
  ({
    dueDate: new Date('2026-10-24'),
    totalDue: new Prisma.Decimal('12.34'),
    totalPaid: new Prisma.Decimal('2.01'),
    status: 'partial',
    loan: {
      loanStatus: 'active',
      disbursementDate: new Date('2026-10-01'),
      member: {
        membershipStatus: 'active',
        emailVerified: true,
        email: 'test@example.invalid',
        firstName: '<Member>',
      },
    },
  }) as unknown as Installment;
const config = (extra: Record<string, unknown>) =>
  validate({
    DATABASE_URL: 'test',
    REDIS_HOST: 'localhost',
    REDIS_PASSWORD: '',
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'x'.repeat(32),
    ENCRYPTION_KEY: 'x'.repeat(64),
    ...extra,
  });

afterEach(() => {
  process.env = { ...env };
  jest.restoreAllMocks();
});

describe('T36 reminder policy and transport', () => {
  it('uses the UTC date, excludes today and requires outstanding eligible active/disbursed debt', () => {
    const now = new Date('2026-10-25T00:00:00Z');
    expect(utcDate(new Date('2026-10-25T01:00:00+01:00'))).toEqual(now);
    expect(eligible(fixture(), now)).toBe(true);
    const variants = [
      (s: Installment) => {
        s.dueDate = now;
      },
      (s: Installment) => {
        s.totalPaid = s.totalDue;
      },
      (s: Installment) => {
        s.status = 'paid';
      },
      (s: Installment) => {
        s.loan.disbursementDate = null;
      },
      (s: Installment) => {
        s.loan.loanStatus = 'defaulted';
      },
      (s: Installment) => {
        s.loan.loanStatus = 'restructured';
      },
      (s: Installment) => {
        s.loan.member.membershipStatus = 'suspended';
      },
      (s: Installment) => {
        s.loan.member.emailVerified = false;
      },
    ];
    for (const mutate of variants) {
      const s = fixture();
      mutate(s);
      expect(eligible(s, now)).toBe(false);
    }
    for (const status of ['due', 'partial', 'late', 'missed'] as const) {
      const s = fixture();
      s.status = status;
      expect(eligible(s, now)).toBe(true);
    }
  });
  it('renders exact outstanding amounts, escapes member data and avoids payment/points promises', () => {
    const payload = overdueEmail(fixture(), new Date('2026-10-25T08:00:00Z'));
    expect(payload.html).toContain('£10.33');
    expect(payload.html).toContain('&lt;Member&gt;');
    expect(payload.html).toContain('2026-10-24 (UTC)');
    expect(payload.html).not.toMatch(
      /points|make your repayment|payment link/i,
    );
  });
  it('defaults to disabled, refuses invalid flags and forbids production/staging Resend activation', () => {
    expect(config({}).T36_JOBS_ENABLED).toBe('false');
    expect(config({}).T36_EMAIL_MODE).toBe('disabled');
    for (const NODE_ENV of ['production', 'staging'])
      expect(() => config({ NODE_ENV, T36_EMAIL_MODE: 'resend' })).toThrow(
        'not authorized',
      );
    expect(() => config({ T36_JOBS_ENABLED: 'yes' })).toThrow();
  });
  it('simulation never calls the external provider and production cannot bypass the adapter gate', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    const provider = new ResendReminderProvider();
    process.env.T36_EMAIL_MODE = 'simulate';
    await expect(
      provider.send(
        overdueEmail(fixture(), new Date()),
        'key',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ outcome: 'simulated' });
    process.env.T36_EMAIL_MODE = 'resend';
    process.env.NODE_ENV = 'production';
    await expect(
      provider.send(
        overdueEmail(fixture(), new Date()),
        'key',
        new AbortController().signal,
      ),
    ).rejects.toThrow('external_delivery_disabled');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aborts the installed SDK request at the timeout and records ambiguity rather than false failure', async () => {
    jest.useFakeTimers();
    process.env.T36_EMAIL_MODE = 'resend';
    process.env.NODE_ENV = 'test';
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new Error('request aborted')),
            { once: true },
          );
        }),
    );
    try {
      const pending = new ResendReminderProvider().send(
        overdueEmail(fixture(), new Date()),
        'timeout-key',
        new AbortController().signal,
      );
      const check = expect(pending).rejects.toMatchObject({
        retryable: true,
        uncertain: true,
      });
      await jest.advanceTimersByTimeAsync(15000);
      await check;
      expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the installed Resend SDK with a stable key and abort signal; propagates provider failure', async () => {
    process.env.T36_EMAIL_MODE = 'resend';
    process.env.NODE_ENV = 'test';
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'email-test' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'application_error',
            message: 'temporary',
            statusCode: 503,
          }),
          { status: 503 },
        ),
      );
    const provider = new ResendReminderProvider();
    const payload = overdueEmail(fixture(), new Date());
    await expect(
      provider.send(payload, 'stable-key', new AbortController().signal),
    ).resolves.toEqual({
      outcome: 'provider_accepted',
      externalId: 'email-test',
    });
    const options = fetch.mock.calls[0][1]!;
    expect(new Headers(options.headers).get('Idempotency-Key')).toBe(
      'stable-key',
    );
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body as string) as object).toMatchObject(payload);
    await expect(
      provider.send(payload, 'stable-key', new AbortController().signal),
    ).rejects.toMatchObject({ retryable: true, uncertain: true });
  });
});

describe('T36 lifecycle boundaries', () => {
  it('registers no background jobs when disabled, including renewal and SMS', async () => {
    delete process.env.T36_JOBS_ENABLED;
    const start = jest.fn();
    await new ReminderWorkersService(
      { start } as unknown as JobsService,
      {} as RemindersService,
      {} as ReminderDeliveryService,
    ).onApplicationBootstrap();
    expect(start).not.toHaveBeenCalled();
  });
  it('drains workers exactly once before a registered Prisma disconnect hook completes', async () => {
    const hooks: (() => Promise<void>)[] = [];
    const db = {
      beforeDisconnect: (hook: () => Promise<void>) => hooks.push(hook),
    } as unknown as PrismaService;
    const jobs = new JobsService(db, logger);
    const stop = jest.fn().mockResolvedValue(undefined);
    jobs.boss = { stop } as unknown as PgBoss;
    await Promise.all([jobs.stop(), hooks[0](), jobs.onModuleDestroy()]);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith({ graceful: true, timeout: 30000 });
    expect(RETRY_OPTIONS).toMatchObject({
      retryLimit: 5,
      retryBackoff: true,
      retryDelayMax: 3600,
    });
  });
});
