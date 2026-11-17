#!/usr/bin/env bash
# Explicit synthetic acceptance modes; all require the same namespace boundary.
set -euo pipefail

if [[ ${1-} != --inside ]]; then
  case ${1-} in
    '') task_mode=normal ;;
    --test-failure) task_mode=failure ;;
    --test-interrupt) task_mode=interrupt ;;
    --test-ownership) task_mode=ownership ;;
    --acceptance) task_mode=acceptance ;;
    --regression-t36) task_mode=regression_t36 ;;
    --regression-t38) task_mode=regression_t38 ;;
    --regression-postgres) task_mode=regression_postgres ;;
    *) echo 'Unknown harness mode' >&2; exit 1 ;;
  esac
  if [[ -n ${DATABASE_URL-} || -n ${T24_TEST_DATABASE_URL-} ]] || compgen -A variable PG | grep -q '^PG'; then
    echo 'Refusing externally supplied database configuration' >&2
    exit 1
  fi
  script=$(realpath "$0")
  node_binary=$(realpath "$(command -v node)")
  outer_net=$(readlink /proc/self/ns/net)
  exec bwrap --unshare-net --unshare-pid --die-with-parent --ro-bind / / --proc /proc --dev /dev \
    --tmpfs /tmp --tmpfs /run --chdir "$PWD" \
    --clearenv --setenv PATH /usr/bin:/bin:/usr/lib/postgresql/16/bin --setenv T24_NODE_BINARY "$node_binary" --setenv T24_OUTER_NET "$outer_net" --setenv T24_TEST_MODE "$task_mode" \
    /bin/bash "$script" --inside
fi

if [[ $(id -u) == 0 ]]; then echo 'PostgreSQL must run unprivileged' >&2; exit 1; fi
if [[ -z ${T24_OUTER_NET-} || $(readlink /proc/self/ns/net) == "$T24_OUTER_NET" ]]; then
  echo 'A separate network namespace is required' >&2; exit 1
fi
if ip -o -4 addr show | awk '$2 != "lo" { exit 1 }'; then :; else
  echo 'Unexpected network interface' >&2; exit 1
fi
if ip -o link show | awk -F ': ' '$2 !~ /^lo(@.*)?$/ { exit 1 }'; then :; else
  echo 'Unexpected network interface' >&2; exit 1
fi
if [[ -n $(ip -4 route show) || -n $(ip -6 route show default) ]]; then
  echo 'Unexpected outbound route' >&2; exit 1
fi
python3 - <<'PY'
import errno
import socket
s = socket.socket()
s.settimeout(1)
try:
    s.connect(('203.0.113.1', 443))
except OSError as error:
    if error.errno != errno.ENETUNREACH:
        raise SystemExit(f'Outbound denial was not a network-unreachable error: {error.errno}')
else:
    raise SystemExit('Unexpected outbound connection')
finally:
    s.close()
PY

