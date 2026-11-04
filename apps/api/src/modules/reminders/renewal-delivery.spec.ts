import type { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { JobsService } from '../../core/jobs/jobs.service';
import { MembershipExpiryService } from './membership-expiry.service';
import {
  ReminderDeliveryService,
  type EmailJob,
} from './reminder-delivery.service';
import {
  ReminderEmailProvider,
  ReminderProviderError,
} from './reminder-email.provider';

const now = new Date('2026-11-02T08:00:00Z');
const expiresOn = new Date('2026-12-02T00:00:00Z');
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  jest.restoreAllMocks();
});

function fixture() {
  process.env.T36_EMAIL_MODE = 'simulate';
  const row = {
    id: 'renewal-id',
    memberId: 'member',
    jobId: 'job',
    reminderType: 'membership_renewal',
    reminderChannel: 'email',
    membershipExpiryRecordId: 'expiry',
    membershipExpiresOn: expiresOn,
    renewalWindowDays: 30,
    providerKey: 't36-renewal/renewal-id',
    providerEventAt: null,
    deliveryStatus: 'queued',
    repaymentScheduleId: null,
    payload: null as object | null,
    firstAttemptAt: null as Date | null,
    transport: null as string | null,
    lastError: null as string | null,
  };
  const member = {
    firstName: 'Alice',
    email: 'alice@example.invalid',
    membershipStatus: 'active',
    emailVerified: true,
  };
  const expiry = {
    id: 'expiry',
    memberId: 'member',
    expiresOn,
    sourceReference: 'test',
    authorityReference: 'test',
    recordedAt: now,
  };
  const expirySpy = jest
    .spyOn(MembershipExpiryService.prototype, 'current')
    .mockResolvedValue(expiry);
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    member: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(member)),
    },
    reminderLog: {
      findUnique: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...row })),
      update: jest.fn().mockImplementation(({ data }: { data: object }) => {
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn().mockImplementation(({ data }: { data: object }) => {
        Object.assign(row, data);
        return Promise.resolve({ count: 1 });
      }),
    },
    reminderAttempt: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    repaymentSchedule: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([{ now }]),
    $transaction: jest
      .fn()
      .mockImplementation((fn: (tx: unknown) => unknown) => fn(tx)),
  };
  const send = jest
    .fn<Promise<{ outcome: string }>, [unknown, string, AbortSignal]>()
    .mockResolvedValue({ outcome: 'simulated' });
  const provider = { send } as unknown as ReminderEmailProvider;
  const service = new ReminderDeliveryService(
    db as unknown as PrismaService,
    {} as JobsService,
    provider,
    { info: jest.fn(), warn: jest.fn() } as unknown as Logger,
  );
  const job: EmailJob = {
    id: 'job',
    data: { reminderId: row.id },
    retryCount: 0,
    retryLimit: 5,
    signal: new AbortController().signal,
  };
  return { row, member, expiry, expirySpy, tx, send, service, job };
}

describe('renewal email preparation', () => {
  it('accepts the matching current expiry and freezes a correctly tagged renewal before dispatch', async () => {
    const f = fixture();
    f.send.mockImplementation((payload: unknown, key: string) => {
      expect(f.row.payload).toEqual(payload);
      expect(key).toBe('t36-renewal/renewal-id');
      return Promise.resolve({ outcome: 'simulated' });
    });
    await f.service.deliver(f.job);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.row.payload).toMatchObject({
      subject: 'Membership record reminder — 30 days',
      tags: [{ name: 't36_reminder_id', value: 'renewal-id' }],
    });
    expect(f.tx.repaymentSchedule.findUnique).not.toHaveBeenCalled();
  });
  it.each([
    'changed date',
    'withdrawn',
    'replaced record',
    'stored date mismatch',
    'inactive',
    'unverified',
  ])(
    'skips unsent renewal after %s without a provider request',
    async (change) => {
      const f = fixture();
      if (change === 'changed date')
        f.expirySpy.mockResolvedValue({
          ...f.expiry,
          expiresOn: new Date('2026-12-03'),
        });
      if (change === 'withdrawn')
        f.expirySpy.mockResolvedValue({ ...f.expiry, expiresOn: null });
      if (change === 'replaced record')
        f.expirySpy.mockResolvedValue({ ...f.expiry, id: 'replacement' });
      if (change === 'stored date mismatch')
        f.row.membershipExpiresOn = new Date('2026-12-03');
      if (change === 'inactive') f.member.membershipStatus = 'suspended';
      if (change === 'unverified') f.member.emailVerified = false;
      await f.service.deliver(f.job);
      expect(f.send).not.toHaveBeenCalled();
      expect(f.row.deliveryStatus).toBe('skipped');
      expect(f.row.lastError).toBe('no_longer_eligible');
    },
  );
  it.each(['provider_accepted', 'delivered'])(
    'preserves historical %s evidence after expiry changes',
    async (status) => {
      const f = fixture();
      f.row.deliveryStatus = status;
      f.expirySpy.mockResolvedValue({
        ...f.expiry,
        id: 'replacement',
        expiresOn: null,
      });
      await f.service.deliver(f.job);
      expect(f.send).not.toHaveBeenCalled();
      expect(f.tx.reminderLog.update).not.toHaveBeenCalled();
      expect(f.row.deliveryStatus).toBe(status);
    },
  );
  it('reuses the frozen payload and key after an uncertain timeout, within the existing safety window', async () => {
    const f = fixture();
    f.send.mockRejectedValue(new ReminderProviderError('timeout', true, true));
    await expect(f.service.deliver(f.job)).rejects.toThrow();
    const firstPayload = structuredClone(f.row.payload);
    f.member.firstName = 'Changed';
    f.tx.reminderAttempt.count.mockResolvedValue(1);
    await expect(
      f.service.deliver({ ...f.job, retryCount: 1 }),
    ).rejects.toThrow();
    expect(f.row.payload).toEqual(firstPayload);
    expect(f.send.mock.calls[0][0]).toEqual(f.send.mock.calls[1][0]);
    expect(f.send.mock.calls[0][1]).toBe(f.send.mock.calls[1][1]);
    f.row.firstAttemptAt = new Date(now.getTime() - 24 * 3600 * 1000);
    await f.service.deliver({ ...f.job, retryCount: 2 });
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.row.lastError).toBe('idempotency_window_expired');
  });
  it('rejects SMS jobs at the email worker', async () => {
    const f = fixture();
    f.row.reminderChannel = 'sms';
    await expect(f.service.deliver(f.job)).rejects.toThrow('channel mismatch');
    expect(f.send).not.toHaveBeenCalled();
  });
});
