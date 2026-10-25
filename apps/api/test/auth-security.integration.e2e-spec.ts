import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import axios from 'axios';
import { DatabaseModule } from '../src/core/database/database.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { RedisModule } from '../src/core/redis/redis.module';
import { RedisService } from '../src/core/redis/redis.service';
import { LoggerModule } from '../src/core/logger/logger.module';
import { MembersModule } from '../src/modules/members/members.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';

// Explicit test-only endpoints; no dotenv/application fallback and no Redis flush.
const databaseUrl = process.env.GOVERNANCE_TEST_DATABASE_URL;
const redisUrl = process.env.AUTH_TEST_REDIS_URL;
if (!databaseUrl || !redisUrl)
  throw new Error(
    'Explicit GOVERNANCE_TEST_DATABASE_URL and AUTH_TEST_REDIS_URL are required',
  );
const parsedDb = new URL(databaseUrl);
const parsedRedis = new URL(redisUrl);
const local = (host: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(host);
if (
  process.env.NODE_ENV !== 'test' ||
  !local(parsedDb.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsedDb.pathname) ||
  !local(parsedRedis.hostname) ||
  parsedRedis.protocol !== 'redis:' ||
  !['', '/', '/0'].includes(parsedRedis.pathname)
)
  throw new Error('Refusing non-local/non-test services');

// Real bcrypt cost 12 plus network/database I/O can exceed Jest's 5s default.
jest.setTimeout(15000);

describe('Authentication — real PostgreSQL, Redis, JWT and bcrypt', () => {
  let app: INestApplication;
  let database: PrismaService;
  let db: Pick<Prisma.TransactionClient, 'member'>;
  let auth: AuthService;
  let redis: RedisService;
  let inspection: Redis;
  let member: string;
  let other: string;
  let passwordHash: string;
  const members: string[] = [];
  const resetKeys: string[] = [];
  const originalEnv = { ...process.env };
  const password = 'Test-password-t37-security';
  const key = (id = member) => `refresh:${id}`;
  const http = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const claims = (token: string) =>
    new JwtService().decode<{ sub: string; role: string }>(token);
  const login = async (id = member) => {
    const row = await db.member.findUniqueOrThrow({ where: { id } });
    const profile = await auth.validateMember(row.email, password);
    if (!profile) throw new Error('Fixture login failed');
    return auth.login(profile);
  };
  const cookie = (res: request.Response) => {
    const headers = res.headers['set-cookie'] as unknown as string[];
    return headers[0].split(';')[0];
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET =
      't37-auth-integration-secret-at-least-32-characters';
    process.env.REDIS_HOST = parsedRedis.hostname;
    process.env.REDIS_PORT = parsedRedis.port || '6379';
    process.env.REDIS_PASSWORD = decodeURIComponent(parsedRedis.password);
    process.env.RESEND_API_KEY = 're_test_not_a_live_key';
    database = new PrismaService();
    db = database;
    await database.onModuleInit();
    const fixture = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        LoggerModule,
        RedisModule,
        NotificationsModule,
        ThrottlerModule.forRoot([{ name: 'short', ttl: 60000, limit: 100 }]),
        AuthModule,
        MembersModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(database)
      // Throttle quotas are outside this suite; JWT/local authentication is real.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    auth = fixture.get(AuthService);
    redis = fixture.get(RedisService);
    app = fixture.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    inspection = new Redis(redisUrl);
    await inspection.ping();
    passwordHash = await bcrypt.hash(password, 12);
  });
  beforeEach(async () => {
    const create = async () => {
      const id = randomUUID();
      await db.member.create({
        data: {
          id,
          membershipNumber: `T37-AUTH-${id}`,
          email: `${id}@example.invalid`,
          firstName: 'Test',
          lastName: 'Member',
          dateOfBirth: new Date('1990-01-01'),
          phoneNumber: '0000',
          addressLine1: 'Test',
          city: 'Test',
          postcode: 'TEST',
          passwordHash,
          membershipStatus: 'active',
          emailVerified: true,
        },
      });
      members.push(id);
      return id;
    };
    member = await create();
    other = await create();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (inspection) {
      for (const id of members) await inspection.del(key(id));
      for (const resetKey of resetKeys) await inspection.del(resetKey);
      await inspection.quit();
    }
    if (db) await db.member.deleteMany({ where: { id: { in: members } } });
    if (app) await app.close();
    if (database) await database.onModuleDestroy();
    process.env = originalEnv;
  });

  it('corrects the HTTP member locator/cookie contract and rotates body fallback tokens', async () => {
    const row = await db.member.findUniqueOrThrow({ where: { id: member } });
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ email: row.email, password })
      .expect(200);
    const originalCookie = cookie(response);
    const secret = decodeURIComponent(originalCookie.split('=')[1]);
    const stored = await inspection.get(key());
    expect(stored).not.toBe(secret);
    expect(await bcrypt.compare(secret, stored!)).toBe(true);
    expect(await inspection.ttl(key())).toBeGreaterThan(604700);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('HttpOnly'),
        expect.stringContaining('SameSite=Strict'),
      ]),
    );
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .send({ memberId: member })
      .expect(200);
    expect(
      (refreshed.body as { accessToken: string }).accessToken,
    ).toBeDefined();
    expect(cookie(refreshed)).not.toBe(originalCookie);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .send({ memberId: member })
      .expect(401);
    const replacement = decodeURIComponent(cookie(refreshed).split('=')[1]);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ memberId: member, refreshToken: replacement })
      .expect(200);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ memberId: member })
      .expect(401);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ memberId: member, refreshToken: randomUUID(), role: 'admin' })
      .expect(400);
  });

  it('rejects client attempts to grant administrative authority at registration or profile update', async () => {
    const registration = await http()
      .post('/api/v1/auth/register')
      .send({ isAdmin: true, role: 'admin' })
      .expect(400);
    expect((registration.body as { message: string[] }).message).toEqual(
      expect.arrayContaining([
        'property isAdmin should not exist',
        'property role should not exist',
      ]),
    );
    const session = await login();
    await http()
      .patch('/api/v1/members/me')
      .auth(session.accessToken, { type: 'bearer' })
      .send({ isAdmin: true })
      .expect(400);
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: member } })).isAdmin,
    ).toBe(false);
  });

  it('rejects invalid and cross-member secrets without revoking either valid session', async () => {
    const a = await login();
    const b = await login(other);
    const beforeA = await inspection.get(key());
    const beforeB = await inspection.get(key(other));
    for (const [id, secret] of [
      [member, randomUUID()],
      [other, a.refreshToken],
      [member, b.refreshToken],
      [randomUUID(), a.refreshToken],
    ])
      await expect(auth.refresh(id, secret)).rejects.toThrow(
        'Invalid or expired',
      );
    expect(await inspection.get(key())).toBe(beforeA);
    expect(await inspection.get(key(other))).toBe(beforeB);
    await expect(auth.refresh(member, a.refreshToken)).resolves.toHaveProperty(
      'accessToken',
    );
    await expect(auth.refresh(other, b.refreshToken)).resolves.toHaveProperty(
      'accessToken',
    );
  });

  it('allows exactly one concurrent refresh of the same old secret and rejects replay', async () => {
    const initial = await login();
    const originalGet = redis.get.bind(redis);
    let remaining = 2;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(redis, 'get').mockImplementation(async (requestedKey) => {
      const value = await originalGet(requestedKey);
      if (requestedKey === key() && remaining > 0) {
        remaining--;
        if (remaining === 0) release();
        await gate;
      }
      return value;
    });
    const results = await Promise.allSettled([
      auth.refresh(member, initial.refreshToken),
      auth.refresh(member, initial.refreshToken),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const winner = results.find(
      (result) => result.status === 'fulfilled',
    ) as PromiseFulfilledResult<{ refreshToken: string }>;
    await expect(auth.refresh(member, initial.refreshToken)).rejects.toThrow(
      'Invalid or expired',
    );
    await expect(
      auth.refresh(member, winner.value.refreshToken),
    ).resolves.toHaveProperty('accessToken');
  });

  it('reflects promotion and revocation at both login and refresh', async () => {
    let session = await login();
    expect(claims(session.accessToken).role).toBe('member');
    for (const isAdmin of [true, false]) {
      await db.member.update({ where: { id: member }, data: { isAdmin } });
      session = await auth.refresh(member, session.refreshToken);
      expect(claims(session.accessToken)).toMatchObject({
        sub: member,
        role: isAdmin ? 'admin' : 'member',
      });
      session = await login();
      expect(claims(session.accessToken).role).toBe(
        isAdmin ? 'admin' : 'member',
      );
    }
  });

  it('preserves logout revocation and cannot resurrect a session when logout wins before rotation', async () => {
    const session = await login();
    const original = redis.compareAndSwap.bind(redis);
    jest.spyOn(redis, 'compareAndSwap').mockImplementation(async (...args) => {
      await auth.logout(member);
      return original(...args);
    });
    await expect(auth.refresh(member, session.refreshToken)).rejects.toThrow(
      'Invalid or expired',
    );
    expect(await inspection.get(key())).toBeNull();
    jest.restoreAllMocks();
    const next = await login();
    await http()
      .post('/api/v1/auth/logout')
      .auth(next.accessToken, { type: 'bearer' })
      .expect(200);
    await expect(auth.refresh(member, next.refreshToken)).rejects.toThrow(
      'Invalid or expired',
    );
  });

  it('preserves password-reset refresh revocation and rejects expired sessions', async () => {
    const session = await login();
    const resetToken = randomUUID();
    resetKeys.push(`pwd_reset:${resetToken}`);
    await inspection.set(`pwd_reset:${resetToken}`, member, 'EX', 60);
    // Only the external breached-password lookup is stubbed; hashing/DB/Redis are real.
    jest.spyOn(axios, 'get').mockResolvedValue({ data: '' });
    await auth.resetPassword(resetToken, 'New-test-password-for-T37');
    expect(await inspection.get(key())).toBeNull();
    expect(await inspection.get(`pwd_reset:${resetToken}`)).toBeNull();
    await expect(auth.refresh(member, session.refreshToken)).rejects.toThrow(
      'Invalid or expired',
    );
    const another = await login(other);
    await inspection.expire(key(other), 0);
    await expect(auth.refresh(other, another.refreshToken)).rejects.toThrow(
      'Invalid or expired',
    );
  });

  it.each([
    { membershipStatus: 'suspended' as const },
    { membershipStatus: 'closed' as const },
    { emailVerified: false },
  ])(
    'denies member state %j and invalidates only its proven session',
    async (data) => {
      const session = await login();
      await db.member.update({ where: { id: member }, data });
      await expect(auth.refresh(member, session.refreshToken)).rejects.toThrow(
        'Invalid or expired',
      );
      expect(await inspection.get(key())).toBeNull();
    },
  );
});