task_dir=$(mktemp -d /tmp/safethrift-t24-harness.XXXXXXXX)
task_marker=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
printf '%s' "$task_marker" > "$task_dir/owner"
task_sentinel=$(mktemp /tmp/safethrift-t24-sentinel.XXXXXXXX)
printf 'preserve' > "$task_sentinel"
echo "Disposable harness run: $task_marker"
server_started=false
remove_owned_directory() {
  if [[ -f "$task_dir/owner" && $(cat "$task_dir/owner") == "$task_marker" && "$task_dir" == /tmp/safethrift-t24-harness.* ]]; then
    rm -rf -- "$task_dir"
    if [[ -e "$task_dir" ]]; then echo 'Owned directory cleanup failed' >&2; return 1; fi
    if [[ ! -f "$task_sentinel" || $(cat "$task_sentinel") != preserve ]]; then echo 'Cleanup affected a sibling fixture' >&2; return 1; fi
    rm -- "$task_sentinel"
    echo 'PASS: owned PostgreSQL process stopped and owned temporary directory removed.'
  else
    echo 'Refusing to remove an unowned directory' >&2
    return 1
  fi
}
cleanup() {
  if [[ $server_started == true ]]; then
    pg_ctl -D "$task_dir/data" -m fast -w stop >/dev/null || { echo 'PostgreSQL cleanup failed' >&2; return 1; }
    if pg_ctl -D "$task_dir/data" status >/dev/null 2>&1; then echo 'PostgreSQL still running' >&2; return 1; fi
    server_started=false
  fi
  remove_owned_directory
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

task_password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
task_admin_password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
task_migration_password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
task_regression_password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
task_database="safethrift_${task_marker}_test"
task_fresh_database="safethrift_${task_marker}_fresh_test"
task_regression_database="safethrift_${task_marker}_regression_test"
if [[ ${T24_TEST_MODE-} == regression_t38 ]]; then task_regression_database="safethrift_t38_recovery_${task_marker}_test"; fi
printf '%s\n' "$task_admin_password" > "$task_dir/admin-password"
initdb -D "$task_dir/data" --no-locale --auth-local=scram-sha-256 --auth-host=scram-sha-256 --pwfile="$task_dir/admin-password" > /dev/null
rm -- "$task_dir/admin-password"
server_started=true
pg_ctl -D "$task_dir/data" -l "$task_dir/postgres.log" -o "-h 127.0.0.1 -p 55439 -k $task_dir" -w start >/dev/null
pg_isready -h 127.0.0.1 -p 55439 >/dev/null
PGPASSWORD="$task_admin_password" psql -X -q -v ON_ERROR_STOP=1 -h "$task_dir" -p 55439 -d postgres <<SQL
CREATE ROLE t24_test LOGIN PASSWORD '$task_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE t24_migrator LOGIN PASSWORD '$task_migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
CREATE DATABASE "$task_database" OWNER t24_migrator;
REVOKE CONNECT ON DATABASE "$task_database" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$task_database" TO t24_test;
CREATE DATABASE "$task_fresh_database" OWNER t24_migrator;
REVOKE CONNECT ON DATABASE "$task_fresh_database" FROM PUBLIC;
SQL
if [[ ${T24_TEST_MODE-} == regression_* ]]; then
  PGPASSWORD="$task_admin_password" psql -X -q -v ON_ERROR_STOP=1 -h "$task_dir" -p 55439 -d postgres <<SQL
CREATE ROLE t24_regression LOGIN PASSWORD '$task_regression_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE "$task_regression_database" OWNER t24_regression;
REVOKE CONNECT ON DATABASE "$task_regression_database" FROM PUBLIC;
SQL
  if [[ ${T24_TEST_MODE-} == regression_t36 || ${T24_TEST_MODE-} == regression_t38 ]]; then
    PGPASSWORD="$task_admin_password" psql -X -q -v ON_ERROR_STOP=1 -h "$task_dir" -p 55439 -d postgres -c 'GRANT SET ON PARAMETER session_replication_role TO t24_regression'
  fi
fi
unset task_admin_password
task_migration_count=0
for task_migration in packages/prisma/prisma/migrations/*/migration.sql; do
  PGPASSWORD="$task_migration_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_fresh_database" -f "$task_migration"
  task_migration_count=$((task_migration_count + 1))
done
task_fresh_rows=$(PGPASSWORD="$task_migration_password" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_fresh_database" -c 'SELECT (SELECT count(*) FROM members) + (SELECT count(*) FROM kyc_verification) + (SELECT count(*) FROM kyc_synthetic_attempts) + (SELECT count(*) FROM kyc_synthetic_events) + (SELECT count(*) FROM audit_logs) + (SELECT count(*) FROM member_accounts) + (SELECT count(*) FROM savings_transactions) + (SELECT count(*) FROM loan_applications) + (SELECT count(*) FROM loans) + (SELECT count(*) FROM repayment_transactions)')
if [[ "$task_fresh_rows" != 0 ]]; then echo 'Fresh migration fabricated rows' >&2; exit 1; fi
echo "PASS: fresh empty disposable database applied $task_migration_count migrations with zero member, KYC, event, audit or financial rows."
for task_migration in packages/prisma/prisma/migrations/*/migration.sql; do
  if [[ "$task_migration" == *20261105010000_t24_synthetic_kyc* ]]; then
    PGPASSWORD="$task_migration_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" <<'SQL'
INSERT INTO members (member_id,membership_number,first_name,last_name,date_of_birth,phone_number,email,address_line_1,city,postcode,password_hash,updated_at) VALUES ('t24-historical-member','t24-historical-member','Synthetic','Historical','1990-01-01','test','historical@example.invalid','test','test','test','test',CURRENT_TIMESTAMP);
INSERT INTO kyc_verification (kyc_id,member_id,document_type,verification_status,updated_at) VALUES ('t24-historical-kyc','t24-historical-member','passport','verified',CURRENT_TIMESTAMP);
INSERT INTO audit_logs (audit_id,table_name,record_id,action_type,changed_by) VALUES ('t24-historical-audit','kyc_verification','t24-historical-kyc','insert','t24-historical-member');
INSERT INTO member_accounts (account_id,member_id,account_type,account_number,current_balance,updated_at) VALUES ('t24-historical-account','t24-historical-member','savings_fsa','t24-historical-account',12.34,CURRENT_TIMESTAMP);
INSERT INTO savings_transactions (savings_txn_id,member_id,account_id,amount,transaction_type,status) VALUES ('t24-historical-savings','t24-historical-member','t24-historical-account',12.34,'deposit','completed');
SQL
    task_snapshot=$(PGPASSWORD="$task_migration_password" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -c "SELECT jsonb_build_array((SELECT to_jsonb(t) FROM members t WHERE member_id='t24-historical-member'),(SELECT to_jsonb(t) FROM kyc_verification t WHERE kyc_id='t24-historical-kyc'),(SELECT to_jsonb(t) FROM audit_logs t WHERE audit_id='t24-historical-audit'),(SELECT to_jsonb(t) FROM member_accounts t WHERE account_id='t24-historical-account'),(SELECT to_jsonb(t) FROM savings_transactions t WHERE savings_txn_id='t24-historical-savings'))::text")
    task_constraints=$(PGPASSWORD="$task_migration_password" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -c "SELECT md5(string_agg(conrelid::regclass::text || conname || pg_get_constraintdef(oid), ',' ORDER BY conrelid::regclass::text, conname)) FROM pg_constraint WHERE conrelid IN ('members'::regclass,'kyc_verification'::regclass,'audit_logs'::regclass,'member_accounts'::regclass,'savings_transactions'::regclass)")
  fi
  PGPASSWORD="$task_migration_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -f "$task_migration"
done
task_after=$(PGPASSWORD="$task_migration_password" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -c "SELECT jsonb_build_array((SELECT to_jsonb(t) FROM members t WHERE member_id='t24-historical-member'),(SELECT to_jsonb(t) FROM kyc_verification t WHERE kyc_id='t24-historical-kyc'),(SELECT to_jsonb(t) FROM audit_logs t WHERE audit_id='t24-historical-audit'),(SELECT to_jsonb(t) FROM member_accounts t WHERE account_id='t24-historical-account'),(SELECT to_jsonb(t) FROM savings_transactions t WHERE savings_txn_id='t24-historical-savings'))::text")
task_constraints_after=$(PGPASSWORD="$task_migration_password" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -c "SELECT md5(string_agg(conrelid::regclass::text || conname || pg_get_constraintdef(oid), ',' ORDER BY conrelid::regclass::text, conname)) FROM pg_constraint WHERE conrelid IN ('members'::regclass,'kyc_verification'::regclass,'audit_logs'::regclass,'member_accounts'::regclass,'savings_transactions'::regclass)")
if [[ -z ${task_snapshot-} || "$task_snapshot" != "$task_after" || "$task_constraints" != "$task_constraints_after" ]]; then echo 'Historical preservation failed' >&2; exit 1; fi
task_inferred=$(PGPASSWORD="$task_migration_password" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -c 'SELECT (SELECT count(*) FROM kyc_synthetic_attempts) + (SELECT count(*) FROM kyc_synthetic_events)')
if [[ "$task_inferred" != 0 ]]; then echo 'Historical synthetic provenance was inferred' >&2; exit 1; fi
PGPASSWORD="$task_migration_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -f apps/api/test/t24-migration-constraints.sql
echo 'PASS: historical member, KYC, audit, account and savings fixtures and existing table constraints preserved; T24 constraint script passed.'
financial_snapshot() {
  for task_table in member_accounts savings_transactions withdrawal_transactions income_records loan_applications loans repayment_schedule repayment_transactions member_shares; do
    PGPASSWORD="$task_migration_password" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -c "SELECT '$task_table', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text FROM $task_table t"
  done
}
task_financial_snapshot=$(financial_snapshot)
PGPASSWORD="$task_migration_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" <<'SQL'
GRANT USAGE ON SCHEMA public TO t24_test;
GRANT SELECT, INSERT, UPDATE ON members, kyc_verification, kyc_synthetic_attempts, kyc_synthetic_events TO t24_test;
GRANT SELECT, INSERT ON audit_logs TO t24_test;
CREATE TABLE t24_harness_identity (marker text NOT NULL);
GRANT SELECT ON t24_harness_identity TO t24_test;
CREATE TABLE t24_audit_failure (verification_id text PRIMARY KEY);
GRANT SELECT, INSERT, DELETE ON t24_audit_failure TO t24_test;
CREATE FUNCTION t24_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM t24_audit_failure WHERE verification_id = NEW.record_id) THEN
    RAISE EXCEPTION 'synthetic audit failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t24_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION t24_reject_audit();
