import { Controller, Post, Req, HttpCode } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ReminderWebhookService } from './reminder-webhook.service';

@Controller('notifications/webhooks/resend')
export class ReminderWebhookController {
  constructor(private readonly webhooks: ReminderWebhookService) {}
  @Post()
  @HttpCode(202)
  receive(@Req() req: RawBodyRequest<Request>) {
    const header = (name: string) =>
      typeof req.headers[name] === 'string' ? req.headers[name] : '';
    return this.webhooks.receive(req.rawBody, {
      id: header('svix-id'),
      timestamp: header('svix-timestamp'),
      signature: header('svix-signature'),
    });
  }
}
