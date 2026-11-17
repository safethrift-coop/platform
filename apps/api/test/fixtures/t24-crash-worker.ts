import 'reflect-metadata';
import { Pool } from 'pg';
import { SyntheticKycService } from './t24-kyc-test.module';
import { SyntheticKycProvider } from './t24-synthetic-provider';
import { SyntheticWebhookVerifier } from './t24-synthetic-webhook';
import { assertT24Isolation } from './t24-assert-isolation';

async function main(): Promise<void> {
  const member = process.env.T24_CRASH_MEMBER;
  const point = process.env.T24_CRASH_POINT;
  if (
    !member ||
    !['before_provider', 'after_provider'].includes(point ?? '') ||
    !process.send
  )
    throw new Error('Explicit isolated crash fixture required');
  const pool = new Pool({
    connectionString: process.env.T24_TEST_DATABASE_URL,
  });
  await assertT24Isolation(pool);
  const provider = new SyntheticKycProvider();
  const initiate = provider.initiate.bind(provider);
  provider.initiate = async (correlationId) => {
    // submit() committed its initial transaction before calling this method.
    if (point === 'after_provider') await initiate(correlationId);
    process.send!({ point, correlationId });
    // The parent terminates this process at the nominated interruption point.
    // Keep the event loop alive without returning an initiation outcome.
    return new Promise(() => {
      setInterval(() => {}, 1000);
    });
  };
  const service = new SyntheticKycService({
    pool,
    fixtureIds: new Set([member]),
    provider,
    verifier: new SyntheticWebhookVerifier(Buffer.alloc(32, 1)),
  });
  await service.submit(member, `crash-${point}`);
  throw new Error('Crash fixture unexpectedly completed');
}

void main().catch((error: unknown) => {
  // Report no database URL, raw payload, signature or credential.
  process.send?.({
    error: error instanceof Error ? error.message : 'Crash fixture failed',
  });
  process.exitCode = 1;
});