CREATE TABLE t24_event_failure (event_id text PRIMARY KEY);
GRANT SELECT, INSERT, DELETE ON t24_event_failure TO t24_test;
CREATE FUNCTION t24_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM t24_event_failure WHERE event_id = NEW.event_id) THEN
    RAISE EXCEPTION 'synthetic event persistence failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t24_reject_event BEFORE INSERT ON kyc_synthetic_events FOR EACH ROW EXECUTE FUNCTION t24_reject_event();
SQL
PGPASSWORD="$task_migration_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -c "INSERT INTO t24_harness_identity VALUES ('$task_marker')"
export PGPASSWORD="$task_password"
psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_test -d "$task_database" -c 'SELECT current_database(), current_user' >/dev/null
if psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_test -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'Test role can access another database' >&2; exit 1
fi
if psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_test -d "$task_fresh_database" -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'Test role can access the separate fresh database' >&2; exit 1
fi
if psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_test -d "$task_database" -c 'CREATE DATABASE t24_forbidden' >/dev/null 2>&1; then
  echo 'Test role can create databases' >&2; exit 1
fi
if psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_test -d "$task_database" -c 'CREATE TABLE t24_forbidden (id integer)' >/dev/null 2>&1; then
  echo 'Test role can create schema objects' >&2; exit 1
