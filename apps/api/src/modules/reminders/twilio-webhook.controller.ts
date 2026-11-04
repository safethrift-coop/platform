import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import twilio from 'twilio';
import { createHash } from 'node:crypto';
import { smsPayload } from './reminder-policy';
import { PrismaService } from '../../core/database/prisma.service';

@Controller('notifications/webhooks/twilio')
export class TwilioWebhookController {
  constructor(private readonly prisma: PrismaService) {}
  @Post()
  @HttpCode(204)
  async receive(@Req() req: Request): Promise<void> {
    const token = process.env.TWILIO_AUTH_TOKEN,
      account = process.env.TWILIO_ACCOUNT_SID,
      base = process.env.T36_TWILIO_STATUS_CALLBACK_URL;
    if (!token || !account || !base)
      throw new ServiceUnavailableException('Twilio callback disabled');
    const signature = req.header('x-twilio-signature');
    if (
      !signature ||
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    )
      throw new UnauthorizedException('Invalid callback');
    const body = req.body as Record<string, unknown>;
    if (Object.values(body).some((value) => typeof value !== 'string'))
      throw new BadRequestException('Invalid callback');
    const params = body as Record<string, string>;
    const reminderId = req.query.reminderId,
      attemptId = req.query.attemptId;
    if (
      typeof reminderId !== 'string' ||
      typeof attemptId !== 'string' ||
      reminderId.length > 128 ||
      attemptId.length > 128
    )
      throw new BadRequestException('Invalid callback identity');
    const canonical = new URL(base);
    canonical.searchParams.set('reminderId', reminderId);
    canonical.searchParams.set('attemptId', attemptId);
    if (
      req.originalUrl !== canonical.pathname + canonical.search ||
      !twilio.validateRequest(token, signature, canonical.toString(), params)
    )
      throw new UnauthorizedException('Invalid callback signature');
    const sid = params.MessageSid,
      status = params.MessageStatus;
    if (
      params.AccountSid !== account ||
      !/^SM[0-9a-f]{32}$/i.test(sid ?? '') ||
      ![
        'queued',
        'accepted',
        'sending',
        'sent',
        'delivered',
        'undelivered',
        'failed',
      ].includes(status)
    )
      throw new BadRequestException('Invalid callback fields');
    const id =
      'twilio:' +
      createHash('sha256')
        .update(JSON.stringify([sid, status, params.ErrorCode ?? '']))
        .digest('hex');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sid}, 0))`;
      await tx.$queryRaw`SELECT reminder_id FROM reminder_logs WHERE reminder_id = ${reminderId} FOR UPDATE`;
      const row = await tx.reminderLog.findUnique({
        where: { id: reminderId },
      });
      const attempt = await tx.reminderAttempt.findUnique({
        where: { id: attemptId },
      });
      if (
        !row ||
        row.reminderChannel !== 'sms' ||
        row.attemptToken !== attemptId ||
        (row.externalId !== null && row.externalId !== sid) ||
        !attempt ||
        attempt.reminderId !== reminderId ||
        attempt.jobId !== row.jobId ||
        (attempt.externalId !== null && attempt.externalId !== sid) ||
        ![
          'dispatch_claimed',
          'uncertain',
          'provider_accepted',
          'sent',
          'delivered',
          'failed',
        ].includes(row.deliveryStatus) ||
        smsPayload(row.payload).statusCallback !== canonical.toString()
      )
        throw new BadRequestException('Unrecognized callback');
      const existing = await tx.reminderLog.findFirst({
        where: {
          reminderChannel: 'sms',
          externalId: sid,
          id: { not: reminderId },
        },
      });
      if (existing) throw new BadRequestException('Unrecognized callback');
      const now = new Date();
      const inserted = await tx.reminderProviderEvent.createMany({
        data: {
          id,
          externalId: sid,
          eventType: `sms.${status}`,
          occurredAt: now,
          processedAt: now,
        },
        skipDuplicates: true,
      });
      if (!inserted.count) return;
      if (!row.externalId) {
        await tx.reminderLog.update({
          where: { id: reminderId },
          data: { externalId: sid, sentDate: row.sentDate ?? now },
        });
        await tx.reminderAttempt.update({
          where: { id: attemptId },
          data: {
            externalId: sid,
            outcome: 'provider_accepted',
            finishedAt: now,
          },
        });
      }
      if (['delivered', 'failed', 'bounced'].includes(row.deliveryStatus))
        return;
      const next =
        status === 'delivered'
          ? 'delivered'
          : ['undelivered', 'failed'].includes(status)
            ? 'failed'
            : status === 'sent'
              ? 'sent'
              : row.deliveryStatus === 'uncertain' ||
                  row.deliveryStatus === 'dispatch_claimed'
                ? 'provider_accepted'
                : null;
      if (next)
        await tx.reminderLog.update({
          where: { id: reminderId },
          data: {
            deliveryStatus: next,
            deliveredAt: next === 'delivered' ? now : row.deliveredAt,
            providerEventAt: now,
            providerEventType: `sms.${status}`,
          },
        });
    });
  }
}
