import { Module } from '@nestjs/common';
import { JobsModule } from '../../core/jobs/jobs.module';
import { RemindersService } from './reminders.service';
import { ReminderDeliveryService } from './reminder-delivery.service';
import {
  ReminderEmailProvider,
  ResendReminderProvider,
} from './reminder-email.provider';
import { ReminderWorkersService } from './reminder-workers.service';
import { ReminderWebhookService } from './reminder-webhook.service';
import { TwilioWebhookController } from './twilio-webhook.controller';
import { ReminderWebhookController } from './reminder-webhook.controller';
import { RenewalScanService } from './renewal-scan.service';
import { ReminderSmsDeliveryService } from './reminder-sms-delivery.service';
import {
  ReminderSmsProvider,
  TwilioReminderProvider,
} from './reminder-sms.provider';
import { MembershipExpiryService } from './membership-expiry.service';

@Module({
  imports: [JobsModule],
  providers: [
    RemindersService,
    RenewalScanService,
    ReminderDeliveryService,
    ReminderSmsDeliveryService,
    { provide: ReminderSmsProvider, useClass: TwilioReminderProvider },
    ReminderWorkersService,
    ReminderWebhookService,
    MembershipExpiryService,
    { provide: ReminderEmailProvider, useClass: ResendReminderProvider },
  ],
  controllers: [ReminderWebhookController, TwilioWebhookController],
})
export class RemindersModule {}
