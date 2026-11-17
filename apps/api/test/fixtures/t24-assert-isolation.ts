import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { connect } from 'node:net';
import type { Pool } from 'pg';

/** Fail before fixtures are written if the dedicated harness boundary is absent. */
export async function assertT24Isolation(pool: Pool): Promise<void> {
  const marker = process.env.T24_HARNESS_MARKER;
  if (
    !marker ||
    !/^[a-f0-9]{32}$/.test(marker) ||
    process.env.NODE_ENV !== 'test'
  )
    throw new Error('T24 harness identity required');
  const url = new URL(process.env.T24_TEST_DATABASE_URL ?? '');
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '55439' ||
    url.username !== 't24_test' ||
    url.pathname !== `/safethrift_${marker}_test` ||
    url.search ||
    url.hash
  )
    throw new Error('Unexpected T24 database');
  if (
    existsSync('/proc') ||
    existsSync('/run') ||
    existsSync('/home/princewill/.aws') ||
    existsSync('/home/princewill/.nvm') ||
    existsSync(process.env.T24_PRIVATE_PATH ?? '/invalid')
  )
    throw new Error('T24 filesystem isolation unavailable');
  if (Object.keys(networkInterfaces()).some((name) => name !== 'lo'))
    throw new Error('T24 network isolation unavailable');
  if (
    Object.keys(process.env).some((name) =>
      /ADMIN|MIGRAT|PGPASSWORD/.test(name),
    )
  )
    throw new Error('Privileged credentials visible');
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: '203.0.113.1', port: 443 });
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error('Network boundary did not fail closed'));
    });
    socket.on('connect', () => {
      socket.destroy();
      reject(new Error('Outbound network reachable'));
    });
    socket.on('error', (error: NodeJS.ErrnoException) =>
      error.code === 'ENETUNREACH' ? resolve() : reject(error),
    );
  });
  const identity = await pool.query<{
    database: string;
    username: string;
    marker: string;
  }>(
    'SELECT current_database() AS database, current_user AS username, marker FROM t24_harness_identity',
  );
  if (
    identity.rows.length !== 1 ||
    identity.rows[0].database !== `safethrift_${marker}_test` ||
    identity.rows[0].username !== 't24_test' ||
    identity.rows[0].marker !== marker
  )
    throw new Error('T24 database ownership not established');
}
