import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { CreateGroupDto, GovernancePageDto } from './dto/governance.dto';

const groupSelect = {
  id: true,
  groupName: true,
  groupType: true,
  formationDate: true,
  status: true,
  facilitatorName: true,
  description: true,
  createdAt: true,
} satisfies Prisma.GroupSelect;

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}

function duplicateMembership(error: unknown): boolean {
  if (errorCode(error) !== 'P2002') return false;
  const meta = (error as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  return (
    Array.isArray(target) &&
    target.length === 2 &&
    (['memberId', 'groupId'].every((field) => target.includes(field)) ||
      ['member_id', 'group_id'].every((field) => target.includes(field)))
  );
}

@Injectable()
export class GovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireMember(memberId: string) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true },
    });
    if (!member) throw new UnauthorizedException('Member no longer exists');
  }

  async shares(memberId: string, { page, limit }: GovernancePageDto) {
    await this.requireMember(memberId);
    const rows: Prisma.MemberShareGetPayload<object>[] =
      await this.prisma.memberShare.findMany({
        where: { memberId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      });
    return {
      page,
      limit,
      items: rows.map((row) => ({
        id: row.id,
        sharePurchaseDate: row.sharePurchaseDate,
        numberOfShares: row.numberOfShares,
        shareValue: row.shareValue.toFixed(2),
        totalShareValue: row.totalShareValue.toFixed(2),
        status: row.status,
      })),
    };
  }

  async groups(memberId: string, { page, limit }: GovernancePageDto) {
    await this.requireMember(memberId);
    const items = await this.prisma.group.findMany({
      select: {
        ...groupSelect,
        memberships: {
          where: { memberId },
          select: { id: true, status: true, roleInGroup: true, joinDate: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
    return { page, limit, items };
  }

  async group(memberId: string, id: string) {
    await this.requireMember(memberId);
    const group = await this.prisma.group.findUnique({
      where: { id },
      select: {
        ...groupSelect,
        memberships: {
          where: { memberId },
          select: { id: true, status: true, roleInGroup: true, joinDate: true },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async createGroup(
    memberId: string,
    dto: CreateGroupDto,
    context: AuditContext = {},
  ) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const member = await tx.member.findUnique({
              where: { id: memberId },
              select: { membershipStatus: true, isAdmin: true },
            });
            if (
              !member ||
              member.membershipStatus !== 'active' ||
              !member.isAdmin
            )
              throw new ForbiddenException(
                'Active administrative authority is required',
              );
            const group = await tx.group.create({
              data: {
                groupName: dto.groupName,
                groupType: dto.groupType,
                description: dto.description,
                facilitatorName: dto.facilitatorName,
              },
              select: groupSelect,
            });
            await tx.auditLog.create({
              data: {
                tableName: 'groups',
                recordId: group.id,
                actionType: 'insert',
                changedBy: memberId,
                newValue: JSON.stringify(group),
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
              },
            });
            return group;
          },
          { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 },
        );
      } catch (error) {
        if (errorCode(error) !== 'P2034') throw error;
        if (attempt === 3)
          throw new ServiceUnavailableException(
            'Concurrent group change; retry the request',
          );
      }
    }
    throw new Error('Unreachable');
  }

  async join(memberId: string, groupId: string, context: AuditContext = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const member = await tx.member.findUnique({
              where: { id: memberId },
              select: { membershipStatus: true },
            });
            if (!member)
              throw new UnauthorizedException('Member no longer exists');
            if (member.membershipStatus !== 'active')
              throw new ForbiddenException(
                'Active membership is required to join',
              );

            const group = await tx.group.findUnique({
              where: { id: groupId },
              select: { status: true },
            });
            if (!group) throw new NotFoundException('Group not found');
            if (group.status !== 'forming' && group.status !== 'active')
              throw new ConflictException('Group does not accept joins');

            const existing = await tx.groupMembership.findUnique({
              where: { memberId_groupId: { memberId, groupId } },
              select: { id: true },
            });
            if (existing)
              throw new ConflictException('Group membership already exists');

            const membership = await tx.groupMembership.create({
              data: {
                memberId,
                groupId,
                roleInGroup: 'member',
                status: 'active',
              },
              select: {
                id: true,
                groupId: true,
                roleInGroup: true,
                status: true,
                joinDate: true,
              },
            });
            await tx.auditLog.create({
              data: {
                tableName: 'group_memberships',
                recordId: membership.id,
                actionType: 'insert',
                changedBy: memberId,
                newValue: JSON.stringify({ ...membership, memberId }),
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
              },
            });
            return membership;
          },
          { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 },
        );
      } catch (error) {
        if (duplicateMembership(error))
          throw new ConflictException('Group membership already exists');
        if (errorCode(error) !== 'P2034') throw error;
        if (attempt === 3)
          throw new ServiceUnavailableException(
            'Concurrent group change; retry the request',
          );
      }
    }
    throw new Error('Unreachable');
  }
}
