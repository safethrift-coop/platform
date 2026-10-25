import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GovernanceService } from './governance.service';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateGroupDto, GovernancePageDto } from './dto/governance.dto';

function setup() {
  const tx = {
    member: {
      findUnique: jest.fn().mockResolvedValue({ membershipStatus: 'active' }),
    },
    group: {
      findUnique: jest.fn().mockResolvedValue({ status: 'forming' }),
      create: jest.fn().mockResolvedValue({ id: 'group', status: 'forming' }),
    },
    groupMembership: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'membership',
        groupId: 'group',
        status: 'active',
        roleInGroup: 'member',
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const transaction = jest.fn(
    async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      fn(tx as unknown as Prisma.TransactionClient),
  );
  const service = new GovernanceService({
    $transaction: transaction,
  } as unknown as PrismaService);
  return { tx, transaction, service };
}

describe('Governance join safety', () => {
  it('checks eligibility and inserts ordinary membership and audit inside Serializable transaction', async () => {
    const { service, tx, transaction } = setup();
    await service.join('member', 'group', {
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    });
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
    expect(tx.groupMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          memberId: 'member',
          groupId: 'group',
          status: 'active',
          roleInGroup: 'member',
        },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changedBy: 'member',
        recordId: 'membership',
        tableName: 'group_memberships',
        actionType: 'insert',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      }) as unknown,
    });
  });

  it.each(['pending', 'suspended', 'closed'])(
    'rejects %s members before writing',
    async (membershipStatus) => {
      const { service, tx } = setup();
      tx.member.findUnique.mockResolvedValue({ membershipStatus });
      await expect(service.join('member', 'group')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(tx.groupMembership.create).not.toHaveBeenCalled();
    },
  );

  it('rejects missing members, missing groups, dissolved groups and all existing memberships', async () => {
    const { service, tx } = setup();
    tx.member.findUnique.mockResolvedValueOnce(null);
    await expect(service.join('member', 'group')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    tx.group.findUnique.mockResolvedValueOnce(null);
    await expect(service.join('member', 'group')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.group.findUnique.mockResolvedValueOnce({ status: 'dissolved' });
    await expect(service.join('member', 'group')).rejects.toBeInstanceOf(
      ConflictException,
    );
    for (const status of ['active', 'left', 'suspended']) {
      tx.groupMembership.findUnique.mockResolvedValueOnce({
        id: 'existing',
        status,
      });
      await expect(service.join('member', 'group')).rejects.toBeInstanceOf(
        ConflictException,
      );
    }
    expect(tx.groupMembership.create).not.toHaveBeenCalled();
  });

  it('retries serialization conflicts at most four times and recovers when possible', async () => {
    const { service, transaction } = setup();
    transaction.mockRejectedValueOnce({ code: 'P2034' });
    await expect(service.join('member', 'group')).resolves.toHaveProperty(
      'id',
      'membership',
    );
    expect(transaction).toHaveBeenCalledTimes(2);
    transaction.mockClear().mockRejectedValue({ code: 'P2034' });
    await expect(service.join('member', 'group')).rejects.toThrow(
      'retry the request',
    );
    expect(transaction).toHaveBeenCalledTimes(4);
  });

  it('translates only the membership pair unique violation; propagates audit and other database errors', async () => {
    for (const target of [
      ['memberId', 'groupId'],
      ['member_id', 'group_id'],
    ]) {
      const { service, transaction } = setup();
      transaction.mockRejectedValue({ code: 'P2002', meta: { target } });
      await expect(service.join('member', 'group')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(transaction).toHaveBeenCalledTimes(1);
    }
    const { service, tx, transaction } = setup();
    const error = { code: 'P2002', meta: { target: ['audit_id'] } };
    tx.auditLog.create.mockRejectedValue(error);
    await expect(service.join('member', 'group')).rejects.toEqual(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('Governance DTO boundaries', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };
  it('accepts only supported group types and metadata without financial or authority fields', async () => {
    for (const groupType of [
      'savings_circle',
      'community_investment_circle',
      'household_group',
      'enterprise_group',
    ]) {
      const dto = plainToInstance(CreateGroupDto, {
        groupName: ' Circle ',
        groupType,
        description: ' Description ',
      });
      expect(await validate(dto, options)).toEqual([]);
      expect(dto.groupName).toBe('Circle');
    }
    for (const extra of [
      { targetAmount: '10' },
      { status: 'active' },
      { role: 'admin' },
      { groupType: 'new_product' },
      { groupName: ' ' },
      { facilitatorName: '' },
    ]) {
      const dto = plainToInstance(CreateGroupDto, {
        groupName: 'Circle',
        groupType: 'community_investment_circle',
        description: 'Description',
        ...extra,
      });
      expect((await validate(dto, options)).length).toBeGreaterThan(0);
    }
  });
  it('bounds pagination and rejects unknown query fields', async () => {
    expect(
      await validate(plainToInstance(GovernancePageDto, {}), options),
    ).toEqual([]);
    for (const query of [
      { page: 0 },
      { limit: 101 },
      { page: 1.5 },
      { page: 'bad' },
      { page: '1e20' },
      { memberId: 'other' },
    ]) {
      expect(
        (await validate(plainToInstance(GovernancePageDto, query), options))
          .length,
      ).toBeGreaterThan(0);
    }
  });
});

describe('Governance administrative transaction', () => {
  const dto = plainToInstance(CreateGroupDto, {
    groupName: 'Circle',
    groupType: 'community_investment_circle',
    description: 'Approved metadata',
  });
  it('requires active persistent authority inside the transaction before any creation', async () => {
    for (const member of [
      null,
      { membershipStatus: 'active', isAdmin: false },
      { membershipStatus: 'pending', isAdmin: true },
      { membershipStatus: 'closed', isAdmin: true },
    ]) {
      const { service, tx } = setup();
      tx.member.findUnique.mockResolvedValue(member);
      await expect(service.createGroup('member', dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(tx.group.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    }
  });
  it('preserves the forming default and awaits the audit before success', async () => {
    const { service, tx, transaction } = setup();
    tx.member.findUnique.mockResolvedValue({
      membershipStatus: 'active',
      isAdmin: true,
    });
    await expect(service.createGroup('member', dto)).resolves.toHaveProperty(
      'id',
      'group',
    );
    expect(tx.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          groupName: dto.groupName,
          groupType: dto.groupType,
          description: dto.description,
          facilitatorName: undefined,
        },
      }),
    );
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
    tx.auditLog.create.mockRejectedValueOnce(new Error('audit failed'));
    await expect(service.createGroup('member', dto)).rejects.toThrow(
      'audit failed',
    );
    transaction.mockRejectedValue({ code: 'P2034' });
    transaction.mockClear();
    await expect(service.createGroup('member', dto)).rejects.toThrow(
      'retry the request',
    );
    expect(transaction).toHaveBeenCalledTimes(4);
  });
});
