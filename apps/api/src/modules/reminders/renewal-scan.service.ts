import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { JobsService, QUEUES } from '../../core/jobs/jobs.service';
import { MembershipExpiryService } from './membership-expiry.service';
import { renewalWindow, smsEligible, utcDate } from './reminder-policy';

@Injectable()
export class RenewalScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly expiry: MembershipExpiryService,
  ) {}

  async scan(signal?: AbortSignal): Promise<number> {
    const [{ now }] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT CURRENT_TIMESTAMP AS now`;
    const date = utcDate(now);
    let cursor = '';
    let count = 0;
    for (;;) {
      signal?.throwIfAborted();
      const candidates = await this.prisma.$queryRaw<{ memberId: string }[]>`
        SELECT DISTINCT r.member_id AS "memberId" FROM membership_expiry_records r
        JOIN members m ON m.member_id = r.member_id
        WHERE r.member_id > ${cursor} AND m.membership_status = 'active'
          AND r.expires_on IN (${date}::date + 7, ${date}::date + 30)
        ORDER BY r.member_id LIMIT 200`;
      if (!candidates.length) return count;
      for (const { memberId } of candidates) {
        signal?.throwIfAborted();
        for (let retry = 0; ; retry++) {
          try {
            count += await this.prisma.$transaction(
              async (tx) => {
                await tx.$queryRaw`SELECT member_id FROM members WHERE member_id = ${memberId} FOR UPDATE`;
                const member = await tx.member.findUnique({
                  where: { id: memberId },
                });
                const current = await this.expiry.current(memberId, tx);
                if (
                  !member ||
                  member.membershipStatus !== 'active' ||
                  !current?.expiresOn
                )
                  return 0;
                const [{ now: transactionNow }] = await tx.$queryRaw<
                  { now: Date }[]
                >`SELECT CURRENT_TIMESTAMP AS now`;
                const window = renewalWindow(current.expiresOn, transactionNow);
                if (
                  !window ||
                  utcDate(transactionNow).getTime() !== date.getTime()
                )
                  return 0;
                const channels: ('email' | 'sms')[] = [];
                if (
                  process.env.T36_EMAIL_MODE !== 'disabled' &&
                  process.env.T36_EMAIL_MODE &&
                  member.emailVerified
                )
                  channels.push('email');
                if (
                  process.env.NODE_ENV === 'test' &&
                  process.env.T36_SMS_MODE === 'simulate' &&
                  smsEligible(member)
                )
                  channels.push('sms');
                let created = 0;
                for (const channel of channels) {
                  const id = randomUUID();
                  const jobId = randomUUID();
                  const inserted = await tx.reminderLog.createMany({
                    data: {
                      id,
                      memberId,
                      reminderType: 'membership_renewal',
                      reminderChannel: channel,
                      membershipExpiryRecordId: current.id,
                      membershipExpiresOn: current.expiresOn,
                      renewalWindowDays: window,
                      scanDate: date,
                      queuedAt: transactionNow,
                      messageTemplate: `membership-renewal-${window}-v1`,
                      jobId,
                      providerKey:
                        channel === 'email'
                          ? `t36-renewal/${id}`
                          : `t36-sms-renewal/${id}`,
                    },
                    skipDuplicates: true,
                  });
                  if (!inserted.count) continue;
                  await this.jobs.enqueue(
                    tx,
                    channel === 'email' ? QUEUES.email : QUEUES.sms,
                    { reminderId: id },
                    jobId,
                  );
                  await tx.auditLog.create({
                    data: {
                      tableName: 'reminder_logs',
                      recordId: id,
                      actionType: 'insert',
                      newValue: JSON.stringify({
                        purpose: 'membership_renewal',
                        expiryRecordId: current.id,
                        window,
                        channel,
                        jobId,
                      }),
                    },
                  });
                  created++;
                }
                return created;
              },
              { isolationLevel: 'Serializable', timeout: 10000 },
            );
            break;
          } catch (error) {
            const fault = error as {
              code?: unknown;
              meta?: {
                code?: unknown;
                driverAdapterError?: { cause?: { originalCode?: unknown } };
              };
            } | null;
            const serializationConflict =
              fault?.code === 'P2034' ||
              (fault?.code === 'P2010' &&
                (fault.meta?.code === '40001' ||
                  fault.meta?.driverAdapterError?.cause?.originalCode ===
                    '40001'));
            if (retry >= 3 || !serializationConflict) throw error;
          }
        }
      }
      cursor = candidates[candidates.length - 1].memberId;
    }
  }
}
