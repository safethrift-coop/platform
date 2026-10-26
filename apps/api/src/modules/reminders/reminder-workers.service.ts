import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { JobsService, QUEUES } from '../../core/jobs/jobs.service';
import { RemindersService } from './reminders.service';
import { ReminderDeliveryService } from './reminder-delivery.service';

@Injectable()
export class ReminderWorkersService implements OnApplicationBootstrap {
  constructor(
    private readonly jobs: JobsService,
    private readonly reminders: RemindersService,
    private readonly delivery: ReminderDeliveryService,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.T36_JOBS_ENABLED !== 'true') return;
    await this.jobs.start();
    const boss = this.jobs.boss!;
    try {
      await boss.work(QUEUES.scan, { batchSize: 1 }, async ([job]) => {
        await this.reminders.scan(undefined, job.signal);
      });
      if ((process.env.T36_EMAIL_MODE ?? 'disabled') !== 'disabled') {
        await boss.work<
          { reminderId: string },
          void,
          { batchSize: 1; includeMetadata: true }
        >(
          QUEUES.email,
          { batchSize: 1, includeMetadata: true },
          async ([job]) => {
            await this.delivery.deliver(job);
          },
        );
      }
      await boss.work<{ eventId: string }>(
        QUEUES.events,
        { batchSize: 1 },
        async ([job]) => {
          if (!(await this.delivery.processEvent(job.data.eventId)))
            throw new Error('Provider event awaiting acceptance evidence');
        },
      );
      await boss.work(QUEUES.reconcile, { batchSize: 1 }, async ([job]) => {
        await this.delivery.reconcile(job.signal);
      });
      await boss.schedule(
        QUEUES.scan,
        '0 8 * * *',
        {},
        { tz: 'UTC', key: 'daily-overdue', missed: 'once' },
      );
      await boss.schedule(
        QUEUES.reconcile,
        '*/5 * * * *',
        {},
        { tz: 'UTC', key: 'delivery-recovery', missed: 'once' },
      );
      // No membership-expiry inference or SMS schedule/worker is registered.
    } catch (error) {
      await this.jobs.stop();
      throw error;
    }
  }
}
