import { Module, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseModule } from '../../core/database/database.module';
import { paymentConfig } from './payment-webhook.config';
import { PaymentJobsService, PAYMENT_QUEUES } from './payment-jobs.service';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentWebhooksController } from './payment-webhooks.controller';
@Injectable()
export class PaymentWorkers implements OnApplicationBootstrap {
  constructor(
    private readonly jobs: PaymentJobsService,
    private readonly service: PaymentWebhooksService,
  ) {}
  async onApplicationBootstrap() {
    if (!paymentConfig()) return;
    await this.jobs.start();
    try {
      const boss = this.jobs.boss!;
      await boss.work<{ eventId: string }>(
        PAYMENT_QUEUES.events,
        { batchSize: 1 },
        async ([job]) => {
          await this.service.process(job.data.eventId);
        },
      );
      await boss.work(PAYMENT_QUEUES.recovery, { batchSize: 1 }, async () => {
        await this.service.recover();
      });
      await boss.schedule(
        PAYMENT_QUEUES.recovery,
        '*/5 * * * *',
        {},
        { tz: 'UTC', missed: 'once' },
      );
      await this.service.recover();
    } catch (error) {
      await this.jobs.stop();
      throw error;
    }
  }
}
@Module({
  imports: [DatabaseModule],
  controllers: [PaymentWebhooksController],
  providers: [PaymentJobsService, PaymentWebhooksService, PaymentWorkers],
})
export class PaymentWebhooksModule {}
