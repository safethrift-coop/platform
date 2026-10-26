import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { JobWithMetadata } from 'pg-boss';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { JobsService, QUEUES } from '../../core/jobs/jobs.service';
import {
  ReminderEmailProvider,
  ReminderProviderError,
} from './reminder-email.provider';
import {
  eligible,
  emailPayload,
  IDEMPOTENCY_SAFE_MS,
  overdueEmail,
  scheduleInclude,
  TERMINAL_DELIVERY,
} from './reminder-policy';

type Store = Pick<
  Prisma.TransactionClient,
  'reminderLog' | 'reminderAttempt' | 'reminderProviderEvent'
>;
export type EmailJob = Pick<
  JobWithMetadata<{ reminderId: string }>,
  'id' | 'data' | 'retryCount' | 'retryLimit' | 'signal'
>;

@Injectable()
export class ReminderDeliveryService {
  private readonly db: Store;
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly provider: ReminderEmailProvider,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.db = prisma;
  }

  async deliver(job: EmailJob): Promise<void> {
    if ((process.env.T36_EMAIL_MODE ?? 'disabled') === 'disabled')
      throw new Error('T36 delivery disabled');
    const [{ now }] = await this.prisma.$queryRaw<
      { now: Date }[]
    >`SELECT CURRENT_TIMESTAMP AS now`;
    const token = randomUUID();
    const prepared = await this.prisma.$transaction(async (tx) => {
      // Serialize all state changes for this reminder, including webhook updates.
      await tx.$queryRaw`SELECT reminder_id FROM reminder_logs WHERE reminder_id = ${job.data.reminderId} FOR UPDATE`;
      const row = await tx.reminderLog.findUnique({
        where: { id: job.data.reminderId },
      });
      if (
        !row ||
        row.providerEventAt !== null ||
        (TERMINAL_DELIVERY as readonly string[]).includes(row.deliveryStatus)
      )
        return null;
      if (row.jobId !== job.id)
        throw new Error('T36 reminder/job identity mismatch');
      const accepted = await tx.reminderAttempt.findFirst({
        where: {
          reminderId: row.id,
          outcome: 'provider_accepted',
          externalId: { not: null },
        },
      });
      if (accepted) {
        await tx.reminderLog.update({
          where: { id: row.id },
          data: {
            deliveryStatus: 'provider_accepted',
            externalId: accepted.externalId,
            sentDate: accepted.finishedAt,
          },
        });
        return null;
      }
      const uncertainBefore = await tx.reminderAttempt.count({
        where: {
          reminderId: row.id,
          outcome: { in: ['attempted', 'uncertain'] },
        },
      });
      const unfinished = uncertainBefore;
      if (
        row.firstAttemptAt &&
        now.getTime() - row.firstAttemptAt.getTime() >= IDEMPOTENCY_SAFE_MS
      ) {
        await tx.reminderLog.update({
          where: { id: row.id },
          data: {
            deliveryStatus: 'uncertain',
            lastError: 'idempotency_window_expired',
          },
        });
        return null;
      }
      if (row.transport && row.transport !== process.env.T36_EMAIL_MODE) {
        await tx.reminderLog.update({
          where: { id: row.id },
          data: {
            deliveryStatus: uncertainBefore ? 'uncertain' : 'skipped',
            lastError: 'transport_changed',
          },
        });
        return null;
      }
      const schedule = row.repaymentScheduleId
        ? await tx.repaymentSchedule.findUnique({
            where: { id: row.repaymentScheduleId },
            include: scheduleInclude,
          })
        : null;
      if (
        !schedule ||
        !eligible(schedule, now) ||
        (row.payload &&
          emailPayload(row.payload).to !== schedule.loan.member.email)
      ) {
        await tx.reminderLog.update({
          where: { id: row.id },
          data: {
            deliveryStatus:
              row.deliveryStatus === 'uncertain' || unfinished
                ? 'uncertain'
                : 'skipped',
            lastError: 'no_longer_eligible',
          },
        });
        return null;
      }
      const payload = row.payload
        ? emailPayload(row.payload)
        : overdueEmail(schedule, now, row.id);
      await tx.reminderAttempt.updateMany({
        where: { reminderId: row.id, outcome: 'attempted' },
        data: {
          outcome: 'uncertain',
          finishedAt: now,
          errorCode: 'worker_interrupted',
        },
      });
      await tx.reminderAttempt.create({
        data: {
          id: token,
          reminderId: row.id,
          jobId: job.id,
          retryCount: job.retryCount,
          outcome: 'attempted',
        },
      });
      await tx.reminderLog.update({
        where: { id: row.id },
        data: {
          payload: { ...payload },
          firstAttemptAt: row.firstAttemptAt ?? now,
          attemptToken: token,
          deliveryStatus: 'attempted',
          transport: process.env.T36_EMAIL_MODE,
        },
      });
      return {
        payload,
        key: row.providerKey!,
        uncertainBefore: uncertainBefore > 0,
      };
    });
    if (!prepared) return;
    try {
      const result = await this.provider.send(
        prepared.payload,
        prepared.key,
        job.signal,
      );
      if (result.outcome === 'provider_accepted' && !result.externalId)
        throw new ReminderProviderError('missing_provider_id', true, true);
      await this.prisma.$transaction(async (tx) => {
        await tx.reminderAttempt.update({
          where: { id: token },
          data: {
            outcome: result.outcome,
            externalId: result.externalId,
            finishedAt: new Date(),
          },
        });
        await tx.reminderLog.updateMany({
          where: {
            id: job.data.reminderId,
            attemptToken: token,
            providerEventAt: null,
            deliveryStatus: { notIn: ['delivered', 'bounced'] },
          },
          data: {
            deliveryStatus: result.outcome,
            externalId: result.externalId,
            sentDate:
              result.outcome === 'provider_accepted' ? new Date() : null,
            lastError: null,
          },
        });
      });
      this.logger.info('T36 reminder outcome', {
        reminderId: job.data.reminderId,
        jobId: job.id,
        outcome: result.outcome,
      });
    } catch (error) {
      // Includes a lost DB write after provider acceptance: outcome is ambiguous,
      // and a retry must reuse the already frozen body and provider key.
      const fault =
        error instanceof ReminderProviderError
          ? error
          : new ReminderProviderError('delivery_outcome_unknown', true, true);
      const uncertain = fault.uncertain || prepared.uncertainBefore;
      await this.prisma.$transaction(async (tx) => {
        await tx.reminderAttempt.update({
          where: { id: token },
          data: {
            outcome: uncertain ? 'uncertain' : 'failed',
            errorCode: fault.code,
            finishedAt: new Date(),
          },
        });
        await tx.reminderLog.updateMany({
          where: {
            id: job.data.reminderId,
            attemptToken: token,
            providerEventAt: null,
            deliveryStatus: {
              notIn: ['delivered', 'bounced', 'provider_accepted'],
            },
          },
          data: {
            deliveryStatus: uncertain
              ? 'uncertain'
              : fault.retryable && job.retryCount < job.retryLimit
                ? 'queued'
                : 'failed',
            lastError: fault.code,
          },
        });
      });
      this.logger.warn('T36 reminder attempt failed', {
        reminderId: job.data.reminderId,
        jobId: job.id,
        retry: job.retryCount,
        code: fault.code,
      });
      if (fault.retryable) throw fault;
    }
  }

  async processEvent(id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.reminderProviderEvent.findUnique({
        where: { id },
      });
      if (!event || event.processedAt) return true;
      const matches = await tx.reminderLog.findMany({
        where: { externalId: event.externalId },
      });
      if (!matches.length) return false; // Reconciliation handles webhook-before-acceptance races.
      for (const row of matches) {
        await tx.$queryRaw`SELECT reminder_id FROM reminder_logs WHERE reminder_id = ${row.id} FOR UPDATE`;
        const current = await tx.reminderLog.findUniqueOrThrow({
          where: { id: row.id },
        });
        const older =
          current.providerEventAt && current.providerEventAt > event.occurredAt;
        const tiedFailure =
          current.providerEventAt?.getTime() === event.occurredAt.getTime() &&
          ['email.bounced', 'email.failed'].includes(
            current.providerEventType ?? '',
          );
        if (!older && !(tiedFailure && event.eventType === 'email.delivered')) {
          const status =
            event.eventType === 'email.delivered'
              ? 'delivered'
              : event.eventType === 'email.bounced'
                ? 'bounced'
                : 'failed';
          await tx.reminderLog.update({
            where: { id: row.id },
            data: {
              deliveryStatus: status,
              sentDate: current.sentDate ?? event.receivedAt,
              providerEventAt: event.occurredAt,
              providerEventType: event.eventType,
              deliveredAt:
                status === 'delivered' ? event.occurredAt : current.deliveredAt,
              lastError: status === 'delivered' ? null : event.eventType,
            },
          });
        }
      }
      await tx.reminderProviderEvent.update({
        where: { id },
        data: { processedAt: new Date() },
      });
      return true;
    });
  }

  async reconcile(signal?: AbortSignal): Promise<void> {
    let cursor = '';
    let inspected = 0;
    for (;;) {
      signal?.throwIfAborted();
      const pending = await this.db.reminderLog.findMany({
        where: {
          id: { gt: cursor },
          jobId: { not: null },
          providerEventAt: null,
          deliveryStatus: {
            in: ['queued', 'attempted', 'uncertain', 'failed'],
          },
        },
        take: 200,
        orderBy: { id: 'asc' },
      });
      if (!pending.length) break;
      for (const row of pending) {
        signal?.throwIfAborted();
        const accepted = await this.db.reminderAttempt.findFirst({
          where: {
            reminderId: row.id,
            outcome: 'provider_accepted',
            externalId: { not: null },
          },
        });
        if (accepted) {
          await this.db.reminderLog.updateMany({
            where: {
              id: row.id,
              providerEventAt: null,
              deliveryStatus: {
                in: ['queued', 'attempted', 'uncertain', 'failed'],
              },
            },
            data: {
              deliveryStatus: 'provider_accepted',
              externalId: accepted.externalId,
              sentDate: accepted.finishedAt,
            },
          });
        } else {
          const job = await this.jobs.boss!.getJobById(
            QUEUES.email,
            row.jobId!,
          );
          if (!job || ['failed', 'cancelled'].includes(job.state)) {
            await this.db.reminderLog.updateMany({
              where: {
                id: row.id,
                providerEventAt: null,
                deliveryStatus: { in: ['queued', 'attempted', 'uncertain'] },
              },
              data: {
                deliveryStatus: row.firstAttemptAt ? 'uncertain' : 'failed',
                lastError: 'job_exhausted_or_missing',
              },
            });
            await this.db.reminderAttempt.updateMany({
              where: { reminderId: row.id, outcome: 'attempted' },
              data: {
                outcome: 'uncertain',
                finishedAt: new Date(),
                errorCode: 'worker_interrupted',
              },
            });
          }
        }
        if (row.deliveryStatus === 'uncertain')
          this.logger.warn(
            'T36 delivery needs review; no automatic fresh-key resend',
            { reminderId: row.id },
          );
      }
      inspected += pending.length;
      cursor = pending[pending.length - 1].id;
    }
    cursor = '';
    let events = 0;
    for (;;) {
      signal?.throwIfAborted();
      const pending = await this.db.reminderProviderEvent.findMany({
        where: { id: { gt: cursor }, processedAt: null },
        orderBy: { id: 'asc' },
        take: 200,
      });
      if (!pending.length) break;
      for (const event of pending) {
        signal?.throwIfAborted();
        await this.processEvent(event.id);
      }
      events += pending.length;
      cursor = pending[pending.length - 1].id;
    }
    for (const queue of [
      QUEUES.scan,
      QUEUES.email,
      QUEUES.events,
      QUEUES.dead,
    ]) {
      const stats = await this.jobs.boss!.getQueue(queue);
      if (stats)
        this.logger.info('T36 queue status', {
          queue,
          queued: stats.queuedCount,
          active: stats.activeCount,
          failed: stats.failedCount,
          oldestReadySeconds: stats.readyOldestSeconds,
        });
    }
    this.logger.info('T36 reconciliation complete', { inspected, events });
  }
}
