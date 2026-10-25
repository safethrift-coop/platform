// Run only against a fresh local disposable test database. Never resets a database.
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const url = process.env.SAVINGS_TEST_DATABASE_URL;
if (!url) throw new Error('SAVINGS_TEST_DATABASE_URL is required');
const parsed = new URL(url);
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname)) throw new Error('Refusing non-local/non-test database');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  if (tables.rowCount !== 0) throw new Error('Migration preservation test requires an EMPTY disposable database');
  const apply = async (name) => client.query(await readFile(new URL(`../../../packages/prisma/prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8'));
  await apply('20260421015703_init_all_21_tables');
  await apply('20260424024727_add_password_hash_to_members');
  const absent = await client.query("SELECT to_regclass('public.compliance_flags') AS table_name");
  if (absent.rows[0].table_name !== null) throw new Error('Historical migrations unexpectedly contain compliance table');
  await client.query(`INSERT INTO members (member_id,membership_number,first_name,last_name,date_of_birth,phone_number,email,address_line_1,city,postcode,password_hash,updated_at) VALUES ('legacy-member','legacy','Test','Only','1990-01-01','test','legacy@example.invalid','Test','Test','Test','not-a-login',NOW());
    INSERT INTO member_accounts (account_id,member_id,account_type,account_number,current_balance,updated_at) VALUES ('legacy-account','legacy-member','savings_fsa','legacy-account','12.34',NOW());
    INSERT INTO savings_transactions (savings_txn_id,member_id,account_id,amount,transaction_type,status,idempotency_key) VALUES ('legacy-deposit','legacy-member','legacy-account','15.67','deposit','completed','legacy-key');
    INSERT INTO withdrawal_transactions (withdrawal_txn_id,member_id,account_id,amount,status,idempotency_key) VALUES ('legacy-withdrawal','legacy-member','legacy-account','3.33','completed','legacy-key');`);
  const snapshot = async (after) => {
    const snapshots = [];
    for (const table of ['members', 'member_accounts', 'savings_transactions', 'withdrawal_transactions']) {
      const result = await client.query(`SELECT to_jsonb(t) ${after ? "- 'is_simulation'" : ''} AS row FROM ${table} t`);
      snapshots.push(result.rows);
    }
    return JSON.stringify(snapshots);
  };
  const before = await snapshot(false);
  await apply('20261024010000_restore_compliance_flags');
  await apply('20261024010100_savings_transaction_safety');
  if (before !== await snapshot(true)) throw new Error('Legacy financial data changed during additive migrations');
  for (const table of ['savings_transactions', 'withdrawal_transactions']) {
    const result = await client.query(`SELECT is_simulation FROM ${table}`);
    if (result.rows[0].is_simulation !== null) throw new Error('Historical simulation status was fabricated');
  }
  await client.query("INSERT INTO compliance_flags (flag_id,member_id,flag_type,description,updated_at) VALUES ('test-flag','legacy-member','manual_flag','Test only',NOW())");
  console.log('PASS: historical compliance gap reproduced; additive migrations preserve members, balances, transaction rows and duplicate legacy keys; simulation labels remain NULL; compliance FK/table usable.');
} finally {
  await client.end();
}