fi
unset PGPASSWORD
task_url="postgresql://t24_test:${task_password}@127.0.0.1:55439/${task_database}"
task_root=$PWD
bwrap --unshare-pid --die-with-parent --ro-bind /usr /usr --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
  --dev /dev --tmpfs /tmp --dir /opt \
  --ro-bind "$T24_NODE_BINARY" /opt/node \
  --ro-bind "$task_root/node_modules" "$task_root/node_modules" \
  --ro-bind "$task_root/apps/api/node_modules" "$task_root/apps/api/node_modules" \
  --clearenv --setenv T24_APP_URL "$task_url" --setenv T24_PRIVATE_PATH "$task_dir" \
  --setenv NODE_PATH "$task_root/apps/api/node_modules" \
  -- /opt/node -e '
    const fs = require("fs");
    const net = require("net");
    const { Client } = require("pg");
    (async () => {
      if (fs.existsSync(process.env.T24_PRIVATE_PATH) || fs.existsSync("/run") || fs.existsSync("/proc") || fs.existsSync("/home/princewill/.aws") || fs.existsSync("/home/princewill/.nvm")) throw Error("private path visible");
      if (Object.keys(process.env).some(k => /ADMIN|MIGRAT|PGPASSWORD/.test(k))) throw Error("privileged environment visible");
      const client = new Client({ connectionString: process.env.T24_APP_URL });
      await client.connect();
      const { rows } = await client.query("SELECT current_user, rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user");
      if (rows.length !== 1 || rows[0].current_user !== "t24_test" || rows[0].rolsuper || rows[0].rolcreatedb) throw Error("unexpected database privilege");
      await client.end();
      await new Promise((resolve, reject) => {
        const socket = net.connect({ host: "203.0.113.1", port: 443 });
        socket.setTimeout(1000, () => { socket.destroy(); reject(Error("network timeout")); });
        socket.on("connect", () => { socket.destroy(); reject(Error("outbound network reachable")); });
        socket.on("error", error => error.code === "ENETUNREACH" ? resolve() : reject(error));
      });
      console.log("PASS: restricted Node probe cannot see the private cluster and can use only its limited loopback database connection.");
    })().catch(error => { console.error(error.message); process.exitCode = 1; });
  '
