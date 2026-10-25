// Applies only to an explicitly selected empty local test database; never resets.
import pg from 'pg';
import { readFile } from 'node:fs/promises';
const url = process.env.GOVERNANCE_MIGRATION_TEST_DATABASE_URL;
if (!url) throw new Error('GOVERNANCE_MIGRATION_TEST_DATABASE_URL is required');
const parsed = new URL(url);
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname)) throw new Error('Refusing non-local/non-test database');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  if (tables.rowCount !== 0) throw new Error('Migration preservation requires an EMPTY disposable database');
  const apply = async (name) => client.query(await readFile(new URL(`../../../packages/prisma/prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8'));
  for (const name of ['20260421015703_init_all_21_tables', '20260424024727_add_password_hash_to_members', '20261024010000_restore_compliance_flags', '20261024010100_savings_transaction_safety']) await apply(name);
  await client.query(`
    INSERT INTO members (member_id,membership_number,first_name,last_name,date_of_birth,phone_number,email,address_line_1,city,postcode,password_hash,updated_at,membership_status)
    VALUES ('legacy-member','legacy','Test','Only','1990-01-01','test','legacy@example.invalid','Test','Test','Test','not-a-login',NOW(),'active'),
           ('legacy-closed','closed','Test','Closed','1990-01-01','test','closed@example.invalid','Test','Test','Test','not-a-login',NOW(),'closed');
    INSERT INTO member_accounts (account_id,member_id,account_type,account_number,current_balance,updated_at) VALUES ('legacy-account','legacy-member','savings_fsa','legacy-account','12.34',NOW());
    INSERT INTO savings_transactions (savings_txn_id,member_id,account_id,amount,transaction_type,status,idempotency_key) VALUES ('legacy-deposit','legacy-member','legacy-account','12.34','deposit','completed','legacy-key');
    INSERT INTO member_shares (share_id,member_id,number_of_shares,share_value,total_share_value) VALUES ('legacy-share','legacy-member',2,'1.23','2.46');
    INSERT INTO groups (group_id,group_name,group_type,updated_at) VALUES ('legacy-group','Legacy circle','community_investment_circle',NOW());
    INSERT INTO group_memberships (group_membership_id,member_id,group_id) VALUES ('legacy-join','legacy-member','legacy-group');
    INSERT INTO audit_logs (audit_id,table_name,record_id,action_type,changed_by,new_value) VALUES ('legacy-audit','group_memberships','legacy-join','insert','legacy-member','legacy snapshot');
  `);
  const snapshot = async () => {
    const rows = [];
    for (const [table, id] of [['members','member_id'], ['member_accounts','account_id'], ['savings_transactions','savings_txn_id'], ['member_shares','share_id'], ['groups','group_id'], ['group_memberships','group_membership_id'], ['audit_logs','audit_id']]) {
      const result = await client.query(`SELECT to_jsonb(t) - 'is_admin' AS row FROM ${table} t ORDER BY ${id}`);
      rows.push(result.rows);
    }
    return JSON.stringify(rows);
  };
  const before = await snapshot();
  await apply('20261025010000_member_admin_authority');
  if (before !== await snapshot()) throw new Error('Existing rows changed');
  const promoted = await client.query('SELECT member_id FROM members WHERE is_admin IS DISTINCT FROM false');
  if (promoted.rowCount !== 0) throw new Error('An existing member was promoted');
  await client.query(`INSERT INTO members (member_id,membership_number,first_name,last_name,date_of_birth,phone_number,email,address_line_1,city,postcode,password_hash,updated_at) VALUES ('new-member','new','Test','New','1990-01-01','test','new@example.invalid','Test','Test','Test','not-a-login',NOW())`);
  const inserted = await client.query("SELECT is_admin FROM members WHERE member_id='new-member'");
  if (inserted.rows[0].is_admin !== false) throw new Error('New member default is not false');
  const definition = await client.query("SELECT is_nullable,column_default FROM information_schema.columns WHERE table_name='members' AND column_name='is_admin'");
  if (definition.rows[0].is_nullable !== 'NO' || definition.rows[0].column_default !== 'false') throw new Error('Unexpected admin constraint/default');
  console.log('PASS: existing member, savings, share, group, membership and audit rows preserved; no member promoted; new admin flag NOT NULL DEFAULT false.');
} finally { await client.end(); }
