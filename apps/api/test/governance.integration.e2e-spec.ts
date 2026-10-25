import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { GovernanceModule } from '../src/modules/governance/governance.module';
import { DatabaseModule } from '../src/core/database/database.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { JwtStrategy } from '../src/core/strategies/jwt.strategy';

// Never load dotenv or fall back to application credentials.
const testUrl = process.env.GOVERNANCE_TEST_DATABASE_URL;
if (!testUrl)
  throw new Error(
    'GOVERNANCE_TEST_DATABASE_URL must name an isolated PostgreSQL test database',
  );
const parsed = new URL(testUrl);
if (
  process.env.NODE_ENV !== 'test' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname)
)
  throw new Error('Refusing non-local/non-test PostgreSQL database');

type Database = Pick<
  Prisma.TransactionClient,
  | 'member'
  | 'memberShare'
  | 'group'
  | 'groupMembership'
  | 'auditLog'
  | 'memberAccount'
  | 'savingsTransaction'
  | 'withdrawalTransaction'
  | 'loan'
>;
type GroupResult = {
  id: string;
  memberships: { id: string; status: string; roleInGroup: string }[];
};
type Page<T> = { page: number; limit: number; items: T[] };

describe('Governance — HTTP and real PostgreSQL', () => {
  let database: PrismaService;
  let db: Database;
  let app: INestApplication;
  let member: string;
  let other: string;
  let forming: string;
  let active: string;
  let dissolved: string;
  const members: string[] = [];
  const groups: string[] = [];
  const previousUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.JWT_SECRET;
  const secret = 't37-test-only-secret-with-at-least-32-characters';
  const token = (
    id = member,
    options: { secret?: string; expiresIn?: number } = {},
  ) =>
    new JwtService().sign(
      { sub: id, email: 'test@example.invalid', role: 'member' },
      { secret: options.secret ?? secret, expiresIn: options.expiresIn ?? 300 },
    );
  const http = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const join = (groupId = forming, memberId = member) =>
    http()
      .post(`/api/v1/groups/${groupId}/join`)
      .auth(token(memberId), { type: 'bearer' })
      .send({});

  async function createMember(
    status: 'active' | 'pending' | 'closed' | 'suspended' = 'active',
  ) {
    const id = randomUUID();
    const row = await db.member.create({
      data: {
        id,
        membershipNumber: `T37-${id}`,
        email: `${id}@example.invalid`,
        firstName: 'Test',
        lastName: 'Member',
        dateOfBirth: new Date('1990-01-01'),
        phoneNumber: '0000000000',
        addressLine1: 'Test',
        city: 'Test',
        postcode: 'TEST',
        passwordHash: 'not-a-real-password',
        membershipStatus: status,
        emailVerified: true,
      },
    });
    members.push(row.id);
    return row.id;
  }
  async function createGroup(
    status: 'forming' | 'active' | 'dissolved' = 'forming',
  ) {
    const row = await db.group.create({
      data: {
        groupName: `T37-${randomUUID()}`,
        groupType: 'community_investment_circle',
        status,
        description: 'Test metadata',
        targetAmount: '123.45',
      },
    });
    groups.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    process.env.JWT_SECRET = secret;
    database = new PrismaService();
    db = database;
    await database.onModuleInit();
    const fixture = await Test.createTestingModule({
      imports: [DatabaseModule, PassportModule, GovernanceModule],
      providers: [JwtStrategy],
    })
      .overrideProvider(PrismaService)
      .useValue(database)
      .compile();
    app = fixture.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(async () => {
    member = await createMember();
    other = await createMember();
    forming = await createGroup();
    active = await createGroup('active');
    dissolved = await createGroup('dissolved');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (db) {
      await db.auditLog.deleteMany({ where: { changedBy: { in: members } } });
      await db.groupMembership.deleteMany({
        where: { memberId: { in: members } },
      });
      await db.memberShare.deleteMany({ where: { memberId: { in: members } } });
      await db.group.deleteMany({ where: { id: { in: groups } } });
      await db.member.deleteMany({ where: { id: { in: members } } });
    }
    if (app) await app.close();
    if (database) await database.onModuleDestroy();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it('authenticates every route using the real JWT strategy', async () => {
    for (const path of [
      '/shares/me',
      '/groups',
      `/groups/${forming}`,
      `/groups/${forming}/join`,
    ]) {
      const send = () =>
        path.endsWith('/join')
          ? http().post(`/api/v1${path}`).send({})
          : http().get(`/api/v1${path}`);
      await send().expect(401);
      for (const bearer of [
        'invalid',
        token(member, { secret: 'wrong-secret' }),
        token(member, { expiresIn: -1 }),
      ])
        await send().auth(bearer, { type: 'bearer' }).expect(401);
      await send().auth(token(randomUUID()), { type: 'bearer' }).expect(401);
    }
  });

  it('isolates share ownership, serializes exact values and paginates deterministically', async () => {
    const stamp = new Date('2026-01-01');
    for (const [id, memberId] of [
      ['share-a', member],
      ['share-b', member],
      ['share-c', other],
    ]) {
      await db.memberShare.create({
        data: {
          id: `${member}-${id}`,
          memberId,
          numberOfShares: 2,
          shareValue: '1.23',
          totalShareValue: '2.46',
          createdAt: stamp,
        },
      });
    }
    const response = await http()
      .get('/api/v1/shares/me?limit=1')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    const first = response.body as Page<{
      id: string;
      shareValue: string;
      totalShareValue: string;
    }>;
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      id: `${member}-share-a`,
      shareValue: '1.23',
      totalShareValue: '2.46',
    });
    const next = await http()
      .get('/api/v1/shares/me?limit=1&page=2')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect((next.body as typeof first).items[0].id).toBe(`${member}-share-b`);
    const empty = await http()
      .get('/api/v1/shares/me?page=3&limit=1')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect((empty.body as typeof first).items).toEqual([]);
  });

  it('returns only safe group metadata and the caller membership, with stable pagination', async () => {
    await join().expect(201);
    await join(forming, other).expect(201);
    const detail = await http()
      .get(`/api/v1/groups/${forming}`)
      .auth(token(), { type: 'bearer' })
      .expect(200);
    const body = detail.body as GroupResult;
    expect(body.memberships).toHaveLength(1);
    expect(body).not.toHaveProperty('targetAmount');
    expect(body.memberships[0]).not.toHaveProperty('memberId');
    const own = await db.groupMembership.findUniqueOrThrow({
      where: { memberId_groupId: { memberId: member, groupId: forming } },
    });
    expect(body.memberships[0].id).toBe(own.id);
    const ids: string[] = [];
    for (const page of [1, 2]) {
      const response = await http()
        .get(`/api/v1/groups?limit=1&page=${page}`)
        .auth(token(), { type: 'bearer' })
        .expect(200);
      const result = response.body as Page<GroupResult>;
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).not.toHaveProperty('targetAmount');
      ids.push(result.items[0].id);
    }
    expect(new Set(ids).size).toBe(2);
    await http()
      .get('/api/v1/groups/missing')
      .auth(token(), { type: 'bearer' })
      .expect(404);
  });

  it('validates query, path and join body without accepting identity or authority overrides', async () => {
    for (const path of ['/shares/me', '/groups']) {
      for (const query of [
        'page=0',
        'page=1.5',
        'page=1000001',
        'limit=101',
        'limit=abc',
        'memberId=other',
        'page=1&page=2',
      ])
        await http()
          .get(`/api/v1${path}?${query}`)
          .auth(token(), { type: 'bearer' })
          .expect(400);
    }
    await http()
      .get('/api/v1/groups/bad%20id')
      .auth(token(), { type: 'bearer' })
      .expect(400);
    for (const payload of [
      { memberId: other },
      { roleInGroup: 'chair' },
      { status: 'active' },
      { targetAmount: '10' },
    ])
      await http()
        .post(`/api/v1/groups/${forming}/join`)
        .auth(token(), { type: 'bearer' })
        .send(payload)
        .expect(400);
    expect(
      await db.groupMembership.count({ where: { groupId: forming } }),
    ).toBe(0);
  });

  it('joins forming and active groups as ordinary member with transactional audit and no financial effects', async () => {
    for (const id of [forming, active]) {
      const response = await join(id)
        .set('User-Agent', 't37-integration')
        .expect(201);
      const membership = response.body as {
        id: string;
        status: string;
        roleInGroup: string;
      };
      expect(membership).toMatchObject({
        status: 'active',
        roleInGroup: 'member',
      });
      const audits = await db.auditLog.findMany({
        where: { recordId: membership.id },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        tableName: 'group_memberships',
        changedBy: member,
        actionType: 'insert',
        userAgent: 't37-integration',
      });
      expect(JSON.parse(audits[0].newValue!) as object).toMatchObject({
        memberId: member,
        groupId: id,
        roleInGroup: 'member',
      });
    }
    const counts = await Promise.all([
      db.memberShare.count({ where: { memberId: member } }),
      db.memberAccount.count({ where: { memberId: member } }),
      db.savingsTransaction.count({ where: { memberId: member } }),
      db.withdrawalTransaction.count({ where: { memberId: member } }),
      db.loan.count({ where: { memberId: member } }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0]);
  });

  it('rejects inactive members, dissolved or missing groups and all prior membership states', async () => {
    for (const status of ['pending', 'suspended', 'closed'] as const)
      await join(forming, await createMember(status)).expect(
        status === 'pending' ? 403 : 401,
      );
    await join(dissolved).expect(409);
    await join('missing').expect(404);
    await join().expect(201);
    for (const status of ['active', 'left', 'suspended'] as const) {
      await db.groupMembership.update({
        where: { memberId_groupId: { memberId: member, groupId: forming } },
        data: { status },
      });
      await join().expect(409);
      const row = await db.groupMembership.findUniqueOrThrow({
        where: { memberId_groupId: { memberId: member, groupId: forming } },
      });
      expect(row.status).toBe(status);
      expect(await db.auditLog.count({ where: { recordId: row.id } })).toBe(1);
    }
  });

  it('rolls back the membership when real database audit insertion fails', async () => {
    const original = database.$transaction.bind(database);
    jest.spyOn(database, '$transaction').mockImplementation((fn, options) =>
      original(
        (tx) =>
          fn(
            new Proxy(tx, {
              get(client, name) {
                if (name !== 'auditLog')
                  return Reflect.get(client, name) as unknown;
                return {
                  create: (args: Prisma.AuditLogCreateArgs) =>
                    tx.auditLog.create({
                      ...args,
                      data: {
                        ...(args.data as Prisma.AuditLogUncheckedCreateInput),
                        changedBy: 'nonexistent-t37-actor',
                      },
                    }),
                };
              },
            }),
          ),
        options,
      ),
    );
    await join().expect(500);
    expect(
      await db.groupMembership.count({ where: { memberId: member } }),
    ).toBe(0);
    expect(await db.auditLog.count({ where: { changedBy: member } })).toBe(0);
  });

  it('arbitrates overlapping joins to one membership and one audit', async () => {
    const original = database.$transaction.bind(database);
    let remaining = 2;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(database, '$transaction').mockImplementation((fn, options) =>
      original(
        (tx) =>
          fn(
            new Proxy(tx, {
              get(client, name) {
                if (name !== 'groupMembership')
                  return Reflect.get(client, name) as unknown;
                return new Proxy(tx.groupMembership, {
                  get(model, method) {
                    if (method !== 'findUnique')
                      return Reflect.get(model, method) as unknown;
                    return async (
                      args: Prisma.GroupMembershipFindUniqueArgs,
                    ) => {
                      const row = await tx.groupMembership.findUnique(args);
                      if (remaining > 0) {
                        remaining--;
                        if (remaining === 0) release();
                        await gate;
                      }
                      return row;
                    };
                  },
                });
              },
            }),
          ),
        options,
      ),
    );
    const responses = await Promise.all([join(), join()]);
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(
      await db.groupMembership.count({
        where: { groupId: forming, memberId: member },
      }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { changedBy: member, tableName: 'group_memberships' },
      }),
    ).toBe(1);
  });

  const create = (bearer: string, body: object = {}) =>
    http()
      .post('/api/v1/admin/groups')
      .auth(bearer, { type: 'bearer' })
      .send(body);
  const metadata = {
    groupName: 'Approved metadata',
    groupType: 'community_investment_circle',
    description: 'Community circle',
  };

  it('rejects unauthenticated, nonadmin and forged role claims', async () => {
    await http().post('/api/v1/admin/groups').send(metadata).expect(401);
    await create(token(), metadata).expect(403);
    const forged = new JwtService().sign(
      { sub: member, email: 'test@example.invalid', role: 'admin' },
      { secret },
    );
    await create(forged, metadata).expect(403);
    for (const role of ['staff', 'compliance_officer', 'board_director']) {
      const nonadmin = new JwtService().sign(
        { sub: member, email: 'test@example.invalid', role },
        { secret },
      );
      await create(nonadmin, metadata).expect(403);
    }
    const invalidSignature = new JwtService().sign(
      { sub: member, email: 'test@example.invalid', role: 'admin' },
      { secret: 'untrusted-secret' },
    );
    await create(invalidSignature, metadata).expect(401);
  });

  it('uses database promotion and revocation immediately despite stale JWT claims', async () => {
    const staleMemberToken = token();
    await db.member.update({ where: { id: member }, data: { isAdmin: true } });
    const created = await create(staleMemberToken, metadata).expect(201);
    const group = created.body as { id: string; status: string };
    groups.push(group.id);
    expect(group.status).toBe('forming');
    const row = await db.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(row.targetAmount).toBeNull();
    expect(
      await db.auditLog.count({
        where: { recordId: group.id, changedBy: member },
      }),
    ).toBe(1);
    const oldAdminToken = new JwtService().sign(
      { sub: member, email: 'test@example.invalid', role: 'admin' },
      { secret },
    );
    await db.member.update({ where: { id: member }, data: { isAdmin: false } });
    await create(oldAdminToken, metadata).expect(403);
    await db.member.update({
      where: { id: member },
      data: { isAdmin: true, membershipStatus: 'pending' },
    });
    await create(oldAdminToken, metadata).expect(403);
    await db.member.update({
      where: { id: member },
      data: { membershipStatus: 'suspended' },
    });
    await create(oldAdminToken, metadata).expect(401);
  });

  it('creates only supported group metadata with an atomic audit and rejects extra fields', async () => {
    await db.member.update({ where: { id: member }, data: { isAdmin: true } });
    for (const groupType of [
      'savings_circle',
      'community_investment_circle',
      'household_group',
      'enterprise_group',
    ]) {
      const response = await create(token(), {
        ...metadata,
        groupName: ' Trimmed ',
        groupType,
        facilitatorName: ' Facilitator ',
      }).expect(201);
      const group = response.body as {
        id: string;
        groupName: string;
        facilitatorName: string;
      };
      groups.push(group.id);
      expect(group).toMatchObject({
        groupName: 'Trimmed',
        facilitatorName: 'Facilitator',
      });
      const audit = await db.auditLog.findFirstOrThrow({
        where: { recordId: group.id },
      });
      expect(audit).toMatchObject({
        tableName: 'groups',
        actionType: 'insert',
        changedBy: member,
      });
    }
    for (const extra of [
      { targetAmount: '1' },
      { status: 'active' },
      { isAdmin: true },
      { groupType: 'new_product' },
      { groupName: '' },
      { description: '' },
    ])
      await create(token(), { ...metadata, ...extra }).expect(400);
  });

  it('rechecks authority inside the creation transaction and rolls back on real audit failure', async () => {
    await db.member.update({ where: { id: member }, data: { isAdmin: true } });
    const original = database.$transaction.bind(database);
    const spy = jest
      .spyOn(database, '$transaction')
      .mockImplementation(async (fn, options) => {
        // Revoke after the JWT guard's database read but before the transaction.
        await db.member.update({
          where: { id: member },
          data: { isAdmin: false },
        });
        return original(fn, options);
      });
    await create(token(), metadata).expect(403);
    spy.mockRestore();
    await db.member.update({ where: { id: member }, data: { isAdmin: true } });
    const before = await db.group.count();
    jest.spyOn(database, '$transaction').mockImplementation((fn, options) =>
      original(
        (tx) =>
          fn(
            new Proxy(tx, {
              get(client, name) {
                if (name !== 'auditLog')
                  return Reflect.get(client, name) as unknown;
                return {
                  create: (args: Prisma.AuditLogCreateArgs) =>
                    tx.auditLog.create({
                      ...args,
                      data: {
                        ...(args.data as Prisma.AuditLogUncheckedCreateInput),
                        changedBy: 'nonexistent-t37-actor',
                      },
                    }),
                };
              },
            }),
          ),
        options,
      ),
    );
    await create(token(), metadata).expect(500);
    expect(await db.group.count()).toBe(before);
    expect(await db.auditLog.count({ where: { changedBy: member } })).toBe(0);
  });
});
