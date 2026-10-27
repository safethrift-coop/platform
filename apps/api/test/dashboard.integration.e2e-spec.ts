import { AccountReadsService } from '../src/modules/savings/account-reads.service';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { DatabaseModule } from '../src/core/database/database.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { RedisModule } from '../src/core/redis/redis.module';
import { RedisService } from '../src/core/redis/redis.service';
import { LoggerModule } from '../src/core/logger/logger.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { SavingsModule } from '../src/modules/savings/savings.module';
import { MembersModule } from '../src/modules/members/members.module';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { GlobalExceptionFilter } from '../src/core/filters/global-exception.filter';
const url =
  process.env.T41_TEST_DATABASE_URL ?? process.env.SAVINGS_TEST_DATABASE_URL;
const redisUrl = process.env.AUTH_TEST_REDIS_URL;
if (!url || !redisUrl)
  throw new Error('Explicit local dashboard test services required');
const parsed = new URL(url),
  redisParsed = new URL(redisUrl);
if (
  process.env.NODE_ENV !== 'test' ||
  !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname) ||
  !['localhost', '127.0.0.1'].includes(redisParsed.hostname) ||
  redisParsed.protocol !== 'redis:'
)
  throw new Error('Refusing unsafe test services');
jest.setTimeout(30000);
type Overview = Awaited<ReturnType<AccountReadsService['overview']>>;
type Detail = Awaited<ReturnType<AccountReadsService['account']>>;
type Page = {
  items: {
    id: string;
    amount: string;
    provenance: string;
    settlement: string;
  }[];
  hasMore: boolean;
  nextCursor: string | null;
};
describe('T41 dashboard — real PostgreSQL, JWT and Redis', () => {
  const original = { ...process.env };
  let app: INestApplication,
    database: PrismaService,
    db: Prisma.TransactionClient,
    redis: RedisService;
  const ids: string[] = [],
    accounts: string[] = [];
  const secret = 't41-local-test-secret-at-least-32-characters';
  const token = (id = ids[0]) =>
    new JwtService({ secret }).sign(
      { sub: id, email: `${id}@example.invalid`, role: 'member' },
      { expiresIn: '15m' },
    );
  const http = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const get = (path: string, id = ids[0]) =>
    http()
      .get('/api/v1' + path)
      .auth(token(id), { type: 'bearer' });
  async function seedMember(status: 'active' | 'pending' = 'active') {
    const id = randomUUID();
    ids.push(id);
    await db.member.create({
      data: {
        id,
        membershipNumber: id,
        firstName: 'Synthetic',
        lastName: 'Dashboard',
        passwordHash: 'not-a-login',
        email: `${id}@example.invalid`,
        dateOfBirth: new Date('1990-01-01'),
        phoneNumber: 'test',
        addressLine1: 'Test',
        city: 'Test',
        postcode: 'TEST',
        emailVerified: true,
        membershipStatus: status,
        savingsPointsTotal: 777,
        currentRiskBand: 'moderate_risk',
      },
    });
    const account = await db.memberAccount.create({
      data: {
        memberId: id,
        accountNumber: randomUUID(),
        accountType: 'savings_fsa',
        currentBalance: '123.45',
      },
    });
    accounts.push(account.id);
    return id;
  }
  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: url,
      RESEND_API_KEY: 're_test_not_a_live_key',
      REDIS_HOST: redisParsed.hostname,
      REDIS_PORT: redisParsed.port || '6379',
      REDIS_PASSWORD: decodeURIComponent(redisParsed.password),
      JWT_SECRET: secret,
      SAVINGS_SIMULATION_ENABLED: 'false',
      T38_WEBHOOKS_ENABLED: 'false',
      T36_JOBS_ENABLED: 'false',
      T40_FIXTURE_MODE: 'false',
      T40_APPLICATIONS_ENABLED: 'false',
    });
    database = new PrismaService();
    await database.onModuleInit();
    db = database as unknown as Prisma.TransactionClient;
    const module = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        LoggerModule,
        RedisModule,
        NotificationsModule,
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }]),
        EventEmitterModule.forRoot(),
        AuthModule,
        MembersModule,
        SavingsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(database)
      .compile();
    redis = module.get(RedisService);
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await seedMember();
    await seedMember();
    await seedMember('pending');
    for (let i = 0; i < 30; i++) {
      const id = `t41-${i.toString().padStart(2, '0')}-${ids[0]}`;
      const common = {
        id,
        memberId: ids[0],
        accountId: accounts[0],
        amount: '0.60',
        transactionDate: new Date('2026-01-01T12:00:00.000Z'),
        isSimulation: i % 3 === 0 ? true : i % 3 === 1 ? null : false,
        status: 'completed' as const,
      };
      await db.savingsTransaction.create({
        data: { ...common, transactionType: 'deposit' },
      });
      await db.withdrawalTransaction.create({ data: common });
    }
  });
  afterAll(async () => {
    try {
      if (db)
        await database.$transaction(async (tx) => {
          await tx.savingsPointsReceipt.deleteMany({
            where: { transaction: { memberId: { in: ids } } },
          });
          await tx.savingsRequest.deleteMany({
            where: { memberId: { in: ids } },
          });
          await tx.auditLog.deleteMany({ where: { changedBy: { in: ids } } });
          await tx.savingsTransaction.deleteMany({
            where: { memberId: { in: ids } },
          });
          await tx.withdrawalTransaction.deleteMany({
            where: { memberId: { in: ids } },
          });
          await tx.memberAccount.deleteMany({
            where: { memberId: { in: ids } },
          });
          await tx.member.deleteMany({ where: { id: { in: ids } } });
        });
    } finally {
      if (redis) for (const id of ids) await redis.del(`refresh:${id}`);
      if (app) await app.close();
      else if (database) await database.onModuleDestroy();
      process.env = original;
    }
  });
  it('requires JWT and isolates overview, stored totals, active savings accounts and detail', async () => {
    await http().get('/api/v1/accounts/overview').expect(401);
    await http()
      .get('/api/v1/accounts/overview')
      .auth('forged', { type: 'bearer' })
      .expect(401);
    await db.memberAccount.create({
      data: {
        memberId: ids[0],
        accountNumber: randomUUID(),
        accountType: 'savings_rsa',
        accountStatus: 'frozen',
      },
    });
    await db.memberAccount.create({
      data: {
        memberId: ids[0],
        accountNumber: randomUUID(),
        accountType: 'shares',
      },
    });
    // A malformed historical child link must not bypass both member filters.
    await db.savingsTransaction.create({
      data: {
        memberId: ids[1],
        accountId: accounts[0],
        amount: '999.00',
        transactionType: 'deposit',
        status: 'completed',
      },
    });
    const response = await get('/accounts/overview').expect(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatchObject({
      savingsPointsTotal: 777,
      riskBand: 'moderate_risk',
      capability: { deposit: false, withdrawal: false },
    });
    expect(
      (response.body as Overview).accounts.map((a: { id: string }) => a.id),
    ).toEqual([accounts[0]]);
    expect((response.body as Overview).accounts[0]).toMatchObject({
      currentBalance: '123.45',
      settlement: 'unverified',
    });
    expect((response.body as Overview).recentActivity.items).toHaveLength(5);
    const other = await get('/accounts/overview', ids[1]).expect(200);
    expect((other.body as Overview).recentActivity.items).toEqual([]);
    await get(`/accounts/${accounts[0]}`, ids[1]).expect(403);
    await get(`/accounts/${accounts[0]}/transactions`, ids[1]).expect(403);
    await get('/accounts/missing').expect(404);
    const spoof = await get(`/accounts/overview?memberId=${ids[1]}`).expect(
      200,
    );
    expect((spoof.body as Overview).accounts[0].id).toBe(accounts[0]);
  });
  it('paginates tied dates, colliding IDs and both sources exactly once across pages', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await get(
        `/accounts/${accounts[0]}/transactions?limit=7${cursor ? '&cursor=' + cursor : ''}`,
      ).expect(200);
      const page = res.body as Page;
      expect(page.items.length).toBeLessThanOrEqual(7);
      expect(page.hasMore).toBe(page.nextCursor !== null);
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60);
    expect(seen.slice(0, 30).every((id) => id.startsWith('deposit:'))).toBe(
      true,
    );
    expect(seen.slice(30).every((id) => id.startsWith('withdrawal:'))).toBe(
      true,
    );
    expect(seen[0]).toContain('t41-29-');
  });
  it('validates limits and cursor scope and continues below cursor after a newer insert', async () => {
    for (const limit of ['0', '-1', '51', '1x', '1.5', '01', '', 'Infinity'])
      await get(`/accounts/${accounts[0]}/transactions?limit=${limit}`).expect(
        400,
      );
    for (const cursor of [
      'invalid',
      '',
      Buffer.from('{}').toString('base64url'),
    ])
      await get(
        `/accounts/${accounts[0]}/transactions?cursor=${cursor}`,
      ).expect(400);
    const first = (
      await get(`/accounts/${accounts[0]}/transactions?limit=10`).expect(200)
    ).body as Page;
    await get(
      `/accounts/${accounts[1]}/transactions?cursor=${first.nextCursor}`,
      ids[1],
    ).expect(400);
    await db.savingsTransaction.create({
      data: {
        memberId: ids[0],
        accountId: accounts[0],
        amount: '1.00',
        transactionType: 'deposit',
        isSimulation: true,
        transactionDate: new Date('2026-02-01'),
      },
    });
    const next = (
      await get(
        `/accounts/${accounts[0]}/transactions?limit=10&cursor=${first.nextCursor}`,
      ).expect(200)
    ).body as Page;
    expect(
      next.items.every((item) => !first.items.some((i) => i.id === item.id)),
    ).toBe(true);
    expect(next.items[0].id).toContain('t41-19-');
    expect(
      (await get(`/accounts/${accounts[1]}/transactions`, ids[1]).expect(200))
        .body,
    ).toMatchObject({ items: [], hasMore: false, nextCursor: null });
  });
  it('handles withdrawal-only exact boundaries, historical IDs and excludes non-savings reads', async () => {
    const account = await db.memberAccount.create({
      data: {
        memberId: ids[1],
        accountNumber: randomUUID(),
        accountType: 'savings_gsa',
      },
    });
    for (const id of ['historical:one', 'historical:two'])
      await db.withdrawalTransaction.create({
        data: {
          id: id + '-' + ids[1],
          memberId: ids[1],
          accountId: account.id,
          amount: '2.00',
          transactionDate: new Date('2026-01-01'),
          status: 'completed',
        },
      });
    const first = (
      await get(`/accounts/${account.id}/transactions?limit=1`, ids[1]).expect(
        200,
      )
    ).body as Page;
    const second = (
      await get(
        `/accounts/${account.id}/transactions?limit=1&cursor=${first.nextCursor}`,
        ids[1],
      ).expect(200)
    ).body as Page;
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect(first.items[0].id).not.toBe(second.items[0].id);
    const shares = await db.memberAccount.findFirstOrThrow({
      where: { memberId: ids[0], accountType: 'shares' },
    });
    await get(`/accounts/${shares.id}`).expect(404);
    await get(`/accounts/${shares.id}/transactions`).expect(404);
  });
  it('never treats simulation or unknown/false markers as settled', async () => {
    const page = (
      await get(`/accounts/${accounts[0]}/transactions?limit=50`).expect(200)
    ).body as Page;
    expect(new Set(page.items.map((i) => i.provenance))).toEqual(
      new Set(['simulation', 'historical_unknown', 'unverified']),
    );
    expect(page.items.every((i) => i.settlement !== 'settled')).toBe(true);
    const detail = await get(`/accounts/${accounts[0]}`).expect(200);
    expect((detail.body as Detail).balanceNotice).toBe(
      'Recorded balance — settlement unverified; may include simulation records.',
    );
    expect(detail.body).not.toHaveProperty('availableBalance');
  });
  it('reads actual stored risk states, zero points and pending membership without computing scores', async () => {
    for (const band of [
      'low_risk',
      'moderate_risk',
      'high_risk',
      'unscored',
    ] as const) {
      await db.member.update({
        where: { id: ids[2] },
        data: { currentRiskBand: band, savingsPointsTotal: 0 },
      });
      const res = await get('/accounts/overview', ids[2]).expect(200);
      expect(res.body).toMatchObject({
        riskBand: band,
        savingsPointsTotal: 0,
        membershipStatus: 'pending',
        capability: { deposit: false },
      });
    }
    expect(await db.riskScore.count({ where: { memberId: { in: ids } } })).toBe(
      0,
    );
    for (const status of ['suspended', 'closed'] as const) {
      await db.member.update({
        where: { id: ids[2] },
        data: { membershipStatus: status },
      });
      await get('/accounts/overview', ids[2]).expect(401);
    }
  });
  it('keeps mutations disabled by default and in staging/production even with the flag true', async () => {
    for (const [mode, flag] of [
      ['test', 'false'],
      ['test', undefined],
      ['production', 'true'],
      ['staging', 'true'],
    ]) {
      process.env.NODE_ENV = mode;
      if (flag === undefined) delete process.env.SAVINGS_SIMULATION_ENABLED;
      else process.env.SAVINGS_SIMULATION_ENABLED = flag;
      const detail = await get(`/accounts/${accounts[0]}`).expect(200);
      expect((detail.body as Detail).capability.deposit).toBe(false);
      for (const action of ['deposit', 'withdraw'])
        await http()
          .post(`/api/v1/accounts/${accounts[0]}/${action}`)
          .auth(token(), { type: 'bearer' })
          .set('Idempotency-Key', randomUUID())
          .send({ amount: '1.00' })
          .expect(403);
    }
    process.env.NODE_ENV = 'test';
    process.env.SAVINGS_SIMULATION_ENABLED = 'false';
    expect(
      (
        await db.memberAccount.findUniqueOrThrow({ where: { id: accounts[0] } })
      ).currentBalance.toFixed(2),
    ).toBe('123.45');
  });
  it('advertises only eligible simulation and retains T25 replay/balance/GSA safeguards', async () => {
    process.env.SAVINGS_SIMULATION_ENABLED = 'true';
    const detail = await get(`/accounts/${accounts[0]}`).expect(200);
    expect((detail.body as Detail).capability).toMatchObject({
      deposit: true,
      withdrawal: true,
      simulationOnly: true,
    });
    const key = randomUUID();
    const post = (
      action: string,
      amount: string,
      id = key,
      account = accounts[0],
      member = ids[0],
    ) =>
      http()
        .post(`/api/v1/accounts/${account}/${action}`)
        .auth(token(member), { type: 'bearer' })
        .set('Idempotency-Key', id)
        .send({ amount });
    const first = await post('deposit', '1.00').expect(201);
    const replay = await post('deposit', '1.00').expect(201);
    expect(replay.body).toEqual(first.body);
    expect(first.body).toMatchObject({
      simulation: true,
      settlement: 'not_settled',
      newBalance: '124.45',
    });
    await post('deposit', '2.00').expect(409);
    await post('withdraw', '1000.00', randomUUID()).expect(400);
    await post('deposit', '1.00', randomUUID(), accounts[0], ids[1]).expect(
      403,
    );
    const gsa = await db.memberAccount.create({
      data: {
        memberId: ids[0],
        accountNumber: randomUUID(),
        accountType: 'savings_gsa',
        goalTarget: '100.00',
        currentBalance: '1.00',
        goalReached: false,
      },
    });
    expect(
      ((await get(`/accounts/${gsa.id}`).expect(200)).body as Detail).capability
        .withdrawal,
    ).toBe(false);
    await post('withdraw', '0.50', randomUUID(), gsa.id).expect(400);
    process.env.SAVINGS_SIMULATION_ENABLED = 'false';
    await post('deposit', '1.00', randomUUID()).expect(403);
    expect(process.env.T38_WEBHOOKS_ENABLED).toBe('false');
    expect(process.env.T40_APPLICATIONS_ENABLED).toBe('false');
  });
});
