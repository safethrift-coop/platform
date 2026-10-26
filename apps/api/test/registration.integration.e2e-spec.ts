import { configureRegistrationBody } from '../src/modules/membership/registration/registration-body';
import { Test } from '@nestjs/testing';
import { ValidationPipe, Logger, type INestApplication } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { DatabaseModule } from '../src/core/database/database.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { LoggerModule } from '../src/core/logger/logger.module';
import { RedisModule } from '../src/core/redis/redis.module';
import { RedisService } from '../src/core/redis/redis.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { MembershipModule } from '../src/modules/membership/membership.module';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { DEVELOPMENT_CONTENT_VERSION } from '../src/modules/membership/registration/registration.config';
import { GlobalExceptionFilter } from '../src/core/filters/global-exception.filter';
const databaseUrl = process.env.T40_TEST_DATABASE_URL;
const redisUrl = process.env.AUTH_TEST_REDIS_URL;
if (!databaseUrl || !redisUrl)
  throw new Error(
    'Explicit T40_TEST_DATABASE_URL and AUTH_TEST_REDIS_URL required',
  );
const parsed = new URL(databaseUrl),
  redisParsed = new URL(redisUrl);
const local = (host: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(host);
if (
  process.env.NODE_ENV !== 'test' ||
  !local(parsed.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname) ||
  !local(redisParsed.hostname) ||
  redisParsed.protocol !== 'redis:'
)
  throw new Error('Refusing nonlocal/non-test services');
jest.setTimeout(30000);
type Db = Prisma.TransactionClient;
type Receipt = {
  applicationId: string;
  submissionId: string;
  submittedAt: string;
  developmentFixture: boolean;
};
const personal = {
  firstName: 'Fixture',
  lastName: 'Only',
  dateOfBirth: '1990-01-01',
  phoneNumber: '+447911123456',
  addressLine1: 'Test street',
  addressLine2: '',
  city: 'Test city',
  postcode: 'SW1A 1AA',
};
const password = 'Fixture@1234';
const body = (patch: Record<string, unknown> = {}) => ({
  personalDetails: personal,
  membershipType: 'individual',
  householdMembers: [],
  occupation: 'Test only',
  referralSource: 'Fixture',
  whyJoining: 'Test',
  declarations: [false, true, false, true],
  contentVersion: DEVELOPMENT_CONTENT_VERSION,
  signatureText: 'Fixture Only',
  signedDate: new Date().toISOString().slice(0, 10),
  preferredPaymentMethod: 'bank_transfer',
  ...patch,
});
describe('T40 account → verification → application — real PostgreSQL and Redis', () => {
  let app: INestApplication,
    database: PrismaService,
    db: Db,
    redis: RedisService;
  const original = { ...process.env },
    members: string[] = [],
    verification = new Map<string, string>();
  const http = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const lookup = (id: string) =>
    db.membershipApplicationSubmission.findUnique({ where: { memberId: id } });
  const cookie = (response: request.Response) =>
    (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  async function account(verify = true) {
    const email = randomUUID() + '@example.invalid';
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ ...personal, email, password })
      .expect(201);
    const id = (res.body as { memberId: string }).memberId;
    members.push(id);
    if (verify)
      await http()
        .post('/api/v1/auth/verify-email')
        .send({ token: verification.get(email) })
        .expect(200);
    return { id, email };
  }
  async function login(email: string) {
    return http()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
  }
  const token = (response: request.Response) =>
    (response.body as { accessToken: string }).accessToken;
  const apply = (access: string, key = randomUUID(), data = body()) =>
    http()
      .post('/api/v1/membership/apply')
      .auth(access, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(data);
  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      T40_FIXTURE_MODE: 'true',
      T40_APPLICATIONS_ENABLED: 'false',
      JWT_SECRET: 't40-test-secret-at-least-32-characters-long',
      REDIS_HOST: redisParsed.hostname,
      REDIS_PORT: redisParsed.port || '6379',
      REDIS_PASSWORD: decodeURIComponent(redisParsed.password),
      RESEND_API_KEY: 're_test_not_live',
      T36_JOBS_ENABLED: 'false',
      T38_WEBHOOKS_ENABLED: 'false',
    });
    jest.spyOn(axios, 'get').mockResolvedValue({ data: 'NO_MATCH:0\n' });
    database = new PrismaService();
    await database.onModuleInit();
    // Transaction delegates use the root client through short explicit transactions below.
    const fixture = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        LoggerModule,
        RedisModule,
        NotificationsModule,
        ThrottlerModule.forRoot([{ name: 'short', ttl: 60000, limit: 100 }]),
        AuthModule,
        MembershipModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(database)
      .overrideProvider(NotificationsService)
      .useValue({
        sendVerificationEmail: (email: string, _name: string, code: string) => {
          verification.set(email, code);
        },
        sendMembershipApproved: jest.fn(),
        sendMembershipRejected: jest.fn(),
      })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    redis = fixture.get(RedisService);
    app = fixture.createNestApplication({ logger: false });
    configureRegistrationBody(app);
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
    // Root delegate access without using a closed Prisma interactive transaction.
    db = new Proxy({} as Db, {
      get(_target, name) {
        return new Proxy(
          {},
          {
            get(_model, method) {
              return (args: unknown) =>
                database.$transaction((tx) =>
                  (
                    tx[name as keyof Db] as unknown as Record<
                      string,
                      (args: unknown) => Promise<unknown>
                    >
                  )[String(method)](args),
                );
            },
          },
        );
      },
    });
  });
  afterAll(async () => {
    if (database) {
      await database.$transaction(async (tx) => {
        const rows = await tx.membershipApplicationSubmission.findMany({
          where: { memberId: { in: members } },
        });
        await tx.auditLog.deleteMany({
          where: { recordId: { in: rows.map((row) => row.id) } },
        });
        await tx.membershipApplicationSubmission.deleteMany({
          where: { memberId: { in: members } },
        });
        await tx.memberRegistration.deleteMany({
          where: { memberId: { in: members } },
        });
        await tx.member.deleteMany({ where: { id: { in: members } } });
      });
    }
    if (redis) {
      for (const id of members) await redis.del('refresh:' + id);
      for (const code of verification.values())
        await redis.del('email_verify:' + code);
    }
    if (app) await app.close();
    if (database) await database.onModuleDestroy();
    jest.restoreAllMocks();
    process.env = original;
  });
  it('creates an unverified account without a membership registration, application, fee or financial account', async () => {
    const a = await account(false);
    expect(
      await db.memberRegistration.count({ where: { memberId: a.id } }),
    ).toBe(0);
    expect(await lookup(a.id)).toBeNull();
    expect(await db.memberAccount.count({ where: { memberId: a.id } })).toBe(0);
    const member = await db.member.findUniqueOrThrow({ where: { id: a.id } });
    expect(member.membershipStatus).toBe('pending');
    expect(member.emailVerified).toBe(false);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: a.email, password })
      .expect(401);
    const forgedSession = new JwtService().sign(
      { sub: a.id, email: a.email, role: 'member' },
      { secret: process.env.JWT_SECRET },
    );
    await apply(forgedSession).expect(403);
  });
  it('rejects malformed and oversized personal-data requests before global error logging', async () => {
    const spy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await http()
        .post('/api/v1/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"password":"synthetic-do-not-log"')
        .expect(400);
      await http()
        .post('/api/v1/auth/register')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ password: 'x'.repeat(33000) }))
        .expect(413);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('requires verification in the body, consumes its code and authenticates only afterward', async () => {
    const a = await account(false),
      code = verification.get(a.email);
    await http()
      .post('/api/v1/auth/verify-email')
      .send({ token: randomUUID() })
      .expect(400);
    await http()
      .post('/api/v1/auth/verify-email')
      .send({ token: code })
      .expect(200);
    await http()
      .post('/api/v1/auth/verify-email')
      .send({ token: code })
      .expect(400);
    const session = await login(a.email);
    expect(cookie(session)).toMatch(/^refresh_token=/);
    const context = await http()
      .get('/api/v1/membership/application')
      .auth(token(session), { type: 'bearer' })
      .expect(200);
    expect((context.body as { state: string }).state).toBe('not_submitted');
    expect(context.headers['cache-control']).toBe('no-store');
  });
  it('records an individual application with a replay-safe receipt and no invented legal acceptance or fees', async () => {
    const a = await account(),
      session = await login(a.email),
      key = randomUUID();
    const first = await apply(token(session), key).expect(201),
      replay = await apply(token(session), key).expect(201);
    expect(replay.body).toEqual(first.body);
    const stored = await lookup(a.id);
    expect(stored?.contentVersion).toBe(DEVELOPMENT_CONTENT_VERSION);
    const registration = await db.memberRegistration.findUniqueOrThrow({
      where: { id: (first.body as Receipt).applicationId },
    });
    expect(registration.membershipFeeAmount).toBeNull();
    expect(registration.membershipFeePaid).toBe(false);
    expect(registration.termsAccepted).toBe(false);
    expect(registration.termsAcceptedAt).toBeNull();
    expect(registration.consentCreditAssessAt).toBeNull();
    expect(await db.memberAccount.count({ where: { memberId: a.id } })).toBe(0);
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: a.id } }))
        .membershipStatus,
    ).toBe('pending');
    const context = await http()
      .get('/api/v1/membership/application')
      .auth(token(session), { type: 'bearer' })
      .expect(200);
    expect((context.body as { receipt: Receipt }).receipt).toMatchObject(
      first.body as Receipt,
    );
  });
  it('stores conditional family details and rejects household data on the individual path', async () => {
    const a = await account(),
      session = await login(a.email);
    await apply(
      token(session),
      randomUUID(),
      body({ membershipType: 'family' }),
    ).expect(400);
    const household = [
      { fullName: 'Synthetic Child', dateOfBirth: '2018-02-01' },
    ];
    await apply(
      token(session),
      randomUUID(),
      body({ householdMembers: household }),
    ).expect(400);
    const response = await apply(
      token(session),
      randomUUID(),
      body({ membershipType: 'family', householdMembers: household }),
    ).expect(201);
    const row = await db.memberRegistration.findUniqueOrThrow({
      where: { id: (response.body as Receipt).applicationId },
    });
    expect(JSON.parse(row.householdMembersJson!)).toEqual(household);
  });
  it('serializes concurrent identical and distinct-key submissions, scoped independently per member', async () => {
    const a = await account(),
      session = await login(a.email),
      key = randomUUID();
    const responses = await Promise.all([
      apply(token(session), key),
      apply(token(session), key),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(
      await db.memberRegistration.count({ where: { memberId: a.id } }),
    ).toBe(1);
    await apply(
      token(session),
      key,
      body({ whyJoining: 'Different fixture' }),
    ).expect(409);
    await apply(token(session), randomUUID()).expect(409);
    const b = await account(),
      other = await login(b.email);
    await apply(token(other), key).expect(201);
    const c = await account(),
      third = await login(c.email);
    const competing = await Promise.all([
      apply(token(third)),
      apply(token(third)),
    ]);
    expect(competing.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it('preserves historical registrations and inactive member states without inferring submission', async () => {
    const a = await account(),
      session = await login(a.email);
    await db.memberRegistration.create({
      data: { memberId: a.id, registrationChannel: 'web_portal' },
    });
    await apply(token(session)).expect(409);
    expect(await lookup(a.id)).toBeNull();
    const b = await account(),
      other = await login(b.email);
    for (const membershipStatus of ['active', 'suspended', 'closed'] as const) {
      await db.member.update({
        where: { id: b.id },
        data: { membershipStatus },
      });
      expect([401, 403]).toContain((await apply(token(other))).status);
    }
  });
  it('fails closed without fixture mode, for real addresses, and for wrong content or extra payment fields', async () => {
    const a = await account(),
      session = await login(a.email);
    process.env.T40_FIXTURE_MODE = 'false';
    try {
      await apply(token(session)).expect(403);
      await http()
        .post('/api/v1/auth/register')
        .send({
          ...personal,
          email: randomUUID() + '@example.invalid',
          password,
        })
        .expect(403);
    } finally {
      process.env.T40_FIXTURE_MODE = 'true';
    }
    await http()
      .post('/api/v1/auth/register')
      .send({ ...personal, email: randomUUID() + '@example.com', password })
      .expect(403);
    for (const patch of [
      { contentVersion: 'approved' },
      { cardNumber: '1234' },
      { membershipFeePaid: true },
      { personalDetails: { ...personal, firstName: 42 } },
    ])
      await apply(token(session), randomUUID(), body(patch)).expect(400);
    await http().post('/api/v1/membership/apply').send(body()).expect(401);
  });
  it('rolls back registration, identity and receipt when audit persistence fails', async () => {
    const a = await account(),
      session = await login(a.email),
      originalTransaction = database.$transaction.bind(database);
    database.$transaction = ((
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: Parameters<PrismaService['$transaction']>[1],
    ) =>
      originalTransaction(
        (tx) =>
          fn(
            new Proxy(tx, {
              get(target, name) {
                if (name !== 'auditLog')
                  return Reflect.get(target, name) as unknown;
                return {
                  create: () => {
                    throw new Error('fixture audit unavailable');
                  },
                };
              },
            }),
          ),
        options,
      )) as PrismaService['$transaction'];
    try {
      await apply(token(session)).expect(503);
    } finally {
      database.$transaction = originalTransaction;
    }
    expect(await lookup(a.id)).toBeNull();
    expect(
      await db.memberRegistration.count({ where: { memberId: a.id } }),
    ).toBe(0);
  });
  it('keeps the T37 cookie rotation/member locator contract and rejects replay', async () => {
    const a = await account(),
      session = await login(a.email),
      oldCookie = cookie(session);
    const refresh = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)
      .send({ memberId: a.id })
      .expect(200);
    expect(cookie(refresh)).not.toBe(oldCookie);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)
      .send({ memberId: a.id })
      .expect(401);
    await apply(token(refresh)).expect(201);
  });
  it('never changes financial tables or activates T38 for a submitted fixture', async () => {
    const a = await account(),
      session = await login(a.email);
    await apply(token(session)).expect(201);
    const counts = await database.$transaction((tx) =>
      Promise.all([
        tx.memberAccount.count({ where: { memberId: a.id } }),
        tx.savingsTransaction.count({ where: { memberId: a.id } }),
        tx.withdrawalTransaction.count({ where: { memberId: a.id } }),
        tx.repaymentTransaction.count({ where: { memberId: a.id } }),
        tx.memberShare.count({ where: { memberId: a.id } }),
      ]),
    );
    for (const count of counts) expect(count).toBe(0);
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: a.id } }))
        .savingsPointsTotal,
    ).toBe(0);
    expect(process.env.T38_WEBHOOKS_ENABLED).toBe('false');
  });
});
