import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { JobsService, QUEUES } from '../../core/jobs/jobs.service';
import { eligible, scheduleInclude, utcDate } from './reminder-policy';

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async scan(now?: Date, signal?: AbortSignal): Promise<number> {
    if ((process.env.T36_EMAIL_MODE ?? 'disabled') === 'disabled') return 0;
    const scanTime =
      now ??
      (
        await this.prisma.$queryRaw<
          { now: Date }[]
        >`SELECT CURRENT_TIMESTAMP AS now`
      )[0].now;
    const date = utcDate(scanTime);
    let cursor = '';
    let queued = 0;
    for (;;) {
      signal?.throwIfAborted();
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.schedule_id AS id FROM repayment_schedule s
        JOIN loans l ON l.loan_id = s.loan_id JOIN members m ON m.member_id = l.member_id
        WHERE s.schedule_id > ${cursor} AND s.due_date < ${date}::date
          AND s.total_due > s.total_paid AND s.status IN ('due','partial','late','missed')
          AND l.loan_status = 'active' AND l.disbursement_date IS NOT NULL
          AND m.membership_status = 'active' AND m.email_verified = true
          AND NOT EXISTS (SELECT 1 FROM reminder_logs r WHERE r.repayment_schedule_id = s.schedule_id
            AND r.reminder_type = 'late_payment' AND r.reminder_channel = 'email')
        ORDER BY s.schedule_id LIMIT 200`;
      if (!rows.length) break;
      for (const { id } of rows) {
        signal?.throwIfAborted();
        for (let retry = 0; ; retry++) {
          try {
            const created = await this.prisma.$transaction(
              async (tx) => {
                const row = await tx.repaymentSchedule.findUnique({
                  where: { id },
                  include: scheduleInclude,
                });
                if (!row || !eligible(row, date)) return false;
                const reminderId = randomUUID();
                const jobId = randomUUID();
                const claim = await tx.reminderLog.createMany({
                  data: {
                    id: reminderId,
                    memberId: row.loan.memberId,
                    relatedLoanId: row.loanId,
                    repaymentScheduleId: id,
                    reminderType: 'late_payment',
                    reminderChannel: 'email',
                    scanDate: date,
                    queuedAt: scanTime,
                    sentDate: null,
                    dueDate: row.dueDate,
                    providerKey: `t36-initial-overdue/${reminderId}`,
                    jobId,
                    messageTemplate: 'initial-overdue-v1',
                  },
                  skipDuplicates: true,
                });
                if (!claim.count) return false;
                await this.jobs.enqueue(
                  tx,
                  QUEUES.email,
                  { reminderId },
                  jobId,
                );
                await tx.auditLog.create({
                  data: {
                    tableName: 'reminder_logs',
                    recordId: reminderId,
                    actionType: 'insert',
                    newValue: JSON.stringify({
                      purpose: 'initial_overdue',
                      installmentId: id,
                      jobId,
                    }),
                  },
                });
                return true;
              },
              { isolationLevel: 'Serializable', timeout: 10000 },
            );
            if (created) queued++;
            break;
          } catch (error) {
            if (
              retry >= 3 ||
              !error ||
              typeof error !== 'object' ||
              !('code' in error) ||
              error.code !== 'P2034'
            )
              throw error;
          }
        }
      }
      cursor = rows[rows.length - 1].id;
    }
    this.logger.info('T36 overdue scan complete', {
      date: date.toISOString(),
      queued,
    });
    return queued;
  }
}
