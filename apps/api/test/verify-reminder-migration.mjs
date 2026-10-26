import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const url = process.env.T36_MIGRATION_TEST_DATABASE_URL;
if (!url) throw new Error('Explicit T36_MIGRATION_TEST_DATABASE_URL required');
const parsed = new URL(url);
if (process.env.NODE_ENV !== 'test' || !['localhost','127.0.0.1','[::1]'].includes(parsed.hostname) || !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname)) throw new Error('Refusing nonlocal/non-test database');
// The existing preservation check refuses a nonempty database and builds legacy
// members/savings/shares/groups/audits, then applies T37. No reset is performed.
const baseline = spawnSync(process.execPath, [new URL('./verify-governance-migration.mjs', import.meta.url).pathname], {
  env: { ...process.env, GOVERNANCE_MIGRATION_TEST_DATABASE_URL: url }, stdio: 'inherit',
});
if (baseline.status !== 0) throw new Error('Historical baseline verification failed');
const client = new pg.Client({ connectionString: url }); await client.connect();
try {
  await client.query(`INSERT INTO reminder_logs (reminder_id,member_id,reminder_type,reminder_channel,sent_date,delivery_status) VALUES
    ('historical-sent','legacy-member','late_payment','email','2026-01-02 08:00:00','sent'),
    ('historical-queued','legacy-member','late_payment','email','2026-01-03 08:00:00','queued');`);
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const newColumns = ['repayment_schedule_id','scan_date','queued_at','first_attempt_at','delivered_at','payload','job_id','provider_key','last_error','attempt_token','transport','provider_event_at','provider_event_type'];
  async function snapshot(after = false) {
    const all = [];
    for (const { tablename } of tables) {
      if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected table');
      const { rows } = await client.query(`SELECT to_jsonb(t) ${after && tablename === 'reminder_logs' ? '- $1::text[]' : ''} AS row FROM ${tablename} t ORDER BY to_jsonb(t)::text`, after && tablename === 'reminder_logs' ? [newColumns] : []);
      // Sorting after removing columns makes comparison independent of JSON key order.
      all.push([tablename, rows.map(r => JSON.stringify(r.row)).sort()]);
    }
    return JSON.stringify(all);
  }
  const before = await snapshot();
  const migration = await readFile(new URL('../../../packages/prisma/prisma/migrations/20261025020000_reminder_delivery/migration.sql', import.meta.url), 'utf8');
  await client.query(migration);
  if (before !== await snapshot(true)) throw new Error('Historical rows, balances, audit or reminder timestamps changed');
  const logs = await client.query('SELECT repayment_schedule_id,job_id,payload FROM reminder_logs');
  if (logs.rows.some(r => r.repayment_schedule_id || r.job_id || r.payload)) throw new Error('Historical delivery evidence fabricated');
  await client.query("INSERT INTO reminder_logs (reminder_id,member_id,reminder_type,reminder_channel) VALUES ('new-queued','legacy-member','general_notice','email')");
  const queued = await client.query("SELECT sent_date FROM reminder_logs WHERE reminder_id='new-queued'");
  if (queued.rows[0].sent_date !== null) throw new Error('New queued reminder has a sent timestamp');
  await client.query(`INSERT INTO loan_applications (application_id,member_id,requested_amount,loan_purpose,requested_term_months,updated_at) VALUES ('test-application','legacy-member',50,'Migration test',1,NOW());
    INSERT INTO loans (loan_id,member_id,application_id,loan_account_id,principal_amount,term_months,installment_amount,maturity_date,updated_at) VALUES ('test-loan','legacy-member','test-application','legacy-account',50,1,50,'2027-01-01',NOW());
    INSERT INTO repayment_schedule (schedule_id,loan_id,installment_number,due_date,principal_due,total_due) VALUES ('test-installment','test-loan',1,'2026-01-01',50,50);
    INSERT INTO reminder_logs (reminder_id,member_id,related_loan_id,repayment_schedule_id,reminder_type,reminder_channel) VALUES ('initial','legacy-member','test-loan','test-installment','late_payment','email');`);
  const duplicate = await client.query("INSERT INTO reminder_logs (reminder_id,member_id,repayment_schedule_id,reminder_type,reminder_channel) VALUES ('duplicate','legacy-member','test-installment','late_payment','email') ON CONFLICT DO NOTHING RETURNING reminder_id");
  if (duplicate.rowCount !== 0) throw new Error('Initial-reminder uniqueness not enforced');
  const attempts = await client.query('SELECT COUNT(*)::int AS count FROM reminder_attempts');
  if (attempts.rows[0].count !== 0) throw new Error('Historical attempts fabricated');
  console.log('PASS: all historical tables/audits/reminder timestamps preserved; new queued sent_date NULL; initial reminder uniqueness enforced without any queue schema.');
} finally { await client.end(); }
