import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JobsService, QUEUES } from '../../core/jobs/jobs.service';
import { PrismaService } from '../../core/database/prisma.service';
import { MembershipExpiryService } from './membership-expiry.service';
import {
  overdueSms,
  renewalSms,
  renewalWindow,
  scheduleInclude,
  smsEligible,
  utcDate,
} from './reminder-policy';
import { ReminderSmsProvider } from './reminder-sms.provider';
import type { EmailJob } from './reminder-delivery.service';

@Injectable()
export class ReminderSmsDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expiry: MembershipExpiryService,
    private readonly provider: ReminderSmsProvider,
  ) {}

  async deliver(job: EmailJob): Promise<void> {
    if (
      process.env.NODE_ENV !== 'test' ||
      !['simulate', 'twilio'].includes(process.env.T36_SMS_MODE ?? '')
    )
      throw new Error('SMS delivery disabled');
    const attemptId = randomUUID();
    const claim = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT reminder_id FROM reminder_logs WHERE reminder_id = ${job.data.reminderId} FOR UPDATE`;
        const row = await tx.reminderLog.findUnique({
          where: { id: job.data.reminderId },
        });
        if (!row) return null;
        if (row.reminderChannel !== 'sms')
          throw new Error('T36 reminder channel mismatch');
        if (row.jobId !== job.id)
          throw new Error('T36 reminder/job identity mismatch');
        // A committed claim is a permanent barrier, including after process death.
        if (row.deliveryStatus !== 'queued' || row.firstAttemptAt !== null)
          return null;
        await tx.$queryRaw`SELECT member_id FROM members WHERE member_id = ${row.memberId} FOR UPDATE`;
        const member = await tx.member.findUnique({
          where: { id: row.memberId },
        });
        const [{ now }] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT CURRENT_TIMESTAMP AS now`;
        let payload: ReturnType<typeof renewalSms> | null = null;
        if (
          member &&
          member.membershipStatus === 'active' &&
          smsEligible(member)
        ) {
          if (row.reminderType === 'membership_renewal') {
            const current = await this.expiry.current(row.memberId, tx);
            const window =
              current?.expiresOn && renewalWindow(current.expiresOn, now);
            if (
              current?.id === row.membershipExpiryRecordId &&
              current.expiresOn &&
              row.membershipExpiresOn?.getTime() ===
                current.expiresOn.getTime() &&
              window &&
              window === row.renewalWindowDays
            )
              payload = renewalSms(member, current.expiresOn, window, row.id);
          } else if (
            row.reminderType === 'late_payment' &&
            row.repaymentScheduleId
          ) {
            const schedule = await tx.repaymentSchedule.findUnique({
              where: { id: row.repaymentScheduleId },
              include: scheduleInclude,
            });
            if (
              schedule &&
              schedule.loan.memberId === row.memberId &&
              schedule.dueDate < utcDate(now) &&
              schedule.totalDue.gt(schedule.totalPaid) &&
              ['due', 'partial', 'late', 'missed'].includes(schedule.status) &&
              schedule.loan.loanStatus === 'active' &&
              schedule.loan.disbursementDate
            )
              payload = overdueSms(schedule, row.id);
          }
        }
        if (!payload) {
          await tx.reminderLog.update({
            where: { id: row.id },
            data: {
              deliveryStatus: 'skipped',
              lastError: 'no_longer_eligible',
            },
          });
          return null;
        }
        const callback = new URL(payload.statusCallback);
        callback.searchParams.set('attemptId', attemptId);
        payload.statusCallback = callback.toString();
        await tx.reminderAttempt.create({
          data: {
            id: attemptId,
            reminderId: row.id,
            jobId: job.id,
            retryCount: job.retryCount,
            outcome: 'dispatch_claimed',
          },
        });
        await tx.reminderLog.update({
          where: { id: row.id },
          data: {
            payload: { ...payload },
            attemptToken: attemptId,
            firstAttemptAt: now,
            deliveryStatus: 'dispatch_claimed',
            transport: process.env.T36_SMS_MODE,
          },
        });
        return payload;
      },
      { isolationLevel: 'ReadCommitted', timeout: 10000 },
    );
    if (!claim) return;
    let outcome;
    try {
      outcome = await this.provider.send(claim);
    } catch {
      outcome = {
        outcome: 'uncertain' as const,
        code: 'provider_outcome_unknown',
      };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT reminder_id FROM reminder_logs WHERE reminder_id = ${job.data.reminderId} FOR UPDATE`;
      const existing = await tx.reminderAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      if (existing.externalId) {
        if (
          outcome.outcome === 'provider_accepted' &&
          existing.externalId !== outcome.externalId
        )
          throw new Error('SMS provider identity mismatch');
        return;
      }
      await tx.reminderAttempt.update({
        where: { id: attemptId },
        data: {
          outcome: outcome.outcome,
          externalId:
            outcome.outcome === 'provider_accepted' ? outcome.externalId : null,
          errorCode: 'code' in outcome ? outcome.code : null,
          finishedAt: new Date(),
        },
      });
      await tx.reminderLog.updateMany({
        where: {
          id: job.data.reminderId,
          attemptToken: attemptId,
          deliveryStatus: 'dispatch_claimed',
        },
        data: {
          deliveryStatus: outcome.outcome,
          externalId:
            outcome.outcome === 'provider_accepted' ? outcome.externalId : null,
          lastError: 'code' in outcome ? outcome.code : null,
          sentDate: outcome.outcome === 'provider_accepted' ? new Date() : null,
        },
      });
    });
  }
  async reconcile(jobs: JobsService, signal?: AbortSignal): Promise<void> {
    let cursor = '';
    for (;;) {
      signal?.throwIfAborted();
      const rows = await this.prisma.reminderLog.findMany({
        where: {
          id: { gt: cursor },
          reminderChannel: 'sms',
          deliveryStatus: {
            in: [
              'queued',
              'dispatch_claimed',
              'uncertain',
              'provider_accepted',
              'sent',
            ],
          },
        },
        orderBy: { id: 'asc' },
        take: 200,
      });
      if (!rows.length) return;
      for (const row of rows) {
        signal?.throwIfAborted();
        if (!['queued', 'dispatch_claimed'].includes(row.deliveryStatus))
          continue;
        const job = row.jobId
          ? await jobs.boss!.getJobById(QUEUES.sms, row.jobId)
          : null;
        if (job && !['failed', 'cancelled', 'completed'].includes(job.state))
          continue;
        const deadLetters = await jobs.boss!.findJobs(QUEUES.dead, {
          data: { reminderId: row.id },
          limit: 100,
        });
        const deadLettered = deadLetters.some(
          (item) =>
            item.sourceName === QUEUES.sms && item.sourceId === row.jobId,
        );
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.reminderLog.updateMany({
            where: { id: row.id, deliveryStatus: row.deliveryStatus },
            data: {
              deliveryStatus:
                row.deliveryStatus === 'queued' ? 'failed' : 'uncertain',
              lastError:
                row.deliveryStatus === 'queued'
                  ? deadLettered
                    ? 'sms_job_dead_lettered'
                    : 'sms_job_missing_or_failed'
                  : deadLettered
                    ? 'dispatch_dead_lettered_outcome_unknown'
                    : 'dispatch_outcome_unknown',
            },
          });
          if (updated.count && row.deliveryStatus === 'dispatch_claimed')
            await tx.reminderAttempt.updateMany({
              where: {
                id: row.attemptToken ?? '',
                outcome: 'dispatch_claimed',
              },
              data: {
                outcome: 'uncertain',
                errorCode: 'worker_interrupted',
                finishedAt: new Date(),
              },
            });
        });
      }
      cursor = rows[rows.length - 1].id;
    }
  }
}
