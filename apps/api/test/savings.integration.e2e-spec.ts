import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { SavingsController } from '../src/modules/savings/savings.controller';
import { JwtAuthGuard } from '../src/core/guards/jwt-auth.guard';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'winston';
import { PrismaService } from '../src/core/database/prisma.service';
import { SavingsService } from '../src/modules/savings/savings.service';
import { PointsService } from '../src/modules/points/points.service';
import { ComplianceService } from '../src/modules/compliance/compliance.service';
import {
  SAVINGS_DEPOSITED_EVENT,
  type SavingsDepositedPayload,
} from '../src/modules/points/points.events';

// This suite never falls back to DATABASE_URL or dotenv. Cleanup is member-scoped.
const testUrl = process.env.SAVINGS_TEST_DATABASE_URL;
if (!testUrl)
  throw new Error(
    'SAVINGS_TEST_DATABASE_URL must point to an isolated PostgreSQL test database',
  );
const parsedUrl = new URL(testUrl);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsedUrl.pathname) ||
  process.env.NODE_ENV !== 'test'
) {
  throw new Error('Refusing non-local/non-test PostgreSQL database');
}

type Result = {
  transaction: { id: string; amount: string; isSimulation: boolean };
  newBalance: string;
  simulation: boolean;
  settlement: string;
};
const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;
const key = () => randomUUID();
function rendezvous(parties = 2) {
  let arrived = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived++;
    if (arrived === parties) release();
    await ready;
  };
}

