import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import { PrismaService } from '../../core/database/prisma.service';
export const PAYMENT_SCHEMA = 't38_jobs';
export const PAYMENT_QUEUES = {
  events: 't38-evidence',
  recovery: 't38-recovery',
  dead: 't38-dead',
} as const;
@Injectable()
export class PaymentJobsService implements OnModuleDestroy {
  boss?: PgBoss;
  private library?: typeof import('pg-boss');
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  private closed?: Promise<void>;
  private accepting = false;
  constructor(prisma: PrismaService) {
    prisma.beforeDisconnect(() => this.stop());
  }
  start(): Promise<void> {
    if (this.stopping) return Promise.reject(new Error('T38 shutting down'));
    return (this.starting ??= this.initialize());
  }
  private async initialize() {
    this.library = await import('pg-boss');
    if (this.stopping) throw new Error('T38 startup interrupted');
    this.boss = new this.library.PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: PAYMENT_SCHEMA,
      migrate: false,
      createSchema: false,
      max: 4,
      connectionTimeoutMillis: 10000,
    });
    // Provider content and connection errors must not enter application logs.
    this.boss.on('error', () => undefined);
    try {
      await this.boss.start();
      await this.boss.createQueue(PAYMENT_QUEUES.dead, {
        retentionSeconds: 604800,
        deleteAfterSeconds: 604800,
      });
      for (const name of [PAYMENT_QUEUES.events, PAYMENT_QUEUES.recovery]) {
        const options = {
          retryLimit: 5,
          retryDelay: 30,
          retryBackoff: true,
          retryDelayMax: 1800,
          expireInSeconds: 120,
          heartbeatSeconds: 30,
          retentionSeconds: 86400,
          deleteAfterSeconds: 604800,
          deadLetter: PAYMENT_QUEUES.dead,
        };
        await this.boss.createQueue(name, options);
        await this.boss.updateQueue(name, options);
      }
      if (this.stopping) throw new Error('T38 startup interrupted');
      this.accepting = true;
    } catch (error) {
      await this.close();
      throw error;
    }
  }
  async enqueue(tx: Prisma.TransactionClient, eventId: string, id: string) {
    if (!this.accepting || !this.boss || !this.library)
      throw new Error('T38 jobs unavailable');
    const job = await this.boss.send(
      PAYMENT_QUEUES.events,
      { eventId },
      { id, db: this.library.fromPrisma(tx) },
    );
    if (!job) throw new Error('T38 enqueue failed');
  }
  stop(): Promise<void> {
    this.accepting = false;
    return (this.stopping ??= (async () => {
      await this.starting?.catch(() => undefined);
      await this.close();
    })());
  }
  private close(): Promise<void> {
    return (this.closed ??=
      this.boss?.stop({ graceful: true, timeout: 30000 }) ?? Promise.resolve());
  }
  async onModuleDestroy() {
    await this.stop();
  }
}
