import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { SyntheticKycTestModule } from './fixtures/t24-kyc-test.module';
import { SyntheticKycProvider } from './fixtures/t24-synthetic-provider';
import { SyntheticWebhookVerifier } from './fixtures/t24-synthetic-webhook';
import { assertT24Isolation } from './fixtures/t24-assert-isolation';
import { DatabaseModule } from '../src/core/database/database.module';
import { LoansModule } from '../src/modules/loans/loans.module';
import {
  SyntheticKycService,
  SyntheticWebhookService,
} from './fixtures/t24-kyc-test.module';
import {
  LoansService,
  LOAN_EXECUTION_DISABLED,
} from '../src/modules/loans/loans.service';
import { PrismaService } from '../src/core/database/prisma.service';

const url = process.env.T24_TEST_DATABASE_URL;
if (!url) throw new Error('Dedicated T24_TEST_DATABASE_URL required');
const secret = 'synthetic-test-jwt-secret-at-least-32-bytes';
const key = randomBytes(32);
const member = randomUUID();
const second = randomUUID();
const recovery = randomUUID();
const racing = randomUUID();
const loanFixture = randomUUID();
const permanent = randomUUID();
const interrupted = randomUUID();
const lostResponse = randomUUID();
const concurrent = randomUUID();
const conflict = randomUUID();
const eventFailure = randomUUID();
const terminal = randomUUID();
const nonSynthetic = randomUUID();
const unregistered = randomUUID();
const fixtures = [
  member,
  second,
  recovery,
  racing,
  loanFixture,
  permanent,
  interrupted,
  lostResponse,
  concurrent,
  conflict,
  eventFailure,
  terminal,
  nonSynthetic,
];
const provider = new SyntheticKycProvider();
const pool = new Pool({ connectionString: url });
let app: INestApplication;
const applicationLogs: string[] = [];
const signatures: string[] = [];
const rawBodies: string[] = [];
const forbidden = [
  'T24-FORBIDDEN-DOCUMENT-20261116',
  'T24-FORBIDDEN-NATIONAL-ID-20261116',
  'T24-FORBIDDEN-ONFIDO-CREDENTIAL-20261116',
];
const capture = (...values: unknown[]) => {
  applicationLogs.push(
    values
      .map((value) =>
        value instanceof Error
          ? (value.stack ?? value.message)
          : typeof value === 'string'
            ? value
            : JSON.stringify(value),
      )
      .join(' '),
  );
};
const logger = {
  log: capture,
  error: capture,
  warn: capture,
  debug: capture,
  verbose: capture,
  fatal: capture,
};
const token = (id: string) =>
  new JwtService({ secret }).sign({
    sub: id,
    email: `${id}@example.invalid`,
    role: 'member',
  });
const http = () =>
  request(app.getHttpServer() as Parameters<typeof request>[0]);
const submit = (id: string, idempotencyKey = 'acceptance') =>
  http()
    .post('/api/v1/kyc/submit')
    .auth(token(id), { type: 'bearer' })
    .set('Idempotency-Key', idempotencyKey)
    .send({});
async function attemptFor(id: string) {
  const result = await pool.query(
    'SELECT a.*, k.verification_status FROM kyc_synthetic_attempts a JOIN kyc_verification k ON k.kyc_id=a.verification_id WHERE a.member_id=$1 AND a.is_current',
    [id],
  );
  expect(result.rowCount).toBe(1);
  return result.rows[0];
}
function signed(body: string, signingKey = key) {
  const signature = createHmac('sha256', signingKey).update(body).digest('hex');
  signatures.push(signature);
  rawBodies.push(body);
  return http()
    .post('/api/v1/webhooks/onfido')
    .set('Content-Type', 'application/json')
    .set('x-synthetic-signature', signature)
    .send(body);
}
function event(
  correlationId: string,
  sequence: number,
  transition: string,
  eventId = randomUUID(),
) {
  return JSON.stringify({ eventId, correlationId, sequence, transition });
}
async function snapshot(id: string): Promise<string> {
  const statements = [
    'SELECT to_jsonb(k) AS row FROM kyc_verification k WHERE member_id=$1 ORDER BY kyc_id',
    'SELECT to_jsonb(a) AS row FROM kyc_synthetic_attempts a WHERE member_id=$1 ORDER BY id',
    'SELECT to_jsonb(e) AS row FROM kyc_synthetic_events e WHERE attempt_id IN (SELECT id FROM kyc_synthetic_attempts WHERE member_id=$1) ORDER BY id',
    "SELECT to_jsonb(a) AS row FROM audit_logs a WHERE changed_by=$1 AND table_name='kyc_verification' ORDER BY audit_id",
  ];
  return JSON.stringify(
    await Promise.all(
      statements.map(async (sql) => (await pool.query(sql, [id])).rows),
    ),
  );
}

