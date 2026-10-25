import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { Logger } from 'winston';
import type { Request } from 'express';
import { AuthService, type MemberProfile } from './auth.service';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtStrategy } from '../../core/strategies/jwt.strategy';

function setup() {
  const findUnique = jest.fn().mockResolvedValue({
    id: 'member',
    email: 'test@example.invalid',
    emailVerified: true,
    membershipStatus: 'active',
    isAdmin: false,
  });
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    compareAndSwap: jest.fn().mockResolvedValue(true),
  };
  const prisma = { member: { findUnique } } as unknown as PrismaService;
  const service = new AuthService(
    prisma,
    new JwtService(),
    redis as unknown as RedisService,
    {} as NotificationsService,
    { info: jest.fn(), warn: jest.fn() } as unknown as Logger,
  );
  return { service, redis, findUnique, prisma };
}

describe('Authentication authority and refresh safety', () => {
  const oldSecret = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'unit-test-only-secret-with-32-characters';
  });
  afterAll(() => {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });

  it('does not look up member identity, rotate or delete a session for an invalid secret', async () => {
    const { service, redis, findUnique } = setup();
    redis.get.mockResolvedValue(await bcrypt.hash(randomUUID(), 4));
    await expect(service.refresh('member', randomUUID())).rejects.toThrow(
      'Invalid or expired',
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.compareAndSwap).not.toHaveBeenCalled();
    await expect(service.refresh('member', undefined)).rejects.toThrow(
      'Invalid or expired',
    );
  });

  it('returns no credentials if atomic rotation loses to logout or another refresh', async () => {
    const { service, redis } = setup();
    const token = randomUUID();
    redis.get.mockResolvedValue(await bcrypt.hash(token, 4));
    redis.compareAndSwap.mockResolvedValue(false);
    await expect(service.refresh('member', token)).rejects.toThrow(
      'Invalid or expired',
    );
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('fails closed on authority lookup failure and rejects inactive/unverified refreshes', async () => {
    const { service, redis, findUnique } = setup();
    const token = randomUUID();
    redis.get.mockResolvedValue(await bcrypt.hash(token, 4));
    findUnique.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.refresh('member', token)).rejects.toThrow(
      'database unavailable',
    );
    expect(redis.compareAndSwap).not.toHaveBeenCalled();
    for (const value of [
      null,
      { membershipStatus: 'closed', emailVerified: true },
      { membershipStatus: 'active', emailVerified: false },
    ]) {
      findUnique.mockResolvedValueOnce(value);
      await expect(service.refresh('member', token)).rejects.toThrow(
        'Invalid or expired',
      );
    }
    expect(redis.compareAndSwap).toHaveBeenCalledTimes(3);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('derives login claims from the database rather than a stale profile', async () => {
    const { service, findUnique } = setup();
    const profile = { id: 'member' } as MemberProfile;
    for (const isAdmin of [false, true, false]) {
      findUnique.mockResolvedValueOnce({
        id: 'member',
        email: 'test@example.invalid',
        emailVerified: true,
        membershipStatus: 'active',
        isAdmin,
      });
      const tokens = await service.login(profile);
      expect(
        new JwtService().decode<{ role: string }>(tokens.accessToken).role,
      ).toBe(isAdmin ? 'admin' : 'member');
    }
  });

  it('preserves existing signed nonadmin role policies without granting admin', async () => {
    const { prisma } = setup();
    const strategy = new JwtStrategy(prisma);
    for (const role of [
      'member',
      'staff',
      'compliance_officer',
      'board_director',
    ])
      expect(
        await strategy.validate({} as Request, {
          sub: 'member',
          email: 'test@example.invalid',
          role,
        }),
      ).toHaveProperty('role', role);
  });

  it('overrides signed role claims with current database authority on every request', async () => {
    const { prisma, findUnique } = setup();
    const strategy = new JwtStrategy(prisma);
    const payload = {
      sub: 'member',
      email: 'old@example.invalid',
      role: 'admin',
    };
    const req = {} as Request;
    expect(await strategy.validate(req, payload)).toMatchObject({
      role: 'member',
      email: 'test@example.invalid',
    });
    findUnique.mockResolvedValueOnce({
      email: 'test@example.invalid',
      membershipStatus: 'active',
      isAdmin: true,
    });
    expect(
      await strategy.validate(req, { ...payload, role: 'member' }),
    ).toHaveProperty('role', 'admin');
    findUnique.mockResolvedValueOnce({ membershipStatus: 'suspended' });
    await expect(strategy.validate(req, payload)).rejects.toThrow();
    findUnique.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(strategy.validate(req, payload)).rejects.toThrow(
      'database unavailable',
    );
  });
});
