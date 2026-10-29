import { LoanReadsService } from '../src/modules/loans/loan-reads.service';
import { LoansModule } from '../src/modules/loans/loans.module';
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
  process.env.T42_TEST_DATABASE_URL ?? process.env.SAVINGS_TEST_DATABASE_URL;
const redisUrl = process.env.AUTH_TEST_REDIS_URL;
if (!url || !redisUrl)
  throw new Error('Explicit local dashboard test services required');
type Applications = Awaited<ReturnType<LoanReadsService['applications']>>;
type Repayments = Awaited<ReturnType<LoanReadsService['repayments']>>;
type Schedule = Awaited<ReturnType<LoanReadsService['schedule']>>;
type Queue = Awaited<ReturnType<LoanReadsService['queue']>>;
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
describe('T42 loan foundation — real PostgreSQL, JWT and Redis', () => {
  const original = { ...process.env };
  let app: INestApplication,
    database: PrismaService,
    db: Prisma.TransactionClient,
    redis: RedisService;
  const ids: string[] = [],
    accounts: string[] = [];
  const loanIds: string[] = [],
    applicationIds: string[] = [];
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
        LoansModule,
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
    await app.listen(0, '127.0.0.1');
    await seedMember();
    await seedMember();
    await seedMember('pending');
    for (const memberId of ids.slice(0, 2)) {
      const application = await db.loanApplication.create({
        data: {
          memberId,
          requestedAmount: '100.00',
          requestedTermMonths: 3,
          loanPurpose: 'Synthetic test purpose',
          decisionNotes: 'PRIVATE-NOTE',
          reviewedBy: 'PRIVATE-REVIEWER',
          behaviouralScoreAtApplication: memberId === ids[0] ? '0' : null,
          predictedRepaymentProbability: memberId === ids[0] ? '0' : null,
        },
      });
      applicationIds.push(application.id);
      const account = await db.memberAccount.create({
        data: { memberId, accountNumber: randomUUID(), accountType: 'loan' },
      });
      const loan = await db.loan.create({
        data: {
          memberId,
          applicationId: application.id,
          loanAccountId: account.id,
          principalAmount: '100.00',
          termMonths: 3,
          installmentAmount: '33.33',
          loanStatus: 'active',
          maturityDate: new Date('2027-01-01'),
        },
      });
      loanIds.push(loan.id);
      for (let i = 1; i <= 3; i++)
        await db.repaymentSchedule.create({
          data: {
            loanId: loan.id,
            installmentNumber: i,
            dueDate: new Date('2026-12-01'),
            principalDue: i === 3 ? '33.34' : '33.33',
            totalDue: i === 3 ? '33.34' : '33.33',
          },
        });
      for (let i = 0; i < 25; i++)
        await db.repaymentTransaction.create({
          data: {
            id: `t42-${i.toString().padStart(2, '0')}-${memberId}`,
            loanId: loan.id,
            memberId,
            amountPaid: '0.01',
            paymentDate: new Date('2026-01-01'),
            paymentChannel: 'legacy',
            paymentStatus: 'completed',
            idempotencyKey: `t42-key-${i}-${memberId}`,
          },
        });
    }
  });
  afterAll(async () => {
    try {
      if (db)
        await database.$transaction(async (tx) => {
          await tx.repaymentTransaction.deleteMany({
            where: { memberId: { in: ids } },
          });
          await tx.repaymentSchedule.deleteMany({
            where: { loanId: { in: loanIds } },
          });
          await tx.loan.deleteMany({ where: { memberId: { in: ids } } });
          await tx.loanApplication.deleteMany({
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
  it('requires JWT and isolates discovery, application status, detail, schedule and history', async () => {
    for (const path of [
      '/loans/eligibility',
      '/loans/applications',
      '/loans/mine',
      `/loans/${loanIds[0]}`,
      `/loans/${loanIds[0]}/schedule`,
      `/loans/${loanIds[0]}/repayments`,
      `/loans/applications/${applicationIds[0]}`,
    ]) {
      await http()
        .get('/api/v1' + path)
        .expect(401);
      await http()
        .get('/api/v1' + path)
        .auth('forged', { type: 'bearer' })
        .expect(401);
      const response = await get(path).expect(200);
      expect(response.headers['cache-control']).toContain('private, no-store');
      expect(JSON.stringify(response.body)).not.toMatch(
        /PRIVATE|behaviouralScoreAtApplication|predictedRepaymentProbability|idempotencyKey/,
      );
    }
    expect(
      (
        (await get('/loans/applications').expect(200)).body as Applications
      ).items.map((x: { id: string }) => x.id),
    ).toEqual([applicationIds[0]]);
    expect(
      (
        (await get('/loans/mine').expect(200)).body as Awaited<
          ReturnType<LoanReadsService['loans']>
        >
      ).items.map((x: { id: string }) => x.id),
    ).toEqual([loanIds[0]]);
    expect(
      (
        (await get(`/loans/applications/${applicationIds[0]}`).expect(200))
          .body as Awaited<ReturnType<LoanReadsService['application']>>
      ).loanId,
    ).toBe(loanIds[0]);
    for (const path of [
      `/loans/${loanIds[1]}`,
      `/loans/${loanIds[1]}/schedule`,
      `/loans/${loanIds[1]}/repayments`,
      `/loans/applications/${applicationIds[1]}`,
    ])
      await get(path).expect(404);
    const legacy = await get('/loans/me').expect(200);
    expect(legacy.headers['cache-control']).toContain('private, no-store');
    expect(Array.isArray(legacy.body)).toBe(true);
    expect(legacy.body).toEqual(
      ((await get('/loans/applications').expect(200)).body as Applications)
        .items,
    );
    const eligibility: unknown = (await get('/loans/eligibility').expect(200))
      .body;
    expect(eligibility).toMatchObject({
      savingsPointsTotal: 777,
      currentRiskBand: 'moderate_risk',
      maximumAmount: null,
      applicationCapability: { allowed: false },
    });
  });
  it('paginates tied repayment dates without duplicate or missing rows and rejects foreign cursors', async () => {
    let cursor: string | null = null;
    const seen: string[] = [];
    do {
      const result = (
        await get(
          `/loans/${loanIds[0]}/repayments?limit=4${cursor ? '&cursor=' + cursor : ''}`,
        ).expect(200)
      ).body as Repayments;
      for (const row of result.items) {
        seen.push(row.id);
        expect(row).toMatchObject({
          amountPaid: '0.01',
          paymentStatus: 'completed',
          provenance: 'historical_unknown',
          settlementStatus: 'unverified',
        });
      }
      cursor = result.nextCursor;
      if (cursor)
        await get(
          `/loans/${loanIds[1]}/repayments?limit=4&cursor=${cursor}`,
          ids[1],
        ).expect(400);
    } while (cursor);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    for (const value of ['0', '51', '1x'])
      await get(`/loans/${loanIds[0]}/repayments?limit=${value}`).expect(400);
    await get(`/loans/${loanIds[0]}/repayments?cursor=invalid`).expect(400);
    const schedule = (
      await get(`/loans/${loanIds[0]}/schedule?limit=2`).expect(200)
    ).body as Schedule;
    expect(
      schedule.items.map(
        (x: { installmentNumber: number }) => x.installmentNumber,
      ),
    ).toEqual([1, 2]);
    const rest = (
      await get(
        `/loans/${loanIds[0]}/schedule?limit=2&cursor=${schedule.nextCursor}`,
      ).expect(200)
    ).body as Schedule;
    expect(
      rest.items.map((x: { installmentNumber: number }) => x.installmentNumber),
    ).toEqual([3]);
  });
  it('filters malformed child ownership, ignores member selectors and scopes list cursors', async () => {
    const schedule = await db.repaymentSchedule.findFirstOrThrow({
      where: { loanId: loanIds[1] },
    });
    const malformed = await db.repaymentTransaction.createMany({
      data: [
        {
          loanId: loanIds[0],
          memberId: ids[1],
          amountPaid: '999.00',
          paymentChannel: 'malformed',
        },
        {
          loanId: loanIds[0],
          memberId: ids[0],
          scheduleId: schedule.id,
          amountPaid: '998.00',
          paymentChannel: 'malformed',
        },
      ],
    });
    expect(malformed.count).toBe(2);
    const repayments = (
      await get(`/loans/${loanIds[0]}/repayments?limit=50`).expect(200)
    ).body as Repayments;
    expect(repayments.items).toHaveLength(25);
    expect(
      repayments.items.some(
        (row) => row.amountPaid === '999.00' || row.amountPaid === '998.00',
      ),
    ).toBe(false);
    await db.repaymentTransaction.deleteMany({
      where: { loanId: loanIds[0], paymentChannel: 'malformed' },
    });
    const loans = (await get(`/loans/mine?memberId=${ids[1]}`).expect(200))
      .body as Awaited<ReturnType<LoanReadsService['loans']>>;
    expect(loans.items.map((row) => row.id)).toEqual([loanIds[0]]);
    expect((await get('/loans/mine', ids[2]).expect(200)).body).toMatchObject({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    const original = await db.loanApplication.findUniqueOrThrow({
      where: { id: applicationIds[0] },
    });
    const extra = await db.loanApplication.create({
      data: {
        memberId: ids[0],
        requestedAmount: '50',
        requestedTermMonths: 3,
        loanPurpose: 'pagination',
        applicationDate: original.applicationDate,
      },
    });
    try {
      const first = (await get('/loans/applications?limit=1').expect(200))
        .body as Applications;
      expect(first.hasMore).toBe(true);
      const second = (
        await get(
          '/loans/applications?limit=1&cursor=' + first.nextCursor,
        ).expect(200)
      ).body as Applications;
      expect(
        new Set([...first.items, ...second.items].map((row) => row.id)).size,
      ).toBe(2);
      await get(
        '/loans/applications?cursor=' + first.nextCursor,
        ids[1],
      ).expect(400);
    } finally {
      await db.loanApplication.delete({ where: { id: extra.id } });
    }
  });
  it('never returns legacy replays or writes for cross-member, changed-payload and concurrent requests', async () => {
    const before = await db.repaymentTransaction.count({
      where: { loanId: { in: loanIds } },
    });
    const key = `t42-key-0-${ids[1]}`;
    const post = (loanId: string, amount: number, memberId = ids[0]) =>
      http()
        .post(`/api/v1/loans/${loanId}/repay`)
        .auth(token(memberId), { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send({ amount });
    await post(loanIds[1], 1).expect(404);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => post(loanIds[0], i + 1).expect(403)),
    );
    await post(loanIds[1], 0.01, ids[1]).expect(403);
    expect(
      await db.repaymentTransaction.count({
        where: { loanId: { in: loanIds } },
      }),
    ).toBe(before);
    expect(
      (
        await db.repaymentSchedule.findMany({
          where: { loanId: { in: loanIds } },
        })
      ).every((row) => row.totalPaid.toFixed(2) === '0.00'),
    ).toBe(true);
    for (const env of ['test', 'development', 'staging', 'production']) {
      process.env.NODE_ENV = env;
      process.env.T42_SIMULATION_ENABLED = 'true';
      await post(loanIds[0], 1).expect(403);
      await http()
        .post('/api/v1/loans/apply')
        .auth(token(), { type: 'bearer' })
        .send({
          requestedAmount: 50,
          requestedTermMonths: 3,
          loanPurpose: 'test',
        })
        .expect(403);
    }
    process.env.NODE_ENV = 'test';
    expect(
      await db.loanApplication.count({ where: { memberId: { in: ids } } }),
    ).toBe(2);
  });
  it('authorizes Staff/Admin queue reads, preserves real zero/null snapshots and denies decisions', async () => {
    await get('/loans/admin/queue').expect(403);
    await db.member.update({ where: { id: ids[0] }, data: { isAdmin: true } });
    const response = await get('/loans/admin/queue?limit=1').expect(200);
    expect(response.headers['cache-control']).toContain('no-store');
    const all = ((await get('/loans/admin/queue').expect(200)).body as Queue)
      .items;
    expect(
      all.find((x: { id: string }) => x.id === applicationIds[0]),
    ).toMatchObject({
      behaviouralScoreAtApplication: '0',
      predictedRepaymentProbability: '0',
    });
    expect(
      all.find((x: { id: string }) => x.id === applicationIds[1]),
    ).toMatchObject({
      behaviouralScoreAtApplication: null,
      predictedRepaymentProbability: null,
    });
    for (const action of ['approve', 'reject'])
      await http()
        .patch(`/api/v1/loans/admin/${applicationIds[0]}/${action}`)
        .auth(token(), { type: 'bearer' })
        .send({ decisionNotes: 'test' })
        .expect(403);
    await db.member.update({ where: { id: ids[0] }, data: { isAdmin: false } });
    await get('/loans/admin/queue').expect(403);
    const staff = new JwtService({ secret }).sign(
      { sub: ids[0], email: 'staff@example.invalid', role: 'staff' },
      { expiresIn: '15m' },
    );
    await http()
      .get('/api/v1/loans/admin/queue')
      .auth(staff, { type: 'bearer' })
      .expect(200);
  });
  it('preserves every fixture financial/approval row and pg-boss job during direct HTTP denial', async () => {
    await db.member.update({ where: { id: ids[0] }, data: { isAdmin: true } });
    const snapshot = async () =>
      JSON.stringify(
        await database.$transaction(
          async (tx) => ({
            members: await tx.member.findMany({
              where: { id: { in: ids } },
              orderBy: { id: 'asc' },
              select: {
                id: true,
                savingsPointsTotal: true,
                currentRiskBand: true,
                membershipStatus: true,
              },
            }),
            accounts: await tx.memberAccount.findMany({
              where: { memberId: { in: ids } },
              orderBy: { id: 'asc' },
            }),
            applications: await tx.loanApplication.findMany({
              where: { memberId: { in: ids } },
              orderBy: { id: 'asc' },
            }),
            loans: await tx.loan.findMany({
              where: { memberId: { in: ids } },
              orderBy: { id: 'asc' },
            }),
            schedules: await tx.repaymentSchedule.findMany({
              where: { loanId: { in: loanIds } },
              orderBy: { id: 'asc' },
            }),
            repayments: await tx.repaymentTransaction.findMany({
              where: { memberId: { in: ids } },
              orderBy: { id: 'asc' },
            }),
            savings: await tx.savingsTransaction.findMany({
              where: { memberId: { in: ids } },
              orderBy: { id: 'asc' },
            }),
            withdrawals: await tx.withdrawalTransaction.findMany({
              where: { memberId: { in: ids } },
              orderBy: { id: 'asc' },
            }),
            reminders: await tx.reminderLog.findMany({
              where: { memberId: { in: ids } },
              orderBy: { id: 'asc' },
            }),
            audit: await tx.auditLog.findMany({
              where: { changedBy: { in: ids } },
              orderBy: { id: 'asc' },
            }),
            reminderJobs:
              await tx.$queryRaw`SELECT to_jsonb(j) AS row FROM t36_jobs.job j ORDER BY id`,
            paymentJobs:
              await tx.$queryRaw`SELECT to_jsonb(j) AS row FROM t38_jobs.job j ORDER BY id`,
          }),
          { isolationLevel: 'RepeatableRead' },
        ),
      );
    try {
      const before = await snapshot();
      await http()
        .post('/api/v1/loans/apply')
        .auth(token(), { type: 'bearer' })
        .send({
          requestedAmount: 50,
          requestedTermMonths: 3,
          loanPurpose: 'must not persist',
        })
        .expect(403);
      await http()
        .post(`/api/v1/loans/${loanIds[0]}/repay`)
        .auth(token(), { type: 'bearer' })
        .set('Idempotency-Key', 'preservation-key')
        .send({ amount: 1 })
        .expect(403);
      for (const action of ['approve', 'reject'])
        await http()
          .patch(`/api/v1/loans/admin/${applicationIds[0]}/${action}`)
          .auth(token(), { type: 'bearer' })
          .send({ decisionNotes: 'must not persist' })
          .expect(403);
      // No registered disbursement endpoint exists. Test plausible direct paths as well.
      await http()
        .post(`/api/v1/loans/${loanIds[0]}/disburse`)
        .auth(token(), { type: 'bearer' })
        .send({ amount: 100 })
        .expect(404);
      await http()
        .patch(`/api/v1/loans/admin/${loanIds[0]}/disburse`)
        .auth(token(), { type: 'bearer' })
        .send({ amount: 100 })
        .expect(404);
      expect(await snapshot()).toBe(before);
    } finally {
      await db.member.update({
        where: { id: ids[0] },
        data: { isAdmin: false },
      });
    }
  });
});
