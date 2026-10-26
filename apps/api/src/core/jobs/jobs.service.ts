import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PgBoss, Queue } from 'pg-boss';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { PrismaService } from '../database/prisma.service';

export const JOB_SCHEMA = 't36_jobs';
export const QUEUES = {
  scan: 't36-overdue-scan',
  email: 't36-reminder-email',
  events: 't36-provider-event',
  reconcile: 't36-reconcile',
  dead: 't36-dead-letter',
} as const;
export const RETRY_OPTIONS = {
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 3600,
  expireInSeconds: 300,
  heartbeatSeconds: 60,
  retentionSeconds: 86400,
  deleteAfterSeconds: 604800,
} satisfies Omit<Queue, 'name'>;

@Injectable()
export class JobsService implements OnModuleDestroy {
  boss?: PgBoss;
  private library?: typeof import('pg-boss');
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  private closingBoss?: Promise<void>;
  private accepting = false;

  constructor(
    prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    // Prisma may have multiple module providers; its disconnect must await all
    // active workers regardless of Nest's module destruction order.
    prisma.beforeDisconnect(() => this.stop());
  }

  start(): Promise<void> {
    if (this.stopping)
      return Promise.reject(new Error('T36 jobs shutting down'));
    return (this.starting ??= this.initialize());
  }

  private async initialize(): Promise<void> {
    this.library = await import('pg-boss');
    if (this.stopping) throw new Error('T36 startup interrupted by shutdown');
    const boss = new this.library.PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: JOB_SCHEMA,
      migrate: false,
      createSchema: false,
      max: 4,
      connectionTimeoutMillis: 10000,
      persistWarnings: true,
      warningRetentionDays: 30,
      persistQueueStats: true,
      queueStatRetentionDays: 7,
    });
    this.boss = boss;
    boss.on('error', (error) =>
      this.logger.error('T36 jobs error', { error: error.message }),
    );
    boss.on('warning', ({ message }) =>
      this.logger.warn('T36 jobs warning', { message }),
    );
    try {
      await boss.start();
      await boss.createQueue(QUEUES.dead, {
        retentionSeconds: 604800,
        deleteAfterSeconds: 604800,
      });
      for (const name of [
        QUEUES.scan,
        QUEUES.email,
        QUEUES.events,
        QUEUES.reconcile,
      ]) {
        const options = { ...RETRY_OPTIONS, deadLetter: QUEUES.dead };
        await boss.createQueue(name, options);
        await boss.updateQueue(name, options);
      }
      if (this.stopping) throw new Error('T36 startup interrupted by shutdown');
      this.accepting = true;
    } catch (error) {
      await this.closeBoss();
      throw error;
    }
  }

  async enqueue(
    tx: Prisma.TransactionClient,
    name: string,
    data: object,
    id?: string,
  ) {
    if (!this.accepting || !this.boss || !this.library)
      throw new Error('T36 jobs unavailable');
    const jobId = await this.boss.send(name, data, {
      id,
      db: this.library.fromPrisma(tx),
    });
    if (!jobId) throw new Error('T36 enqueue did not create a job');
    return jobId;
  }

  stop(): Promise<void> {
    this.accepting = false;
    return (this.stopping ??= (async () => {
      if (this.starting) await this.starting.catch(() => undefined);
      await this.closeBoss();
    })());
  }

  private closeBoss(): Promise<void> {
    return (this.closingBoss ??=
      this.boss?.stop({ graceful: true, timeout: 30000 }) ?? Promise.resolve());
  }

  async onModuleDestroy() {
    await this.stop();
  }
}