describe('Savings safety — real PostgreSQL', () => {
  let database: PrismaService;
  let prisma: Pick<
    Prisma.TransactionClient,
    | 'member'
    | 'memberAccount'
    | 'savingsTransaction'
    | 'withdrawalTransaction'
    | 'savingsRequest'
    | 'savingsPointsReceipt'
    | 'complianceFlag'
  > &
    Pick<PrismaService, '$transaction' | 'onModuleInit' | 'onModuleDestroy'>;
  let emitter: EventEmitter2;
  let service: SavingsService;
  let points: PointsService;
  let memberId: string;
  let otherId: string;
  let accountId: string;
  const listen = (listener: (event: SavingsDepositedPayload) => unknown) =>
    emitter.on(SAVINGS_DEPOSITED_EVENT, listener);
  const memberIds: string[] = [];
  const keys: string[] = [];
  const deposit = async (
    amount: string,
    id = key(),
    account = accountId,
    member = memberId,
  ) => {
    keys.push(id);
    return (await service.deposit(account, member, { amount }, id)) as Result;
  };
  const withdraw = async (amount: string, id = key()) => {
    keys.push(id);
    return (await service.withdraw(
      accountId,
      memberId,
      { amount },
      id,
    )) as Result;
  };
  const balance = async () =>
    (
      await prisma.memberAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).currentBalance.toFixed(2);

  // Rendezvous after real reads forces overlap. Only the first attempts wait;
  // serialization retries run normally. No production hooks or sleeps.
  function synchronize(target: 'account' | 'key') {
    const gate = rendezvous();
    let remaining = 2;
    const wrapper = Object.create(database) as PrismaService;
    wrapper.$transaction = <T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: Parameters<PrismaService['$transaction']>[1],
    ) =>
      prisma.$transaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(client, name) {
            if (
              name !==
              (target === 'account' ? 'memberAccount' : 'savingsRequest')
            )
              return Reflect.get(client, name) as unknown;
            const delegate = Reflect.get(client, name) as object;
            return new Proxy(delegate, {
              get(model, method) {
                const value = Reflect.get(model, method) as unknown;
                if (method !== 'findUnique') return value;
                return async (args: unknown) => {
                  const result = await (
                    value as (args: unknown) => Promise<unknown>
                  ).call(model, args);
                  if (remaining > 0) {
                    remaining--;
                    await gate();
                  }
                  return result;
                };
              },
            });
          },
        });
        return fn(proxy);
      }, options);
    service = new SavingsService(wrapper, logger, emitter);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    database = new PrismaService();
    prisma = database;
    await prisma.onModuleInit();
  });
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SAVINGS_SIMULATION_ENABLED = 'true';
    const createMember = async () => {
      const id = randomUUID();
      memberIds.push(id);
      await prisma.member.create({
        data: {
          id,
          membershipNumber: id,
          firstName: 'Test',
          lastName: 'Only',
          dateOfBirth: new Date('1990-01-01'),
          phoneNumber: 'test',
          email: `${id}@example.invalid`,
          addressLine1: 'Test',
          city: 'Test',
          postcode: 'Test',
          passwordHash: 'not-a-login',
          membershipStatus: 'active',
        },
      });
      return id;
    };
    memberId = await createMember();
    otherId = await createMember();
    const account = await prisma.memberAccount.create({
      data: {
        memberId,
        accountType: 'savings_fsa',
        accountNumber: randomUUID(),
      },
    });
    accountId = account.id;
    emitter = new EventEmitter2();
    service = new SavingsService(database, logger, emitter);
    points = new PointsService(database, logger);
    jest.clearAllMocks();
  });
  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.savingsPointsReceipt.deleteMany({
          where: { transaction: { memberId: { in: memberIds } } },
        });
        await tx.savingsRequest.deleteMany({
          where: {
            OR: [{ memberId: { in: memberIds } }, { key: { in: keys } }],
          },
        });
        await tx.complianceFlag.deleteMany({
          where: { memberId: { in: memberIds } },
        });
        await tx.savingsTransaction.deleteMany({
          where: { memberId: { in: memberIds } },
        });
        await tx.withdrawalTransaction.deleteMany({
          where: { memberId: { in: memberIds } },
        });
        await tx.memberAccount.deleteMany({
          where: { memberId: { in: memberIds } },
        });
        await tx.member.deleteMany({ where: { id: { in: memberIds } } });
      });
    } finally {
      await prisma.onModuleDestroy();
    }
  });

  it('records exact decimal deposits and withdrawals with explicit simulation responses', async () => {
    const first = await deposit('0.10');
    expect(first).toMatchObject({
      newBalance: '0.10',
      simulation: true,
      settlement: 'not_settled',
      transaction: { isSimulation: true },
    });
    await deposit('0.20');
    const last = await withdraw('0.10');
    expect(last.newBalance).toBe('0.20');
    expect(await balance()).toBe('0.20');
    expect(
      await prisma.savingsTransaction.count({ where: { accountId } }),
    ).toBe(2);
    expect(
      await prisma.withdrawalTransaction.count({ where: { accountId } }),
    ).toBe(1);
  });
  it('serializes two concurrent deposits without losing either', async () => {
    synchronize('account');
    await Promise.all([deposit('10.10'), deposit('20.20')]);
    expect(await balance()).toBe('30.30');
    expect(
      await prisma.savingsTransaction.count({ where: { accountId } }),
    ).toBe(2);
  });
  it('allows only one competing withdrawal when combined funds are insufficient', async () => {
    await deposit('100');
    synchronize('account');
    const outcomes = await Promise.allSettled([withdraw('80'), withdraw('80')]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(await balance()).toBe('20.00');
    expect(
      await prisma.withdrawalTransaction.count({ where: { accountId } }),
    ).toBe(1);
  });
  it('serializes concurrent deposit and withdrawal', async () => {
    await deposit('100');
    synchronize('account');
    await Promise.all([deposit('20.25'), withdraw('30.10')]);
    expect(await balance()).toBe('90.15');
  });
  it('returns the identical saved result after later balance changes', async () => {
    const id = key();
    const original = await deposit('10', id);
    await deposit('5');
    expect(await deposit('10.00', id)).toEqual(original);
    expect(await balance()).toBe('15.00');
    const withdrawalKey = key();
    const originalWithdrawal = await withdraw('2', withdrawalKey);
    expect(await withdraw('2.00', withdrawalKey)).toEqual(originalWithdrawal);
  });
  it('arbitrates concurrent identical keys with one mutation and one event', async () => {
    synchronize('key');
    const event = jest.fn();
    listen(event);
    const id = key();
    const [a, b] = await Promise.all([deposit('10', id), deposit('10', id)]);
    expect(a).toEqual(b);
    expect(await balance()).toBe('10.00');
    expect(event).toHaveBeenCalledTimes(1);
  });
  it('arbitrates concurrent duplicate withdrawal keys with one debit', async () => {
    await deposit('100');
    synchronize('key');
    const id = key();
    const [a, b] = await Promise.all([withdraw('10', id), withdraw('10', id)]);
    expect(a).toEqual(b);
    expect(await balance()).toBe('90.00');
  });
  it('rejects changed amount, member, account, detail and operation without disclosing prior data', async () => {
    const id = key();
    await deposit('10', id);
    await expect(deposit('11', id)).rejects.toThrow('different request');
    await expect(deposit('10', id, accountId, otherId)).rejects.toThrow(
      'different request',
    );
    await expect(deposit('10', id, 'another-account')).rejects.toThrow(
      'different request',
    );
    await expect(
      service.deposit(
        accountId,
        memberId,
        { amount: '10', note: 'changed' },
        id,
      ),
    ).rejects.toThrow('different request');
    await expect(withdraw('10', id)).rejects.toThrow('different request');
    expect(await balance()).toBe('10.00');
  });
  it('rejects concurrent cross-operation reuse of a key', async () => {
    await deposit('100');
    synchronize('key');
    const id = key();
    const outcomes = await Promise.allSettled([
      deposit('10', id),
      withdraw('10', id),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(['90.00', '110.00']).toContain(await balance());
  });
  it('preserves legacy rows and refuses to invent their response', async () => {
    const id = key();
    keys.push(id);
    const legacy = await prisma.savingsTransaction.create({
      data: {
        memberId,
        accountId,
        amount: '12.34',
        transactionType: 'deposit',
        status: 'completed',
        idempotencyKey: id,
      },
    });
    await prisma.withdrawalTransaction.create({
      data: { memberId: otherId, accountId, amount: '1', idempotencyKey: id },
    });
    await expect(deposit('12.34', id)).rejects.toThrow('Legacy');
    await expect(withdraw('12.34', id)).rejects.toThrow('Legacy');
    expect(
      await prisma.savingsTransaction.findUnique({ where: { id: legacy.id } }),
    ).toEqual(legacy);
    expect(await balance()).toBe('0.00');
  });
  it('rolls back balance, GSA state, records and claim on a database error; same-key retry is safe', async () => {
    await prisma.memberAccount.update({
      where: { id: accountId },
      data: { accountType: 'savings_gsa', goalTarget: '10' },
    });
    // Force an actual PostgreSQL unique violation after the balance/goal update.
    const id = key();
    keys.push(id);
    const duplicate = await prisma.savingsRequest.create({
      data: {
        key: key(),
        memberId,
        accountId,
        operation: 'test',
        payload: '',
        transactionId: 'occupied',
      },
    });
    const wrap = Object.create(database) as PrismaService;
    wrap.$transaction = <T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: Parameters<PrismaService['$transaction']>[1],
    ) =>
      prisma.$transaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(client, name) {
            if (name !== 'savingsRequest')
              return Reflect.get(client, name) as unknown;
            return {
              ...client.savingsRequest,
              update: async () =>
                client.savingsRequest.create({
                  data: {
                    key: key(),
                    memberId,
                    accountId,
                    operation: 'test',
                    payload: '',
                    transactionId: duplicate.transactionId,
                  },
                }),
            };
          },
        });
        return fn(proxy);
      }, options);
    const event = jest.fn();
    listen(event);
    service = new SavingsService(wrap, logger, emitter);
    await expect(deposit('10', id)).rejects.toMatchObject({ code: 'P2002' });
    expect(await balance()).toBe('0.00');
    expect(
      (
        await prisma.memberAccount.findUniqueOrThrow({
          where: { id: accountId },
        })
      ).goalReached,
    ).toBe(false);
    expect(
      await prisma.savingsTransaction.count({ where: { accountId } }),
    ).toBe(0);
    expect(
      await prisma.savingsRequest.findUnique({ where: { key: id } }),
    ).toBeNull();
    expect(event).not.toHaveBeenCalled();
    service = new SavingsService(database, logger, emitter);
    await deposit('10', id);
    expect(await balance()).toBe('10.00');
  });
  it('emits only committed, visible records and does not fail a deposit on listener failure', async () => {
    const observations: boolean[] = [];
    listen(async (event: SavingsDepositedPayload) => {
      observations.push(
        (await prisma.savingsTransaction.findUnique({
          where: { id: event.transactionId },
        })) !== null,
      );
      observations.push(
        (await prisma.savingsRequest.findUnique({
          where: { transactionId: event.transactionId },
        })) !== null,
      );
      throw new Error('listener failed');
    });
    await expect(deposit('10')).resolves.toMatchObject({ newBalance: '10.00' });
    expect(observations).toEqual([true, true]);
    expect(logger.error).toHaveBeenCalled();
  });
  it('awards points once per committed deposit despite concurrent event deliveries and request retries', async () => {
    listen((event: SavingsDepositedPayload) => points.handleDeposit(event));
    const id = key();
    const result = await deposit('10', id);
    const stored = await prisma.savingsRequest.findUnique({
      where: { transactionId: result.transaction.id },
    });
    const event = stored!.event as unknown as SavingsDepositedPayload;
    await Promise.all([
      points.handleDeposit(event),
      points.handleDeposit(event),
      deposit('10', id),
    ]);
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: memberId } }))
        .savingsPointsTotal,
    ).toBe(10);
    expect(
      await prisma.savingsPointsReceipt.count({
        where: { transactionId: result.transaction.id },
      }),
    ).toBe(1);
  });
  it('atomically increments points from distinct concurrent deposits, including zero-point receipts', async () => {
    listen((event: SavingsDepositedPayload) => points.handleDeposit(event));
    synchronize('account');
    // Drain both operations even on failure, before assertions or fixture cleanup.
    const outcomes = await Promise.allSettled([deposit('10'), deposit('20')]);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') throw outcome.reason;
    }
    await deposit('0.01');
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: memberId } }))
        .savingsPointsTotal,
    ).toBe(30);
    expect(
      await prisma.savingsPointsReceipt.count({
        where: { transaction: { accountId } },
      }),
    ).toBe(3);
  });
  it('rolls back a points receipt if its atomic increment fails, without reversing the deposit', async () => {
    await prisma.member.update({
      where: { id: memberId },
      data: { savingsPointsTotal: 2147483647 },
    });
    listen((event: SavingsDepositedPayload) => points.handleDeposit(event));
    const result = await deposit('1'); // PostgreSQL integer overflow in points, after receipt insertion.
    expect(await balance()).toBe('1.00');
    expect(
      await prisma.savingsPointsReceipt.findUnique({
        where: { transactionId: result.transaction.id },
      }),
    ).toBeNull();
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: memberId } }))
        .savingsPointsTotal,
    ).toBe(2147483647);
    await prisma.member.update({
      where: { id: memberId },
      data: { savingsPointsTotal: 0 },
    });
    const stored = await prisma.savingsRequest.findUniqueOrThrow({
      where: { transactionId: result.transaction.id },
    });
    await points.handleDeposit(
      stored.event as unknown as SavingsDepositedPayload,
    );
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: memberId } }))
        .savingsPointsTotal,
    ).toBe(1);
  });
  it('enforces the HTTP decimal/key contract and returns consistent replay envelopes', async () => {
    const module = await Test.createTestingModule({
      controllers: [SavingsController],
      providers: [{ provide: SavingsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          const req = context
            .switchToHttp()
            .getRequest<{ user: { sub: string } }>();
          req.user = { sub: memberId };
          return true;
        },
      })
      .compile();
    const app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    try {
      const path = `/accounts/${accountId}/deposit`;
      await request(server).post(path).send({ amount: '1.25' }).expect(400);
      await request(server)
        .post(path)
        .set('Idempotency-Key', key())
        .send({ amount: 1.25 })
        .expect(400);
      await request(server)
        .post(path)
        .set('Idempotency-Key', key())
        .send({ amount: '1.001' })
        .expect(400);
      const id = key();
      const original = await request(server)
        .post(path)
        .set('Idempotency-Key', id)
        .send({ amount: '1.25' })
        .expect(201);
      const replay = await request(server)
        .post(path)
        .set('Idempotency-Key', id)
        .send({ amount: '1.25' })
        .expect(201);
      expect(replay.body).toEqual(original.body);
      await request(server)
        .post(path)
        .set('Idempotency-Key', id)
        .send({ amount: '2' })
        .expect(409);
      await request(server)
        .post(`/accounts/${accountId}/withdraw`)
        .send({ amount: '0.25' })
        .expect(400);
      await request(server)
        .post(`/accounts/${accountId}/withdraw`)
        .set('Idempotency-Key', key())
        .send({ amount: '0.25' })
        .expect(201);
      process.env.NODE_ENV = 'production';
      await request(server)
        .post(path)
        .set('Idempotency-Key', key())
        .send({ amount: '1' })
        .expect(403);
      expect(await balance()).toBe('1.00');
    } finally {
      await app.close();
    }
  });
  it('ignores uncommitted or unknown events without awarding points', async () => {
    await points.handleDeposit({
      transactionId: key(),
      memberId,
      accountId,
      accountType: 'savings_fsa',
      amount: '100',
      newBalance: '100',
      goalTarget: null,
      goalReached: false,
      simulation: true,
    });
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: memberId } }))
        .savingsPointsTotal,
    ).toBe(0);
  });
  it('enforces ownership, membership, account status and savings types', async () => {
    await expect(deposit('1', key(), accountId, otherId)).rejects.toThrow(
      'access',
    );
    for (const membershipStatus of [
      'pending',
      'suspended',
      'closed',
    ] as const) {
      await prisma.member.update({
        where: { id: memberId },
        data: { membershipStatus },
      });
      await expect(deposit('1')).rejects.toThrow('membership');
      await expect(withdraw('1')).rejects.toThrow('membership');
    }
    await prisma.member.update({
      where: { id: memberId },
      data: { membershipStatus: 'active' },
    });
    for (const accountStatus of [
      'frozen',
      'closed',
      'pending_closure',
    ] as const) {
      await prisma.memberAccount.update({
        where: { id: accountId },
        data: { accountStatus },
      });
      await expect(deposit('1')).rejects.toThrow('active savings');
      await expect(withdraw('1')).rejects.toThrow('active savings');
    }
    await prisma.memberAccount.update({
      where: { id: accountId },
      data: { accountStatus: 'active', accountType: 'loan' },
    });
    await expect(deposit('1')).rejects.toThrow('active savings');
    expect(await balance()).toBe('0.00');
  });
  it('updates GSA goal state atomically and calculates exact milestone points', async () => {
    await prisma.memberAccount.update({
      where: { id: accountId },
      data: { accountType: 'savings_gsa', goalTarget: '100' },
    });
    listen((event: SavingsDepositedPayload) => points.handleDeposit(event));
    await expect(withdraw('1')).rejects.toThrow('goal');
    await deposit('24.99');
    await deposit('0.01'); // exact 25% crossing; rounds down to zero integer points
    await Promise.all([deposit('25'), deposit('50')]);
    expect(await balance()).toBe('100.00');
    expect(
      (
        await prisma.memberAccount.findUniqueOrThrow({
          where: { id: accountId },
        })
      ).goalReached,
    ).toBe(true);
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: memberId } }))
        .savingsPointsTotal,
    ).toBe(174);
    await withdraw('1');
    expect(await balance()).toBe('99.00');
  });
  it('runs the existing compliance listener against the restored table', async () => {
    const compliance = new ComplianceService(database, logger);
    listen((event: SavingsDepositedPayload) => compliance.handleDeposit(event));
    await deposit('5000');
    expect(
      await prisma.complianceFlag.count({
        where: { memberId, flagType: 'large_single_deposit' },
      }),
    ).toBe(1);
  });
  it('blocks both mutations in staging/production and without explicit opt-in before any write', async () => {
    const id = key();
    await deposit('10', id);
    for (const mode of ['staging', 'production', 'development', 'test']) {
      process.env.NODE_ENV = mode;
      process.env.SAVINGS_SIMULATION_ENABLED = [
        'staging',
        'production',
      ].includes(mode)
        ? 'true'
        : 'false';
      await expect(deposit('10', id)).rejects.toThrow('disabled');
      await expect(withdraw('1')).rejects.toThrow('disabled');
    }
    expect(await balance()).toBe('10.00');
  });
});
