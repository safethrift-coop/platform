import { readFile } from 'node:fs/promises';
import { PgBoss, getConstructionPlans } from 'pg-boss';
import pg from 'pg';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Explicit DATABASE_URL is required; no development fallback');
const artifact = await readFile(new URL('../../../packages/prisma/pgboss/12.38.0-install.sql', import.meta.url), 'utf8');
if (artifact !== getConstructionPlans('t36_jobs')) throw new Error('Pinned pg-boss SQL artifact differs from installed package');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query("SELECT to_regclass('t36_jobs.version') AS installed");
  if (!rows[0].installed) await client.query(artifact);
} finally { await client.end(); }
const boss = new PgBoss({ connectionString, schema: 't36_jobs', migrate: false, createSchema: false, supervise: false, schedule: false });
boss.on('error', () => {});
try {
  await boss.start();
  console.log(`Verified pg-boss 12.38.0 schema version ${await boss.schemaVersion()}; no automatic upgrades.`);
} finally { await boss.stop(); }
