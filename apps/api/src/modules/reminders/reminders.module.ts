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
import { ReminderWebhookController } from './reminder-webhook.controller';
import { MembershipExpiryService } from './membership-expiry.service';

@Module({
  imports: [JobsModule],
  providers: [
    RemindersService,
    ReminderDeliveryService,
    ReminderWorkersService,
    ReminderWebhookService,
    MembershipExpiryService,
    { provide: ReminderEmailProvider, useClass: ResendReminderProvider },
  ],
  controllers: [ReminderWebhookController],
})
export class RemindersModule {}
