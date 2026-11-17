import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import { PrismaService } from '../src/core/database/prisma.service';
import { JwtStrategy } from '../src/core/strategies/jwt.strategy';
import { SyntheticKycProvider } from './fixtures/t24-synthetic-provider';
import { SyntheticWebhookVerifier } from './fixtures/t24-synthetic-webhook';
import {
  SyntheticKycService,
  SyntheticKycTestModule,
  SyntheticWebhookService,
} from './fixtures/t24-kyc-test.module';

describe('T24 test-only module wiring', () => {
  it('rejects non-test execution and nonlocal database selection', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.DATABASE_URL;
    const makeConfig = (url: string) => ({
      pool: { options: { connectionString: url } } as unknown as Pool,
      fixtureIds: new Set<string>(),
      provider: new SyntheticKycProvider(),
      verifier: new SyntheticWebhookVerifier(Buffer.alloc(32, 1)),
    });
    try {
      process.env.NODE_ENV = 'production';
      expect(() =>
        SyntheticKycTestModule.register(
          makeConfig('postgresql://fixture@127.0.0.1/safethrift_wiring_test'),
        ),
      ).toThrow('test-only');
      process.env.NODE_ENV = 'test';
      const remote =
        'postgresql://fixture@example.invalid/safethrift_wiring_test';
      process.env.DATABASE_URL = remote;
      expect(() => SyntheticKycTestModule.register(makeConfig(remote))).toThrow(
        'local test database',
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }
  });

  it('registers separate submission and webhook services without connecting to a database', async () => {
    const original = process.env.DATABASE_URL;
    const url = 'postgresql://fixture@127.0.0.1:55441/safethrift_wiring_test';
    process.env.DATABASE_URL = url;
    try {
      const pool = { options: { connectionString: url } } as unknown as Pool;
      const module = await Test.createTestingModule({
        imports: [
          SyntheticKycTestModule.register({
            pool,
            fixtureIds: new Set(),
            provider: new SyntheticKycProvider(),
            verifier: new SyntheticWebhookVerifier(Buffer.alloc(32, 1)),
          }),
        ],
      })
        .overrideProvider(PrismaService)
        .useValue({})
        .overrideProvider(JwtStrategy)
        .useValue({})
        .compile();
      expect(module.get(SyntheticKycService)).toBeInstanceOf(
        SyntheticKycService,
      );
      expect(module.get(SyntheticWebhookService)).toBeInstanceOf(
        SyntheticWebhookService,
      );
      expect(module.get(SyntheticWebhookService)).not.toBe(
        module.get(SyntheticKycService),
      );
      await module.close();
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
