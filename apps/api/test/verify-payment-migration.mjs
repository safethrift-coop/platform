import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const url = process.env.T38_MIGRATION_TEST_DATABASE_URL;
if (!url) throw new Error('Explicit T38_MIGRATION_TEST_DATABASE_URL required');
const parsed = new URL(url);
if (
  process.env.NODE_ENV !== 'test' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname)
)
  throw new Error('Refusing nonlocal/non-test database');
const baseline = spawnSync(
  process.execPath,
  [new URL('./verify-reminder-migration.mjs', import.meta.url).pathname],
  {
    env: { ...process.env, T36_MIGRATION_TEST_DATABASE_URL: url },
    stdio: 'inherit',
  },
);
if (baseline.status !== 0) throw new Error('Historical baseline failed');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  async function snapshot() {
    const result = [];
    for (const { tablename } of tables) {
      if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected table');
      result.push([
        tablename,
        (
          await client.query(
            `SELECT to_jsonb(t) AS row FROM ${tablename} t ORDER BY to_jsonb(t)::text`,
          )
        ).rows,
      ]);
    }
    return JSON.stringify(result);
  }
  const before = await snapshot();
  await client.query(
    await readFile(
      new URL(
        '../../../packages/prisma/prisma/migrations/20261026010000_payment_webhook_evidence/migration.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  if ((await snapshot()) !== before) throw new Error('Historical rows changed');
  for (const table of [
    'payment_webhook_deliveries',
    'payment_webhook_events',
    'payment_observations',
    'mandate_observations',
  ])
    if (
      (await client.query(`SELECT count(*)::int AS count FROM ${table}`))
        .rows[0].count !== 0
    )
      throw new Error('Historical payment evidence fabricated');
  console.log(
    'PASS: T38 preserves every historical public table including T25/T36/T37 data and creates no inferred payment evidence.',
  );
} finally {
  await client.end();
}
