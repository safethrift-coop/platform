import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Resend } from 'resend';
import { PrismaService } from '../../core/database/prisma.service';
import { JobsService, QUEUES } from '../../core/jobs/jobs.service';

@Injectable()
export class ReminderWebhookService {
  private readonly resend = new Resend('re_webhook_verification_only');
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  async receive(
    raw: Buffer | undefined,
    headers: { id: string; timestamp: string; signature: string },
  ) {
    const secret = process.env.T36_RESEND_WEBHOOK_SECRET;
    if (!secret || process.env.T36_JOBS_ENABLED !== 'true')
      throw new ServiceUnavailableException('T36 webhook disabled');
    if (!raw || !headers.id || !headers.timestamp || !headers.signature)
      throw new UnauthorizedException('Invalid provider signature');
    let event: unknown;
    try {
      event = this.resend.webhooks.verify({
        payload: raw.toString('utf8'),
        headers,
        webhookSecret: secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid provider signature');
    }
    if (!event || typeof event !== 'object' || Array.isArray(event))
      throw new BadRequestException('Invalid provider event');
    const value = event as {
      type?: unknown;
      created_at?: unknown;
      data?: { email_id?: unknown; tags?: Record<string, unknown> };
    };
    if (
      !['email.delivered', 'email.bounced', 'email.failed'].includes(
        String(value.type),
      )
    )
      return { ignored: true };
    if (
      typeof value.data?.email_id !== 'string' ||
      !value.data.email_id ||
      value.data.email_id.length > 128 ||
      typeof value.created_at !== 'string' ||
      !Number.isFinite(Date.parse(value.created_at)) ||
      headers.id.length > 256
    )
      throw new BadRequestException('Invalid provider event');
    const id = `resend:${headers.id}`;
    const externalId = value.data.email_id;
    const eventType = String(value.type);
    const occurredAt = new Date(value.created_at);
    const correlatedId = value.data?.tags?.t36_reminder_id;
    const received = await this.prisma.$transaction(async (tx) => {
      // A signed provider tag links webhook-before-response outcomes to the
      // frozen request. Unrelated auth emails must not fill the T36 inbox.
      if (typeof correlatedId === 'string' && correlatedId.length <= 128) {
        await tx.$queryRaw`SELECT reminder_id FROM reminder_logs WHERE reminder_id = ${correlatedId} FOR UPDATE`;
        const reminder = await tx.reminderLog.findUnique({
          where: { id: correlatedId },
        });
        if (
          !reminder?.firstAttemptAt ||
          !reminder.payload ||
          !reminder.providerKey?.startsWith('t36-initial-overdue/') ||
          (reminder.externalId && reminder.externalId !== externalId)
        )
          return false;
        await tx.reminderLog.update({
          where: { id: correlatedId },
          data: { externalId },
        });
      } else if (!(await tx.reminderLog.count({ where: { externalId } }))) {
        return false;
      }
      const inserted = await tx.reminderProviderEvent.createMany({
        data: { id, externalId, eventType, occurredAt },
        skipDuplicates: true,
      });
      if (inserted.count)
        await this.jobs.enqueue(tx, QUEUES.events, { eventId: id });
      else {
        const previous = await tx.reminderProviderEvent.findUniqueOrThrow({
          where: { id },
        });
        if (
          previous.externalId !== externalId ||
          previous.eventType !== eventType ||
          previous.occurredAt.getTime() !== occurredAt.getTime()
        )
          throw new BadRequestException('Conflicting provider event identity');
      }
      return true;
    });
    return received ? { received: true } : { ignored: true };
  }
}
