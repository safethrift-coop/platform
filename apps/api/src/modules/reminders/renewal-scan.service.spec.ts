import { PrismaService } from '../../core/database/prisma.service';
import { JobsService, QUEUES } from '../../core/jobs/jobs.service';
import { MembershipExpiryService } from './membership-expiry.service';
import { RenewalScanService } from './renewal-scan.service';

const date = new Date('2026-11-02T08:00:00Z');
const originalMode = process.env.T36_EMAIL_MODE;
afterEach(() => {
  process.env.T36_EMAIL_MODE = originalMode;
});

function setup(
  expiresOn: Date | null = new Date('2026-12-02'),
  member = { membershipStatus: 'active', emailVerified: true },
) {
  process.env.T36_EMAIL_MODE = 'simulate';
  let queries = 0;
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ now: date }]),
    member: { findUnique: jest.fn().mockResolvedValue(member) },
    reminderLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const db = {
    $queryRaw: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          queries++ === 0
            ? [{ now: date }]
            : queries === 2
              ? [{ memberId: 'member' }]
              : [],
        ),
      ),
    $transaction: jest
      .fn()
      .mockImplementation((fn: (value: typeof tx) => unknown) => fn(tx)),
  };
  const jobs = { enqueue: jest.fn().mockResolvedValue('job') };
  const expiry = {
    current: jest
      .fn()
      .mockResolvedValue(
        expiresOn === null ? null : { id: 'expiry', expiresOn },
      ),
  };
  const service = new RenewalScanService(
    db as unknown as PrismaService,
    jobs as unknown as JobsService,
    expiry as unknown as MembershipExpiryService,
  );
  return { service, db, tx, jobs, expiry };
}

describe('renewal scanning', () => {
  it.each([
    ['30 days', '2026-12-02', 30],
    ['7 days', '2026-11-09', 7],
  ])('queues exact %s', async (_label, expiry, window) => {
    const f = setup(new Date(expiry));
    await expect(f.service.scan()).resolves.toBe(1);
    expect(f.tx.reminderLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          renewalWindowDays: window,
          reminderChannel: 'email',
        }) as unknown,
        skipDuplicates: true,
      }),
    );
    expect(f.jobs.enqueue).toHaveBeenCalledWith(
      f.tx,
      QUEUES.email,
      expect.anything(),
      expect.any(String),
    );
    expect(f.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(f.db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      timeout: 10000,
    });
  });
  it.each([
    [
      'non-target date',
      new Date('2026-11-10'),
      { membershipStatus: 'active', emailVerified: true },
    ],
    [
      'unknown expiry',
      null,
      { membershipStatus: 'active', emailVerified: true },
    ],
    [
      'inactive member',
      new Date('2026-12-02'),
      { membershipStatus: 'inactive', emailVerified: true },
    ],
    [
      'unverified email',
      new Date('2026-12-02'),
      { membershipStatus: 'active', emailVerified: false },
    ],
  ])('skips %s', async (_label, expiry, member) => {
    const f = setup(expiry, member);
    await expect(f.service.scan()).resolves.toBe(0);
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('skips withdrawn expiry and duplicate claims', async () => {
    const withdrawn = setup();
    withdrawn.expiry.current.mockResolvedValue({
      id: 'withdrawn',
      expiresOn: null,
    });
    await expect(withdrawn.service.scan()).resolves.toBe(0);
    const duplicate = setup();
    duplicate.tx.reminderLog.createMany.mockResolvedValue({ count: 0 });
    await expect(duplicate.service.scan()).resolves.toBe(0);
    expect(duplicate.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('propagates enqueue failure without creating audit evidence', async () => {
    const f = setup();
    f.jobs.enqueue.mockRejectedValue(new Error('enqueue failed'));
    await expect(f.service.scan()).rejects.toThrow('enqueue failed');
    expect(f.tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('retries serializable conflicts', async () => {
    const f = setup();
    f.db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await expect(f.service.scan()).resolves.toBe(1);
    expect(f.db.$transaction).toHaveBeenCalledTimes(2);
  });
  it('retries a raw PostgreSQL serialization failure', async () => {
    const f = setup();
    f.db.$transaction.mockRejectedValueOnce({
      code: 'P2010',
      meta: { code: '40001' },
    });
    await expect(f.service.scan()).resolves.toBe(1);
    expect(f.db.$transaction).toHaveBeenCalledTimes(2);
  });
  it('does not retry unrelated raw database errors', async () => {
    const f = setup();
    const error = { code: 'P2010', meta: { code: '23503' } };
    f.db.$transaction.mockRejectedValueOnce(error);
    await expect(f.service.scan()).rejects.toBe(error);
    expect(f.db.$transaction).toHaveBeenCalledTimes(1);
  });
});