jest.setTimeout(30000);

describe('T24 isolated synthetic KYC application', () => {
  beforeAll(async () => {
    await assertT24Isolation(pool);
    process.env.DATABASE_URL = url;
    process.env.JWT_SECRET = secret;
    for (const id of [...fixtures, unregistered])
      await pool.query(
        "INSERT INTO members (member_id,membership_number,first_name,last_name,date_of_birth,phone_number,email,address_line_1,city,postcode,password_hash,membership_status,email_verified,updated_at) VALUES ($1,$1,'Synthetic','Test','1990-01-01','test',$2,'test','test','test','test','active',true,CURRENT_TIMESTAMP)",
        [id, `${id}@example.invalid`],
      );
    const module = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        LoansModule,
        SyntheticKycTestModule.register({
          pool,
          fixtureIds: new Set(fixtures),
          provider,
          verifier: new SyntheticWebhookVerifier(key),
        }),
      ],
    }).compile();
    app = module.createNestApplication({ bodyParser: false, logger });
    app.use(
      '/api/v1/webhooks/onfido',
      express.raw({ type: 'application/json', limit: '4kb' }),
    );
    app.use(express.json({ limit: '4kb' }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  it('requires authentication and rejects identity fields', async () => {
    await http().get('/api/v1/kyc/status').expect(401);
    await http()
      .get('/api/v1/kyc/status')
      .auth('malformed', { type: 'bearer' })
      .expect(401);
    const forged = new JwtService({ secret: 'wrong-synthetic-key' }).sign({
      sub: member,
      email: `${member}@example.invalid`,
      role: 'member',
    });
    await http()
      .get('/api/v1/kyc/status')
      .auth(forged, { type: 'bearer' })
      .expect(401);
    const expired = new JwtService({ secret }).sign(
      { sub: member, email: `${member}@example.invalid`, role: 'member' },
      { expiresIn: -1 },
    );
    await http()
      .get('/api/v1/kyc/status')
      .auth(expired, { type: 'bearer' })
      .expect(401);
    await http()
      .get('/api/v1/kyc/status')
      .auth(token(randomUUID()), { type: 'bearer' })
      .expect(401);
    await http()
      .post('/api/v1/kyc/submit')
      .auth(token(member), { type: 'bearer' })
      .set('Idempotency-Key', 'bad-body')
      .send({ memberId: second })
      .expect(400);
    await http()
      .get('/api/v1/kyc/status?memberId=other')
      .auth(token(member), { type: 'bearer' })
      .expect(400);
    await pool.query(
      "UPDATE members SET membership_status='pending' WHERE member_id=$1",
      [second],
    );
    try {
      await http()
        .get('/api/v1/kyc/status')
        .auth(token(second), { type: 'bearer' })
        .expect(401);
    } finally {
      await pool.query(
        "UPDATE members SET membership_status='active' WHERE member_id=$1",
        [second],
      );
    }
  });

  it('permits at most one current attempt when different keys race', async () => {
    const submit = (idempotencyKey: string) =>
      http()
        .post('/api/v1/kyc/submit')
        .auth(token(racing), { type: 'bearer' })
        .set('Idempotency-Key', idempotencyKey)
        .send({});
    const [a, b] = await Promise.all([submit('race-a'), submit('race-b')]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    const rows = await pool.query(
      'SELECT id FROM kyc_synthetic_attempts WHERE member_id=$1 AND is_current',
      [racing],
    );
    expect(rows.rowCount).toBe(1);
    const kyc = await pool.query(
      'SELECT kyc_id FROM kyc_verification WHERE member_id=$1',
      [racing],
    );
    expect(kyc.rowCount).toBe(1);
  });

  it('serializes same-key submissions and scopes status to the owner', async () => {
    const submit = () =>
      http()
        .post('/api/v1/kyc/submit')
        .auth(token(member), { type: 'bearer' })
        .set('Idempotency-Key', 'same-key')
        .send({});
    const [a, b] = await Promise.all([submit(), submit()]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(a.body.attemptId).toBe(b.body.attemptId);
    expect(a.body.mode).toBe('synthetic');
    const attempt = await attemptFor(member);
    expect(
      (
        await pool.query(
          "SELECT audit_id FROM audit_logs WHERE record_id=$1 AND action_type='insert'",
          [attempt.verification_id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query('SELECT audit_id FROM audit_logs WHERE record_id=$1', [
          attempt.verification_id,
        ])
      ).rowCount,
    ).toBe(2);
    const other = await http()
      .get('/api/v1/kyc/status')
      .auth(token(second), { type: 'bearer' })
      .expect(200);
    expect(other.body).toEqual({ mode: 'synthetic', status: 'not_available' });
    expect(other.headers['cache-control']).toBe('private, no-store');
  });

  it('resumes a failed initiation using the same durable correlation', async () => {
    const call = jest
      .spyOn(provider, 'initiate')
      .mockResolvedValueOnce('retryable_failure');
    const submit = () =>
      http()
        .post('/api/v1/kyc/submit')
        .auth(token(recovery), { type: 'bearer' })
        .set('Idempotency-Key', 'recover')
        .send({});
    await submit().expect(503);
    const before = await pool.query(
      'SELECT id, correlation_id FROM kyc_synthetic_attempts WHERE member_id=$1',
      [recovery],
    );
    const response = await submit().expect(202);
    const after = await pool.query(
      'SELECT id, correlation_id FROM kyc_synthetic_attempts WHERE member_id=$1',
      [recovery],
    );
    expect(after.rows).toEqual(before.rows);
    expect(response.body.attemptId).toBe(before.rows[0].id);
    expect(call.mock.calls.slice(-2).map((args) => args[0])).toEqual([
      before.rows[0].correlation_id,
      before.rows[0].correlation_id,
    ]);
    call.mockRestore();
  });

  it('persists a permanent provider failure without creating or retrying another attempt', async () => {
    const call = jest
      .spyOn(provider, 'initiate')
      .mockResolvedValueOnce('permanent_failure');
    try {
      await submit(permanent, 'permanent').expect(503);
      const attempt = await attemptFor(permanent);
      expect(attempt.initiation_state).toBe('permanent_failure');
      expect(attempt.verification_status).toBe('pending');
      const before = await snapshot(permanent);
      await submit(permanent, 'permanent').expect(503);
      await submit(permanent, 'different-after-permanent').expect(409);
      expect(await snapshot(permanent)).toBe(before);
      expect(call).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledWith(attempt.correlation_id);
    } finally {
      call.mockRestore();
    }
  });

  it.each(['before_provider', 'after_provider'] as const)(
    'recovers the same durable attempt after SIGTERM at %s',
    async (point) => {
      const id = point === 'before_provider' ? interrupted : lostResponse;
      const child = fork(join(__dirname, 'fixtures/t24-crash-worker.ts'), [], {
        execPath: process.execPath,
        execArgv: ['-r', require.resolve('ts-node/register/transpile-only')],
        env: { ...process.env, T24_CRASH_MEMBER: id, T24_CRASH_POINT: point },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      child.stderr?.on('data', (data: Buffer) =>
        applicationLogs.push(data.toString()),
      );
      try {
        const message = await new Promise<{
          point: string;
          correlationId: string;
        }>((resolve, reject) => {
          const timeout = setTimeout(
            () =>
              reject(
                new Error('Crash fixture did not reach its interruption point'),
              ),
            15000,
          );
          child.once('message', (value) => {
            clearTimeout(timeout);
            const result = value as {
              point: string;
              correlationId: string;
              error?: string;
            };
            if (result.error) reject(new Error(result.error));
            else resolve(result);
          });
          child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          child.once('exit', () => {
            clearTimeout(timeout);
            reject(new Error('Crash fixture exited before interruption'));
          });
        });
        expect(message.point).toBe(point);
        const before = await attemptFor(id);
        expect(before.correlation_id).toBe(message.correlationId);
        expect(before.initiation_state).toBe('pending');
        expect(before.verification_status).toBe('pending');
        const exit = once(child, 'exit');
        expect(child.kill('SIGTERM')).toBe(true);
        const [code, signal] = await exit;
        expect(code).toBeNull();
        expect(signal).toBe('SIGTERM');
        const call = jest.spyOn(provider, 'initiate');
        try {
          const response = await submit(id, `crash-${point}`).expect(202);
          const after = await attemptFor(id);
          expect(response.body.attemptId).toBe(before.id);
          expect(after.correlation_id).toBe(before.correlation_id);
          expect(after.initiation_state).toBe('started');
          expect(after.verification_status).toBe('in_progress');
          expect(call.mock.calls).toEqual([[before.correlation_id]]);
          expect(
            (
              await pool.query(
                'SELECT kyc_id FROM kyc_verification WHERE member_id=$1',
                [id],
              )
            ).rowCount,
          ).toBe(1);
          expect(
            (
              await pool.query(
                "SELECT audit_id FROM audit_logs WHERE changed_by=$1 AND table_name='kyc_verification'",
                [id],
              )
            ).rowCount,
          ).toBe(2);
        } finally {
          call.mockRestore();
        }
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exit = once(child, 'exit');
          child.kill('SIGTERM');
          await exit;
        }
      }
    },
  );

  it('commits exactly one event, terminal transition and audit under twelve concurrent deliveries', async () => {
    await submit(concurrent).expect(202);
    const attempt = await attemptFor(concurrent);
    const body = event(attempt.correlation_id, 1, 'verified');
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => signed(body)),
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array(12).fill(200),
    );
    const evidence = await pool.query(
      'SELECT outcome FROM kyc_synthetic_events WHERE attempt_id=$1',
      [attempt.id],
    );
    expect(evidence.rows).toEqual([{ outcome: 'applied' }]);
    expect((await attemptFor(concurrent)).verification_status).toBe('verified');
    expect(
      (
        await pool.query(
          "SELECT new_value FROM audit_logs WHERE record_id=$1 AND new_value::jsonb->>'status'='verified'",
          [attempt.verification_id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query('SELECT audit_id FROM audit_logs WHERE record_id=$1', [
          attempt.verification_id,
        ])
      ).rowCount,
    ).toBe(3);
  });

  it('arbitrates concurrent conflicting sequence deliveries without replacing the winning terminal state', async () => {
    await submit(conflict).expect(202);
    const attempt = await attemptFor(conflict);
    const bodies = [
      event(attempt.correlation_id, 1, 'verified'),
      event(attempt.correlation_id, 1, 'rejected'),
    ];
    const responses = await Promise.all(bodies.map((body) => signed(body)));
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = JSON.parse(
      bodies[responses.findIndex((response) => response.status === 200)],
    ) as { transition: string };
    expect((await attemptFor(conflict)).verification_status).toBe(
      winner.transition,
    );
    expect(
      (
        await pool.query(
          'SELECT id FROM kyc_synthetic_events WHERE attempt_id=$1',
          [attempt.id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query('SELECT audit_id FROM audit_logs WHERE record_id=$1', [
          attempt.verification_id,
        ])
      ).rowCount,
    ).toBe(3);
  });

  it('rejects cross-member event reuse, historical correlation and cross-member database references', async () => {
    await submit(second, 'cross-member').expect(202);
    const other = await attemptFor(second);
    const own = await attemptFor(member);
    const eventId = randomUUID();
    await signed(event(other.correlation_id, 1, 'verified', eventId)).expect(
      200,
    );
    const before = await snapshot(member);
    await signed(event(own.correlation_id, 1, 'verified', eventId)).expect(409);
    await signed(event('t24-historical-kyc', 1, 'verified')).expect(400);
    await signed(
      JSON.stringify({
        eventId: randomUUID(),
        correlationId: own.correlation_id,
        sequence: 1,
        transition: 'verified',
        memberId: second,
      }),
    ).expect(400);
    await expect(
      pool.query('UPDATE kyc_synthetic_attempts SET member_id=$1 WHERE id=$2', [
        unregistered,
        own.id,
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    expect(await snapshot(member)).toBe(before);
    expect((await attemptFor(second)).verification_status).toBe('verified');
    expect(
      (
        await pool.query(
          'SELECT attempt_id FROM kyc_synthetic_events WHERE event_id=$1',
          [eventId],
        )
      ).rows,
    ).toEqual([{ attempt_id: other.id }]);
    expect(
      (
        await pool.query(
          "SELECT verification_status FROM kyc_verification WHERE kyc_id='t24-historical-kyc'",
        )
      ).rows,
    ).toEqual([{ verification_status: 'verified' }]);
    expect(
      (
        await pool.query(
          "SELECT id FROM kyc_synthetic_attempts WHERE verification_id='t24-historical-kyc'",
        )
      ).rowCount,
    ).toBe(0);
  });

  it('rolls back event evidence and status if the audit insert fails', async () => {
    const attempt = await pool.query(
      'SELECT correlation_id, verification_id FROM kyc_synthetic_attempts WHERE member_id=$1',
      [recovery],
    );
    const id = randomUUID();
    const body = JSON.stringify({
      eventId: id,
      correlationId: attempt.rows[0].correlation_id,
      sequence: 1,
      transition: 'verified',
    });
    await pool.query(
      'INSERT INTO t24_audit_failure (verification_id) VALUES ($1)',
      [attempt.rows[0].verification_id],
    );
    try {
      await http()
        .post('/api/v1/webhooks/onfido')
        .set('Content-Type', 'application/json')
        .set(
          'x-synthetic-signature',
          createHmac('sha256', key).update(body).digest('hex'),
        )
        .send(body)
        .expect(503);
      const evidence = await pool.query(
        'SELECT id FROM kyc_synthetic_events WHERE event_id=$1',
        [id],
      );
      const status = await pool.query(
        'SELECT verification_status FROM kyc_verification WHERE kyc_id=$1',
        [attempt.rows[0].verification_id],
      );
      expect(evidence.rowCount).toBe(0);
      expect(status.rows[0].verification_status).toBe('in_progress');
    } finally {
      await pool.query(
        'DELETE FROM t24_audit_failure WHERE verification_id=$1',
        [attempt.rows[0].verification_id],
      );
    }
    await signed(body).expect(200);
    await signed(body).expect(200);
    expect(
      (
        await pool.query(
          'SELECT id FROM kyc_synthetic_events WHERE event_id=$1',
          [id],
        )
      ).rowCount,
    ).toBe(1);
    expect((await attemptFor(recovery)).verification_status).toBe('verified');
    expect(
      (
        await pool.query('SELECT audit_id FROM audit_logs WHERE record_id=$1', [
          attempt.rows[0].verification_id,
        ])
      ).rowCount,
    ).toBe(3);
  });

  it('rolls back an event insertion failure and safely commits the identical retry once', async () => {
    await submit(eventFailure).expect(202);
    const attempt = await attemptFor(eventFailure);
    const eventId = randomUUID();
    const body = event(attempt.correlation_id, 1, 'verified', eventId);
    const before = await snapshot(eventFailure);
    await pool.query('INSERT INTO t24_event_failure (event_id) VALUES ($1)', [
      eventId,
    ]);
    try {
      await signed(body).expect(503);
      expect(await snapshot(eventFailure)).toBe(before);
    } finally {
      await pool.query('DELETE FROM t24_event_failure WHERE event_id=$1', [
        eventId,
      ]);
    }
    await signed(body).expect(200);
    await signed(body).expect(200);
    expect((await attemptFor(eventFailure)).verification_status).toBe(
      'verified',
    );
    expect(
      (
        await pool.query(
          'SELECT id FROM kyc_synthetic_events WHERE event_id=$1',
          [eventId],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query('SELECT audit_id FROM audit_logs WHERE record_id=$1', [
          attempt.verification_id,
        ])
      ).rowCount,
    ).toBe(3);
  });

  it('retains rejected and expired terminal states after authenticated conflicting transitions', async () => {
    await submit(terminal).expect(202);
    const attempt = await attemptFor(terminal);
    await signed(event(attempt.correlation_id, 1, 'rejected')).expect(200);
    await signed(event(attempt.correlation_id, 2, 'verified')).expect(200);
    await signed(event(attempt.correlation_id, 3, 'expired')).expect(200);
    expect((await attemptFor(terminal)).verification_status).toBe('rejected');
    expect(
      (
        await pool.query(
          'SELECT outcome FROM kyc_synthetic_events WHERE attempt_id=$1 ORDER BY sequence',
          [attempt.id],
        )
      ).rows.map((row) => row.outcome),
    ).toEqual(['applied', 'rejected', 'rejected']);
    const verifiedAttempt = await attemptFor(concurrent);
    await signed(event(verifiedAttempt.correlation_id, 2, 'rejected')).expect(
      200,
    );
    expect((await attemptFor(concurrent)).verification_status).toBe('verified');
    await signed(event(verifiedAttempt.correlation_id, 3, 'expired')).expect(
      200,
    );
    await signed(event(verifiedAttempt.correlation_id, 4, 'verified')).expect(
      200,
    );
    expect((await attemptFor(concurrent)).verification_status).toBe('expired');
  });

  it('authenticates, orders and deduplicates synthetic events', async () => {
    const firstEvent = randomUUID();
    const secondEvent = randomUUID();
    const a = await pool.query(
      'SELECT correlation_id FROM kyc_synthetic_attempts WHERE member_id=$1',
      [member],
    );
    const send = (
      id: string,
      sequence: number,
      transition: string,
      signingKey = key,
    ) => {
      const body = JSON.stringify({
        eventId: id,
        correlationId: a.rows[0].correlation_id,
        sequence,
        transition,
      });
      return http()
        .post('/api/v1/webhooks/onfido')
        .set('Content-Type', 'application/json')
        .set(
          'x-synthetic-signature',
          createHmac('sha256', signingKey).update(body).digest('hex'),
        )
        .send(body);
    };
    await send(secondEvent, 2, 'expired', randomBytes(32)).expect(400);
    const unknown = JSON.stringify({
      eventId: randomUUID(),
      correlationId: randomUUID(),
      sequence: 1,
      transition: 'verified',
    });
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'application/json')
      .set(
        'x-synthetic-signature',
        createHmac('sha256', key).update(unknown).digest('hex'),
      )
      .send(unknown)
      .expect(400);
    const extra = JSON.stringify({
      eventId: randomUUID(),
      correlationId: a.rows[0].correlation_id,
      sequence: 1,
      transition: 'verified',
      identity: 'forbidden',
    });
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'application/json')
      .set(
        'x-synthetic-signature',
        createHmac('sha256', key).update(extra).digest('hex'),
      )
      .send(extra)
      .expect(400);
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'application/json')
      .send('x'.repeat(4097))
      .expect(413);
    await send(secondEvent, 2, 'expired').expect(200);
    expect(
      (
        await pool.query(
          'SELECT sequence, outcome FROM kyc_synthetic_events WHERE event_id=$1',
          [secondEvent],
        )
      ).rows,
    ).toEqual([{ sequence: 2, outcome: 'pending' }]);
    expect(
      (
        await pool.query(
          "SELECT audit_id FROM audit_logs WHERE changed_by=$1 AND table_name='kyc_verification'",
          [member],
        )
      ).rowCount,
    ).toBe(2);
    let status = await http()
      .get('/api/v1/kyc/status')
      .auth(token(member), { type: 'bearer' });
    expect(status.body.status).toBe('in_progress');
    await send(firstEvent, 1, 'verified').expect(200);
    await send(firstEvent, 1, 'verified').expect(200);
    await send(firstEvent, 1, 'rejected').expect(409);
    status = await http()
      .get('/api/v1/kyc/status')
      .auth(token(member), { type: 'bearer' });
    expect(status.body.status).toBe('expired');
    const rows = await pool.query(
      'SELECT outcome FROM kyc_synthetic_events WHERE attempt_id=(SELECT id FROM kyc_synthetic_attempts WHERE member_id=$1) ORDER BY sequence',
      [member],
    );
    expect(rows.rows.map((r) => r.outcome)).toEqual(['applied', 'applied']);
  });

  it('does not restore a superseded terminal attempt after a late event', async () => {
    const prior = await pool.query(
      'SELECT id, correlation_id FROM kyc_synthetic_attempts WHERE member_id=$1 AND is_current',
      [member],
    );
    const created = await http()
      .post('/api/v1/kyc/submit')
      .auth(token(member), { type: 'bearer' })
      .set('Idempotency-Key', 'new-after-expiry')
      .send({})
      .expect(202);
    expect(created.body.attemptId).not.toBe(prior.rows[0].id);
    const body = JSON.stringify({
      eventId: randomUUID(),
      correlationId: prior.rows[0].correlation_id,
      sequence: 3,
      transition: 'verified',
    });
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'application/json')
      .set(
        'x-synthetic-signature',
        createHmac('sha256', key).update(body).digest('hex'),
      )
      .send(body)
      .expect(200);
    const status = await http()
      .get('/api/v1/kyc/status')
      .auth(token(member), { type: 'bearer' })
      .expect(200);
    expect(status.body.attemptId).toBe(created.body.attemptId);
    expect(status.body.status).toBe('in_progress');
    expect(
      (
        await pool.query(
          'SELECT is_current FROM kyc_synthetic_attempts WHERE id=$1',
          [prior.rows[0].id],
        )
      ).rows[0].is_current,
    ).toBe(false);
    const rejected = await pool.query(
      'SELECT outcome FROM kyc_synthetic_events WHERE attempt_id=$1 AND sequence=3',
      [prior.rows[0].id],
    );
    expect(rejected.rows[0].outcome).toBe('rejected');
  });

  it('does not authorize loan execution after synthetic verification', async () => {
    await http()
      .post('/api/v1/kyc/submit')
      .auth(token(loanFixture), { type: 'bearer' })
      .set('Idempotency-Key', 'loan-fixture')
      .send({})
      .expect(202);
    const attempt = await pool.query(
      'SELECT correlation_id FROM kyc_synthetic_attempts WHERE member_id=$1',
      [loanFixture],
    );
    const body = JSON.stringify({
      eventId: randomUUID(),
      correlationId: attempt.rows[0].correlation_id,
      sequence: 1,
      transition: 'verified',
    });
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'application/json')
      .set(
        'x-synthetic-signature',
        createHmac('sha256', key).update(body).digest('hex'),
      )
      .send(body)
      .expect(200);
    const status = await http()
      .get('/api/v1/kyc/status')
      .auth(token(loanFixture), { type: 'bearer' })
      .expect(200);
    expect(status.body.status).toBe('verified');
    expect((await attemptFor(loanFixture)).verification_status).toBe(
      'verified',
    );
    const response = await http()
      .post('/api/v1/loans/apply')
      .auth(token(loanFixture), { type: 'bearer' })
      .send({
        requestedAmount: 50,
        requestedTermMonths: 3,
        loanPurpose: 'synthetic test',
      })
      .expect(403);
    expect(response.body.message).toBe(LOAN_EXECUTION_DISABLED);
    const eligibility = await http()
      .get('/api/v1/loans/eligibility')
      .auth(token(loanFixture), { type: 'bearer' })
      .expect(200);
    expect(eligibility.body.kycStatus).toBe('not_evaluated');
    expect(eligibility.body.applicationCapability.allowed).toBe(false);
    const service = new LoansService(app.get(PrismaService));
    await expect(
      service.applyForLoan(loanFixture, {
        requestedAmount: 50,
        requestedTermMonths: 3,
        loanPurpose: 'synthetic test',
      }),
    ).rejects.toThrow(LOAN_EXECUTION_DISABLED);
    const privileges = await pool.query(
      "SELECT has_table_privilege(current_user,'loan_applications','INSERT') AS can_insert",
    );
    expect(privileges.rows[0].can_insert).toBe(false);
  });

  it('fails closed for unregistered fixtures and identities outside the synthetic suffix', async () => {
    await submit(unregistered).expect(401);
    await http()
      .get('/api/v1/kyc/status')
      .auth(token(unregistered), { type: 'bearer' })
      .expect(401);
    await pool.query('UPDATE members SET email=$1 WHERE member_id=$2', [
      `${nonSynthetic}@example.test`,
      nonSynthetic,
    ]);
    await submit(nonSynthetic).expect(401);
    await http()
      .get('/api/v1/kyc/status')
      .auth(token(nonSynthetic), { type: 'bearer' })
      .expect(401);
    expect(
      (
        await pool.query(
          'SELECT id FROM kyc_synthetic_attempts WHERE member_id=ANY($1::text[])',
          [[unregistered, nonSynthetic]],
        )
      ).rowCount,
    ).toBe(0);
  });

  it('rejects missing, malformed and tampered authentication and wrong content types without persistence', async () => {
    const attempt = await attemptFor(racing);
    const before = await snapshot(racing);
    const body = event(attempt.correlation_id, 1, 'verified');
    const signature = createHmac('sha256', key).update(body).digest('hex');
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400);
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'application/json')
      .set('x-synthetic-signature', 'malformed')
      .send(body)
      .expect(400);
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'application/json')
      .set('x-synthetic-signature', signature)
      .send(body + ' ')
      .expect(400);
    await http()
      .post('/api/v1/webhooks/onfido')
      .set('Content-Type', 'text/plain')
      .set('x-synthetic-signature', signature)
      .send(body)
      .expect(400);
    await signed(body, randomBytes(32)).expect(400);
    expect(await snapshot(racing)).toBe(before);
  });

  it('keeps normal AppModule KYC routes and providers absent while Prisma uses the actual disposable PostgreSQL', async () => {
    const previous = { ...process.env };
    let normal: INestApplication | undefined;
    const before = await snapshot(loanFixture);
    const providerCalls = jest.spyOn(provider, 'initiate');
    try {
      Object.assign(process.env, {
        DATABASE_URL: url,
        JWT_SECRET: secret,
        JWT_REFRESH_SECRET: secret,
        ENCRYPTION_KEY: '0'.repeat(64),
        RESEND_API_KEY: 're_synthetic_not_live',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '1',
        REDIS_PASSWORD: 'unused-memory-session-fixture',
        T36_JOBS_ENABLED: 'false',
        T36_EMAIL_MODE: 'disabled',
        T36_SMS_MODE: 'disabled',
        T38_WEBHOOKS_ENABLED: 'false',
        T40_FIXTURE_MODE: 'false',
        T40_APPLICATIONS_ENABLED: 'false',
        SAVINGS_SIMULATION_ENABLED: 'false',
      });
      const { AppModule } = require('../src/app.module');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      normal = module.createNestApplication({ logger });
      normal.setGlobalPrefix('api/v1');
      await normal.init();
      const identity = await normal.get(PrismaService).$queryRaw<
        Array<{ database: string; username: string; marker: string }>
      >`
        SELECT current_database() AS database, current_user AS username, marker FROM t24_harness_identity`;
      expect(identity).toEqual([
        {
          database: `safethrift_${process.env.T24_HARNESS_MARKER}_test`,
          username: 't24_test',
          marker: process.env.T24_HARNESS_MARKER,
        },
      ]);
      for (const service of [
        SyntheticKycService,
        SyntheticWebhookService,
        SyntheticKycProvider,
        SyntheticWebhookVerifier,
      ])
        expect(() => normal!.get(service, { strict: false })).toThrow();
      const api = request(
        normal.getHttpServer() as Parameters<typeof request>[0],
      );
      await api
        .get('/api/v1/kyc/status')
        .auth(token(loanFixture), { type: 'bearer' })
        .expect(404);
      await api
        .post('/api/v1/kyc/submit')
        .auth(token(loanFixture), { type: 'bearer' })
        .set('Idempotency-Key', 'normal-app')
        .send({})
        .expect(404);
      await api.post('/api/v1/webhooks/onfido').send({}).expect(404);
      const denial = await api
        .post('/api/v1/loans/apply')
        .auth(token(loanFixture), { type: 'bearer' })
        .send({
          requestedAmount: 50,
          requestedTermMonths: 3,
          loanPurpose: 'synthetic verified still denied',
        })
        .expect(403);
      expect(denial.body.message).toBe(LOAN_EXECUTION_DISABLED);
      expect(providerCalls).not.toHaveBeenCalled();
      expect(await snapshot(loanFixture)).toBe(before);
    } finally {
      if (normal) await normal.close();
      providerCalls.mockRestore();
      process.env = previous;
    }
  });

  it('rejects document and credential canaries and inspects responses, logs and persisted KYC/evidence/audit values', async () => {
    const before = await snapshot(racing);
    for (const body of [
      { documentNumber: forbidden[0] },
      { nationalIdNumber: forbidden[1] },
      { onfidoApiKey: forbidden[2] },
      { documentType: 'passport' },
      { firstName: 'Synthetic Real-looking', dateOfBirth: '1990-01-01' },
      { url: 'https://example.invalid/document' },
    ]) {
      const response = await http()
        .post('/api/v1/kyc/submit')
        .auth(token(racing), { type: 'bearer' })
        .set('Idempotency-Key', 'sensitive-input')
        .send(body)
        .expect(400);
      for (const canary of forbidden)
        expect(JSON.stringify(response.body)).not.toContain(canary);
    }
    const upload = await http()
      .post('/api/v1/kyc/submit')
      .auth(token(racing), { type: 'bearer' })
      .set('Idempotency-Key', 'document-upload')
      .attach('document', Buffer.from(forbidden[0]), 'synthetic.txt')
      .expect(400);
    expect(JSON.stringify(upload.body)).not.toContain(forbidden[0]);
    const attempt = await attemptFor(racing);
    const credentialBody = JSON.stringify({
      eventId: randomUUID(),
      correlationId: attempt.correlation_id,
      sequence: 1,
      transition: 'verified',
      credential: forbidden[2],
    });
    await signed(credentialBody).expect(400);
    expect(await snapshot(racing)).toBe(before);
    const leaked =
      await pool.query(`SELECT k.kyc_id FROM kyc_verification k JOIN kyc_synthetic_attempts a ON a.verification_id=k.kyc_id
      WHERE k.document_number IS NOT NULL OR k.document_issue_date IS NOT NULL OR k.document_expiry_date IS NOT NULL
        OR k.onfido_applicant_id IS NOT NULL OR k.onfido_check_id IS NOT NULL OR k.verified_by IS NOT NULL
        OR k.verification_date IS NOT NULL OR k.proof_of_address_type IS NOT NULL OR k.proof_of_address_status IS NOT NULL
        OR k.risk_flag OR k.risk_flag_reason IS NOT NULL OR k.notes IS NOT NULL`);
    expect(leaked.rowCount).toBe(0);
    const contents = JSON.stringify(
      await Promise.all(
        [
          'members',
          'kyc_verification',
          'kyc_synthetic_attempts',
          'kyc_synthetic_events',
          'audit_logs',
        ].map(
          async (table) =>
            (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t`))
              .rows,
        ),
      ),
    );
    const logs = applicationLogs.join('\n');
    for (const value of [
      ...forbidden,
      key.toString('hex'),
      ...signatures,
      ...rawBodies,
    ]) {
      expect(contents).not.toContain(value);
      expect(logs).not.toContain(value);
    }
    const audits = await pool.query(
      'SELECT new_value FROM audit_logs WHERE record_id IN (SELECT verification_id FROM kyc_synthetic_attempts)',
    );
    for (const row of audits.rows) {
      const value = JSON.parse(row.new_value) as Record<string, unknown>;
      expect(Object.keys(value).sort()).toEqual(['mode', 'status']);
      expect(value.mode).toBe('synthetic');
    }
    const status = await http()
      .get('/api/v1/kyc/status')
      .auth(token(loanFixture), { type: 'bearer' })
      .expect(200);
    expect(Object.keys(status.body).sort()).toEqual([
      'attemptId',
      'mode',
      'status',
    ]);
  });
});
