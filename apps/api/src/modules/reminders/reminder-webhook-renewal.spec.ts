import { createHmac } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { JobsService } from '../../core/jobs/jobs.service';
import { ReminderWebhookService } from './reminder-webhook.service';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

function fixture(type: string, key: string) {
  process.env.T36_JOBS_ENABLED = 'true';
  const secret = Buffer.from('test-only-webhook-secret');
  process.env.T36_RESEND_WEBHOOK_SECRET = `whsec_${secret.toString('base64')}`;
  const row = {
    id: 'reminder',
    reminderType: type,
    providerKey: key,
    firstAttemptAt: new Date(),
    payload: { to: 'test@example.invalid' },
    externalId: null,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    reminderLog: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
    },
    reminderProviderEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db = {
    $transaction: jest
      .fn()
      .mockImplementation((fn: (tx: unknown) => unknown) => fn(tx)),
  };
  const jobs = { enqueue: jest.fn().mockResolvedValue('job') };
  const service = new ReminderWebhookService(
    db as unknown as PrismaService,
    jobs as unknown as JobsService,
  );
  const payload = Buffer.from(
    JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: { email_id: 'provider-id', tags: { t36_reminder_id: row.id } },
    }),
  );
  const id = 'event',
    timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v1,${createHmac('sha256', secret).update(`${id}.${timestamp}.${payload.toString()}`).digest('base64')}`;
  return { service, payload, headers: { id, timestamp, signature }, tx, jobs };
}

describe('signed reminder webhook identity', () => {
  it.each([
    ['membership_renewal', 't36-renewal/reminder'],
    ['late_payment', 't36-initial-overdue/reminder'],
  ])('correlates %s with its own stable key', async (type, key) => {
    const f = fixture(type, key);
    await expect(f.service.receive(f.payload, f.headers)).resolves.toEqual({
      received: true,
    });
    expect(f.tx.reminderLog.update).toHaveBeenCalledWith({
      where: { id: 'reminder' },
      data: { externalId: 'provider-id' },
    });
    expect(f.jobs.enqueue).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['membership_renewal', 't36-initial-overdue/reminder'],
    ['late_payment', 't36-renewal/reminder'],
    ['membership_renewal', 't36-renewal/other'],
  ])('rejects mismatched %s identity', async (type, key) => {
    const f = fixture(type, key);
    await expect(f.service.receive(f.payload, f.headers)).resolves.toEqual({
      ignored: true,
    });
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
});