echo 'PASS: disposable PostgreSQL lifecycle, dedicated non-superuser role, cross-database denial, and no non-loopback network routes.'
if [[ ${T24_TEST_MODE-} == failure ]]; then echo 'Injected failure'; exit 71; fi
if [[ ${T24_TEST_MODE-} == interrupt ]]; then echo 'Injected interruption'; kill -TERM $$; fi
if [[ ${T24_TEST_MODE-} == ownership ]]; then
  printf '%s' 'deliberately-unowned-test-marker' > "$task_dir/owner"
  if remove_owned_directory; then echo 'Unowned teardown was accepted' >&2; exit 1; fi
  if [[ ! -d "$task_dir/data" || ! -f "$task_sentinel" || $(cat "$task_sentinel") != preserve ]]; then echo 'Ownership refusal affected fixtures' >&2; exit 1; fi
  printf '%s' "$task_marker" > "$task_dir/owner"
  echo 'PASS: teardown refused a mismatched ownership marker and preserved both the cluster and its sibling fixture.'
  exit 0
fi
if [[ ${T24_TEST_MODE-} == regression_* ]]; then
  for task_migration in packages/prisma/prisma/migrations/*/migration.sql; do
    PGPASSWORD="$task_regression_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_regression -d "$task_regression_database" -f "$task_migration"
  done
  if [[ $T24_TEST_MODE == regression_postgres ]]; then
    for task_queue_sql in packages/prisma/pgboss/12.38.0-install.sql packages/prisma/pgboss/12.38.0-payment-install.sql; do
      PGPASSWORD="$task_regression_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_regression -d "$task_regression_database" -f "$task_queue_sql"
    done
    PGPASSWORD="$task_regression_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_regression -d "$task_regression_database" -c "CREATE TABLE t24_harness_identity (marker text NOT NULL); INSERT INTO t24_harness_identity VALUES ('$task_marker')"
    task_regression_url="postgresql://t24_regression:${task_regression_password}@127.0.0.1:55439/${task_regression_database}"
    unset task_regression_password
    echo 'SESSION FIXTURE: explicit in-memory sessions; no Redis service; PostgreSQL and both pg-boss schemas are real.'
    bwrap --unshare-pid --die-with-parent --ro-bind /usr /usr --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
      --dev /dev --tmpfs /tmp --dir /opt --ro-bind "$T24_NODE_BINARY" /opt/node \
      --ro-bind "$task_root/node_modules" "$task_root/node_modules" \
      --ro-bind "$task_root/apps/api/node_modules" "$task_root/apps/api/node_modules" \
      --ro-bind "$task_root/apps/api/src" "$task_root/apps/api/src" \
      --ro-bind "$task_root/apps/api/test/fixtures/t24-memory-session.ts" "$task_root/apps/api/test/fixtures/t24-memory-session.ts" \
      --ro-bind "$task_root/apps/api/test/governance.integration.e2e-spec.ts" "$task_root/apps/api/test/governance.integration.e2e-spec.ts" \
      --ro-bind "$task_root/apps/api/test/registration.integration.e2e-spec.ts" "$task_root/apps/api/test/registration.integration.e2e-spec.ts" \
      --ro-bind "$task_root/apps/api/test/dashboard.integration.e2e-spec.ts" "$task_root/apps/api/test/dashboard.integration.e2e-spec.ts" \
      --ro-bind "$task_root/apps/api/test/loans.integration.e2e-spec.ts" "$task_root/apps/api/test/loans.integration.e2e-spec.ts" \
      --ro-bind "$task_root/apps/api/test/jest-e2e.json" "$task_root/apps/api/test/jest-e2e.json" \
      --ro-bind "$task_root/apps/api/tsconfig.json" "$task_root/apps/api/tsconfig.json" \
      --ro-bind "$task_root/apps/api/package.json" "$task_root/apps/api/package.json" \
      --ro-bind "$task_root/package.json" "$task_root/package.json" \
      --chdir "$task_root/apps/api" --clearenv --setenv PATH /usr/bin:/bin --setenv HOME /tmp \
      --setenv NODE_ENV test --setenv T24_HARNESS_MARKER "$task_marker" --setenv T24_PRIVATE_PATH "$task_dir" \
      --setenv T24_SESSION_BACKEND memory --setenv AUTH_TEST_REDIS_URL redis://127.0.0.1:1 \
      --setenv T24_REGRESSION_DATABASE_URL "$task_regression_url" \
      --setenv GOVERNANCE_TEST_DATABASE_URL "$task_regression_url" --setenv T40_TEST_DATABASE_URL "$task_regression_url" \
      --setenv T41_TEST_DATABASE_URL "$task_regression_url" --setenv T42_TEST_DATABASE_URL "$task_regression_url" \
      -- /opt/node "$task_root/apps/api/node_modules/jest/bin/jest.js" --config ./test/jest-e2e.json --runInBand \
      --setupFilesAfterEnv "$task_root/apps/api/test/fixtures/t24-memory-session.ts" --runTestsByPath \
      test/governance.integration.e2e-spec.ts test/registration.integration.e2e-spec.ts test/dashboard.integration.e2e-spec.ts test/loans.integration.e2e-spec.ts
    exit $?
  fi
  if [[ $T24_TEST_MODE == regression_t36 ]]; then
    task_queue_sql=packages/prisma/pgboss/12.38.0-install.sql
    task_test_file=reminders.integration.test.mjs
    task_test_env=T36_TEST_DATABASE_URL
  else
    task_queue_sql=packages/prisma/pgboss/12.38.0-payment-install.sql
    task_test_file=payment-webhooks.integration.test.mjs
    task_test_env=T38_TEST_DATABASE_URL
  fi
  PGPASSWORD="$task_regression_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_regression -d "$task_regression_database" -f "$task_queue_sql"
  task_regression_url="postgresql://t24_regression:${task_regression_password}@127.0.0.1:55439/${task_regression_database}"
  unset task_regression_password
  "$T24_NODE_BINARY" "$task_root/apps/api/node_modules/typescript/bin/tsc" --project "$task_root/apps/api/tsconfig.build.json" --outDir "$task_dir/dist" --tsBuildInfoFile "$task_dir/build.tsbuildinfo"
  echo 'PASS: regression JavaScript compiled from current source into the private harness directory; workspace dist preserved.'
  bwrap --unshare-pid --die-with-parent --ro-bind /usr /usr --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
    --dev /dev --tmpfs /tmp --dir /opt --ro-bind "$T24_NODE_BINARY" /opt/node \
    --ro-bind "$task_root/node_modules" "$task_root/node_modules" \
    --ro-bind "$task_root/apps/api/node_modules" "$task_root/apps/api/node_modules" \
    --ro-bind "$task_dir/dist" "$task_root/apps/api/dist" \
    --ro-bind "$task_root/apps/api/test/$task_test_file" "$task_root/apps/api/test/$task_test_file" \
    --ro-bind "$task_root/apps/api/test/fixtures/t36-crash-worker.mjs" "$task_root/apps/api/test/fixtures/t36-crash-worker.mjs" \
    --ro-bind "$task_root/apps/api/test/fixtures/t36-sms-crash-worker.mjs" "$task_root/apps/api/test/fixtures/t36-sms-crash-worker.mjs" \
    --ro-bind "$task_root/apps/api/package.json" "$task_root/apps/api/package.json" \
    --chdir "$task_root/apps/api" --clearenv --setenv PATH /usr/bin:/bin --setenv HOME /tmp \
    --setenv NODE_ENV test --setenv T36_TEST_DATABASE_DISPOSABLE true --setenv "$task_test_env" "$task_regression_url" \
    -- /opt/node --test "test/$task_test_file"
  exit $?
fi
if [[ ${T24_TEST_MODE-} == acceptance ]]; then
  bwrap --unshare-pid --die-with-parent --ro-bind /usr /usr --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
    --dev /dev --tmpfs /tmp --dir /opt --ro-bind "$T24_NODE_BINARY" /opt/node \
    --ro-bind "$task_root/node_modules" "$task_root/node_modules" \
    --ro-bind "$task_root/apps/api/node_modules" "$task_root/apps/api/node_modules" \
    --ro-bind "$task_root/apps/api/src" "$task_root/apps/api/src" \
    --ro-bind "$task_root/apps/api/test/fixtures/t24-synthetic-provider.ts" "$task_root/apps/api/test/fixtures/t24-synthetic-provider.ts" \
    --ro-bind "$task_root/apps/api/test/fixtures/t24-synthetic-webhook.ts" "$task_root/apps/api/test/fixtures/t24-synthetic-webhook.ts" \
    --ro-bind "$task_root/apps/api/test/fixtures/t24-kyc-test.module.ts" "$task_root/apps/api/test/fixtures/t24-kyc-test.module.ts" \
    --ro-bind "$task_root/apps/api/test/fixtures/t24-assert-isolation.ts" "$task_root/apps/api/test/fixtures/t24-assert-isolation.ts" \
    --ro-bind "$task_root/apps/api/test/fixtures/t24-crash-worker.ts" "$task_root/apps/api/test/fixtures/t24-crash-worker.ts" \
    --ro-bind "$task_root/apps/api/test/fixtures/t24-memory-session.ts" "$task_root/apps/api/test/fixtures/t24-memory-session.ts" \
    --ro-bind "$task_root/apps/api/test/t24-kyc.integration.e2e-spec.ts" "$task_root/apps/api/test/t24-kyc.integration.e2e-spec.ts" \
    --ro-bind "$task_root/apps/api/test/kyc-provider.e2e-spec.ts" "$task_root/apps/api/test/kyc-provider.e2e-spec.ts" \
    --ro-bind "$task_root/apps/api/test/t24-synthetic-webhook.e2e-spec.ts" "$task_root/apps/api/test/t24-synthetic-webhook.e2e-spec.ts" \
    --ro-bind "$task_root/apps/api/test/t24-module-wiring.e2e-spec.ts" "$task_root/apps/api/test/t24-module-wiring.e2e-spec.ts" \
    --ro-bind "$task_root/apps/api/test/jest-e2e.json" "$task_root/apps/api/test/jest-e2e.json" \
    --ro-bind "$task_root/apps/api/test/jest-t24-e2e.cjs" "$task_root/apps/api/test/jest-t24-e2e.cjs" \
    --ro-bind "$task_root/apps/api/tsconfig.json" "$task_root/apps/api/tsconfig.json" \
    --ro-bind "$task_root/apps/api/package.json" "$task_root/apps/api/package.json" \
    --ro-bind "$task_root/package.json" "$task_root/package.json" \
    --chdir "$task_root/apps/api" --clearenv --setenv PATH /usr/bin:/bin \
    --setenv NODE_ENV test --setenv HOME /tmp --setenv T24_TEST_DATABASE_URL "$task_url" \
    --setenv T24_HARNESS_MARKER "$task_marker" --setenv T24_PRIVATE_PATH "$task_dir" \
    --setenv T24_SESSION_BACKEND memory \
    -- /opt/node "$task_root/apps/api/node_modules/jest/bin/jest.js" --config ./test/jest-t24-e2e.cjs --runInBand --detectOpenHandles \
    --setupFilesAfterEnv "$task_root/apps/api/test/fixtures/t24-memory-session.ts" --runTestsByPath \
    test/t24-kyc.integration.e2e-spec.ts test/kyc-provider.e2e-spec.ts test/t24-synthetic-webhook.e2e-spec.ts test/t24-module-wiring.e2e-spec.ts
  if [[ $(financial_snapshot) != "$task_financial_snapshot" ]]; then echo 'Financial rows changed during T24 acceptance' >&2; exit 1; fi
  task_final_history=$(PGPASSWORD="$task_migration_password" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -c "SELECT jsonb_build_array((SELECT to_jsonb(t) FROM members t WHERE member_id='t24-historical-member'),(SELECT to_jsonb(t) FROM kyc_verification t WHERE kyc_id='t24-historical-kyc'),(SELECT to_jsonb(t) FROM audit_logs t WHERE audit_id='t24-historical-audit'),(SELECT to_jsonb(t) FROM member_accounts t WHERE account_id='t24-historical-account'),(SELECT to_jsonb(t) FROM savings_transactions t WHERE savings_txn_id='t24-historical-savings'))::text")
  if [[ "$task_final_history" != "$task_snapshot" ]]; then echo 'Historical rows changed during T24 acceptance' >&2; exit 1; fi
  echo 'PASS: all nine financial-table snapshots and historical member/KYC/audit/account/savings rows are unchanged after HTTP acceptance.'
  PGPASSWORD="$task_migration_password" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" -f apps/api/test/t24-persistent-inspection.sql
  PGPASSWORD="$task_migration_password" pg_dump -h 127.0.0.1 -p 55439 -U t24_migrator -d "$task_database" --data-only --no-owner --no-privileges -f "$task_dir/persistent-data.sql"
  python3 apps/api/test/t24-inspect-persistence.py "$task_dir"
  unset task_migration_password
  exit $?
fi
echo 'Security preflight completed. Explicit acceptance and regression modes retain the same isolation boundary.'
