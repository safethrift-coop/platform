import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paymentConfig, type PaymentProvider } from './payment-webhook.config';
import { hash, verifyEvents } from './payment-webhook.policy';
import { PaymentJobsService, PAYMENT_QUEUES } from './payment-jobs.service';

// All database writes in this module target T38 evidence tables and pg-boss only.
@Injectable()
export class PaymentWebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: PaymentJobsService,
  ) {}
  private async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: 'Serializable',
          timeout: 15000,
        });
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? error.code
            : undefined;
        const meta =
          error && typeof error === 'object' && 'meta' in error
            ? error.meta
            : undefined;
        const sqlState =
          meta && typeof meta === 'object' && 'code' in meta
            ? meta.code
            : undefined;
        const adapter =
          meta && typeof meta === 'object' && 'driverAdapterError' in meta
            ? meta.driverAdapterError
            : undefined;
        const cause =
          adapter && typeof adapter === 'object' && 'cause' in adapter
            ? adapter.cause
            : undefined;
        const adapterState =
          cause && typeof cause === 'object' && 'originalCode' in cause
            ? cause.originalCode
            : undefined;
        // Prisma maps model conflicts to P2034, but raw row locks to P2010.
        const conflict =
          code === 'P2034' ||
          (code === 'P2010' &&
            ['40001', '40P01'].includes(String(sqlState ?? adapterState)));
        if (attempt >= 3 || !conflict) throw error;
      }
    }
  }
  async receive(
    provider: PaymentProvider,
    body: Buffer | undefined,
    signature: string,
  ) {
    let config: ReturnType<typeof paymentConfig>;
    try {
      config = paymentConfig(provider);
    } catch {
      throw new ServiceUnavailableException(
        'Payment webhook intake unavailable',
      );
    }
    if (!config || !body)
      throw new ServiceUnavailableException(
        'Payment webhook intake unavailable',
      );
    const scope = {
      provider,
      environment: config.environment,
      accountScope: config.accountScope,
    };
    let events: ReturnType<typeof verifyEvents>;
    try {
      events = verifyEvents(provider, body, signature);
    } catch {
      await this.transaction((tx) =>
        tx.paymentWebhookDelivery.create({
          data: {
            ...scope,
            bodyHash: hash(body),
            outcome: 'rejected',
            eventIds: [],
          },
        }),
      );
      throw new BadRequestException('Invalid payment webhook');
    }
    // Retry transaction conflicts in full; never acknowledge a partially stored batch.
    await this.transaction(async (tx) => {
      const eventIds: string[] = [];
      let collision = false;
      for (const event of events) {
        const id = randomUUID();
        const jobId = randomUUID();
        const inserted = await tx.paymentWebhookEvent.createMany({
          data: {
            id,
            ...scope,
            providerEventId: event.providerEventId,
            eventHash: event.eventHash,
            eventType: event.eventType,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            occurredAt: event.occurredAt,
            evidence: event.evidence,
            status: event.supported ? 'queued' : 'ignored',
            reason: event.supported ? null : 'unsupported_event',
            jobId: event.supported ? jobId : null,
            processedAt: event.supported ? null : new Date(),
          },
          skipDuplicates: true,
        });
        if (inserted.count) {
          eventIds.push(id);
          if (event.supported) await this.jobs.enqueue(tx, id, jobId);
        } else {
          const existing = await tx.paymentWebhookEvent.findUniqueOrThrow({
            where: {
              provider_environment_accountScope_providerEventId: {
                ...scope,
                providerEventId: event.providerEventId,
              },
            },
          });
          eventIds.push(existing.id);
          if (existing.eventHash !== event.eventHash) {
            collision = true;
            await tx.paymentWebhookEvent.update({
              where: { id: existing.id },
              data: { status: 'review', reason: 'event_identity_collision' },
            });
          }
        }
      }
      await tx.paymentWebhookDelivery.create({
        data: {
          ...scope,
          bodyHash: hash(body),
          outcome: collision ? 'review' : 'accepted',
          eventIds,
        },
      });
    });
    return { received: true };
  }
  async process(eventId: string): Promise<void> {
    // Configuration is checked again at execution time, including on queued work.
    if (!paymentConfig()) throw new Error('T38 disabled');
    await this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payment_webhook_events WHERE id = ${eventId} FOR UPDATE`;
      const event = await tx.paymentWebhookEvent.findUniqueOrThrow({
        where: { id: eventId },
      });
      const config = paymentConfig(event.provider as PaymentProvider)!;
      if (
        event.environment !== config.environment ||
        event.accountScope !== config.accountScope
      )
        throw new Error('T38 event scope mismatch');
      if (event.status !== 'queued') return;
      const evidence = event.evidence as Prisma.JsonObject;
      if (!event.resourceId) {
        await tx.paymentWebhookEvent.update({
          where: { id: eventId },
          data: {
            status: 'review',
            reason: 'missing_resource',
            processedAt: new Date(),
          },
        });
        return;
      }
      const common = {
        eventId,
        provider: event.provider,
        environment: event.environment,
        accountScope: event.accountScope,
        resourceId: event.resourceId,
        fact: event.eventType,
        occurredAt: event.occurredAt,
      };
      if (event.resourceType === 'mandates') {
        await tx.mandateObservation.create({
          data: {
            ...common,
            replacementId:
              typeof evidence.replacementId === 'string'
                ? evidence.replacementId
                : null,
          },
        });
      } else {
        await tx.paymentObservation.create({
          data: {
            ...common,
            resourceType: event.resourceType,
            amountMinor:
              typeof evidence.amountMinor === 'string'
                ? evidence.amountMinor
                : null,
            currency:
              typeof evidence.currency === 'string' ? evidence.currency : null,
          },
        });
      }
      const observations =
        event.resourceType === 'mandates'
          ? await tx.mandateObservation.findMany({
              where: {
                provider: event.provider,
                environment: event.environment,
                accountScope: event.accountScope,
                resourceId: event.resourceId,
              },
            })
          : await tx.paymentObservation.findMany({
              where: {
                provider: event.provider,
                environment: event.environment,
                accountScope: event.accountScope,
                resourceId: event.resourceId,
                resourceType: event.resourceType,
              },
            });
      const facts = observations.map((row) => row.fact);
      const positive = [
        'payment_intent.succeeded',
        'charge.succeeded',
        'payments.confirmed',
        'payments.paid_out',
        'mandates.active',
        'mandates.reinstated',
      ];
      const adverse = [
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'charge.failed',
        'charge.refunded',
        'payments.failed',
        'payments.cancelled',
        'payments.charged_back',
        'mandates.failed',
        'mandates.cancelled',
        'mandates.expired',
        'mandates.blocked',
      ];
      const conflicting =
        facts.some((fact) => positive.includes(fact)) &&
        facts.some((fact) => adverse.includes(fact));
      if (conflicting) {
        // A retry or later reversal may explain these facts. Preserve both and
        // flag the whole resource history; neither occurrence time nor arrival
        // order authorizes choosing a winning payment/mandate state.
        await tx.paymentWebhookEvent.updateMany({
          where: {
            id: { in: observations.map((row) => row.eventId) },
            reason: { not: 'event_identity_collision' },
          },
          data: { reason: 'unmatched_resource_conflicting_observations' },
        });
      }
      // No mapping or settlement policy is approved. Retain *all* facts, never
      // overwrite a resource's state using event time, and quarantine for review.
      await tx.paymentWebhookEvent.update({
        where: { id: eventId },
        data: {
          status: 'quarantined',
          reason: conflicting
            ? 'unmatched_resource_conflicting_observations'
            : 'unmatched_resource_no_business_rule',
          processedAt: new Date(),
        },
      });
    });
  }
  async recover(): Promise<void> {
    if (!paymentConfig() || !this.jobs.boss) return;
    let cursor = '';
    for (;;) {
      const pending = await this.prisma.$transaction((tx) =>
        tx.paymentWebhookEvent.findMany({
          where: { status: 'queued', id: { gt: cursor } },
          take: 200,
          orderBy: { id: 'asc' },
        }),
      );
      if (!pending.length) break;
      for (const event of pending) {
        const job = event.jobId
          ? await this.jobs.boss.getJobById(PAYMENT_QUEUES.events, event.jobId)
          : null;
        if (job && !['failed', 'cancelled', 'completed'].includes(job.state))
          continue;
        await this.transaction(async (tx) => {
          const current = await tx.paymentWebhookEvent.findUniqueOrThrow({
            where: { id: event.id },
          });
          if (current.status !== 'queued' || current.jobId !== event.jobId)
            return;
          if (job || current.recoveries >= 3) {
            await tx.paymentWebhookEvent.update({
              where: { id: event.id },
              data: { status: 'review', reason: 'processing_exhausted' },
            });
            return;
          }
          const jobId = randomUUID();
          await this.jobs.enqueue(tx, event.id, jobId);
          await tx.paymentWebhookEvent.update({
            where: { id: event.id },
            data: { jobId, recoveries: { increment: 1 } },
          });
        });
      }
      cursor = pending[pending.length - 1].id;
    }
  }
}
