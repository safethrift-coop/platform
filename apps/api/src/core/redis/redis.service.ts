import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.client = new Redis({
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
      password: process.env['REDIS_PASSWORD'],
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
    });

    this.client.on('connect', () => this.logger.info('Redis connected'));

    this.client.on('error', (err: Error) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  // Rotation/revocation must only change the exact authenticated session slot.
  async compareAndSwap(
    key: string,
    expected: string,
    replacement: string | null,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.client.eval(
      `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
       if ARGV[2] == '' then redis.call('DEL', KEYS[1])
       else redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) end
       return 1`,
      1,
      key,
      expected,
      replacement ?? '',
      ttlSeconds,
    );
    return result === 1;
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }
}
