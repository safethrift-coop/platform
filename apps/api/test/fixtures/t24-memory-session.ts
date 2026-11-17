import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { RedisService } from '../../src/core/redis/redis.service';
import { Pool } from 'pg';

// An explicit session fixture for PostgreSQL regressions. This does not test
// Redis, start a Redis server, or change either pg-boss queue implementation.
if (
  process.env.T24_SESSION_BACKEND !== 'memory' ||
  process.env.NODE_ENV !== 'test' ||
  !/^[a-f0-9]{32}$/.test(process.env.T24_HARNESS_MARKER ?? '') ||
  existsSync('/proc') ||
  existsSync('/run') ||
  existsSync(process.env.T24_PRIVATE_PATH ?? '/invalid') ||
  Object.keys(networkInterfaces()).some((name) => name !== 'lo')
)
  throw new Error('The isolated T24 memory session fixture is required');

beforeAll(async () => {
  const marker = process.env.T24_HARNESS_MARKER!;
  const regression = process.env.T24_REGRESSION_DATABASE_URL;
  const url = regression ?? process.env.T24_TEST_DATABASE_URL;
  if (!url || (regression && process.env.T24_TEST_DATABASE_URL))
    throw new Error('One explicit harness database is required');
  const parsed = new URL(url);
  const database = `safethrift_${marker}_${regression ? 'regression_test' : 'test'}`;
  const username = regression ? 't24_regression' : 't24_test';
  if (
    parsed.hostname !== '127.0.0.1' ||
    parsed.port !== '55439' ||
    parsed.username !== username ||
    parsed.pathname !== `/${database}` ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('Unexpected memory-session PostgreSQL harness identity');
  const pool = new Pool({ connectionString: url });
  try {
    const result =
      await pool.query(`SELECT current_database() AS database, current_user AS username,
      marker, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls
      FROM t24_harness_identity, pg_roles r WHERE r.rolname=current_user`);
    expect(result.rows).toEqual([
      {
        database,
        username,
        marker,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
      },
    ]);
  } finally {
    await pool.end();
  }
});

type Slot = { value: string; expiresAt: number };
const stores = new WeakMap<RedisService, Map<string, Slot>>();
function store(service: RedisService): Map<string, Slot> {
  const result = stores.get(service);
  if (!result) throw new Error('Memory session fixture was not initialized');
  return result;
}
function read(service: RedisService, key: string): string | null {
  const entries = store(service);
  const slot = entries.get(key);
  if (!slot) return null;
  if (slot.expiresAt <= Date.now()) {
    entries.delete(key);
    return null;
  }
  return slot.value;
}

// Keep the normal Nest provider token and module graph. Only its session
// transport is replaced; PrismaService and PostgreSQL are never mocked.
RedisService.prototype.onModuleInit = function (): void {
  stores.set(this, new Map());
};
RedisService.prototype.onModuleDestroy = async function (): Promise<void> {
  stores.delete(this);
};
RedisService.prototype.set = async function (
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  store(this).set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
};
RedisService.prototype.get = async function (
  key: string,
): Promise<string | null> {
  return read(this, key);
};
RedisService.prototype.del = async function (key: string): Promise<void> {
  store(this).delete(key);
};
RedisService.prototype.exists = async function (key: string): Promise<boolean> {
  return read(this, key) !== null;
};
RedisService.prototype.compareAndSwap = async function (
  key: string,
  expected: string,
  replacement: string | null,
  ttlSeconds: number,
): Promise<boolean> {
  // No await between comparison and mutation: this fixture arbitrates within
  // one JS process. It makes no claim about Redis or distributed sessions.
  if (read(this, key) !== expected) return false;
  if (replacement === null) store(this).delete(key);
  else
    store(this).set(key, {
      value: replacement,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  return true;
};
