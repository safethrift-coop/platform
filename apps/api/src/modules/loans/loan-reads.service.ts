import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

const applicationSelect = {
  id: true,
  applicationDate: true,
  requestedAmount: true,
  loanPurpose: true,
  requestedTermMonths: true,
  applicationStatus: true,
  savingsPointsAtApplication: true,
  riskBandAtApplication: true,
  reviewDate: true,
} satisfies Prisma.LoanApplicationSelect;
const loanSelect = {
  id: true,
  principalAmount: true,
  termMonths: true,
  loanStatus: true,
  approvalDate: true,
  maturityDate: true,
} satisfies Prisma.LoanSelect;
export const loanCapability = {
  allowed: false,
  mode: 'disabled',
  message:
    'Loan submission and repayment execution are unavailable. Lending policy and execution have not been approved.',
} as const;
const provenance = {
  provenance: 'historical_unknown',
  settlementStatus: 'unverified',
} as const;
export type LoanPage<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

type Position = { v: 1; scope: string; id: string; date: string };
export function loanPageInput(scope: string, limit?: string, cursor?: string) {
  if (limit !== undefined && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit))
    throw new BadRequestException('Invalid limit');
  let position: Position | undefined;
  if (cursor !== undefined) {
    try {
      if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))
        throw new Error();
      const value = JSON.parse(
        Buffer.from(cursor, 'base64url').toString(),
      ) as Position;
      if (
        value.v !== 1 ||
        value.scope !== scope ||
        typeof value.id !== 'string' ||
        !/^[A-Za-z0-9:_-]{1,256}$/.test(value.id) ||
        typeof value.date !== 'string' ||
        new Date(value.date).toISOString() !== value.date
      )
        throw new Error();
      position = value;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
  return { take: limit === undefined ? 20 : Number(limit), position };
}
function page<T extends { id: string }>(
  rows: T[],
  take: number,
  scope: string,
  date: (row: T) => Date,
): LoanPage<T> {
  const items = rows.slice(0, take),
    last = items.at(-1);
  const hasMore = rows.length > take;
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              scope,
              id: last.id,
              date: date(last).toISOString(),
            }),
          ).toString('base64url')
        : null,
  };
}
function after(
  position: Position | undefined,
  field: string,
  ascending = false,
) {
  if (!position) return {};
  const comparison = ascending ? 'gt' : 'lt';
  return {
    OR: [
      { [field]: { [comparison]: new Date(position.date) } },
      { [field]: new Date(position.date), id: { [comparison]: position.id } },
    ],
  };
}
@Injectable()
export class LoanReadsService {
  constructor(private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma as unknown as Prisma.TransactionClient;
  }

  async eligibility(memberId: string, reviewer: boolean) {
    const member = await this.db.member.findUnique({
      where: { id: memberId },
      select: {
        savingsPointsTotal: true,
        currentRiskBand: true,
        membershipStatus: true,
        emailVerified: true,
      },
    });
    if (!member) throw new NotFoundException('Member not found');
    return {
      ...member,
      applicationCapability: loanCapability,
      maximumAmount: null,
      minimumAmount: null,
      step: null,
      policyVersion: null,
      kycStatus: 'not_evaluated',
      scoringEligibility: 'not_evaluated',
      reviewer,
    };
  }
  async applications(memberId: string, limit?: string, cursor?: string) {
    const scope = `applications:${memberId}`,
      { take, position } = loanPageInput(scope, limit, cursor);
    const rows = await this.db.loanApplication.findMany({
      where: { memberId, ...after(position, 'applicationDate') },
      select: applicationSelect,
      orderBy: [{ applicationDate: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const result = page(rows, take, scope, (row) => row.applicationDate);
    return {
      ...result,
      items: result.items.map((row) => ({
        ...row,
        requestedAmount: row.requestedAmount.toFixed(2),
        ...provenance,
      })),
    };
  }
  async application(memberId: string, id: string) {
    const row = await this.db.loanApplication.findFirst({
      where: { id, memberId },
      select: {
        ...applicationSelect,
        loan: { where: { memberId }, select: { id: true } },
      },
    });
    if (!row) throw new NotFoundException('Application not found');
    return {
      ...row,
      loan: undefined,
      loanId: row.loan?.id ?? null,
      requestedAmount: row.requestedAmount.toFixed(2),
      ...provenance,
    };
  }
  async loans(memberId: string, limit?: string, cursor?: string) {
    const scope = `loans:${memberId}`,
      { take, position } = loanPageInput(scope, limit, cursor);
    const rows = await this.db.loan.findMany({
      where: { memberId, ...after(position, 'approvalDate') },
      select: loanSelect,
      orderBy: [{ approvalDate: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const result = page(rows, take, scope, (row) => row.approvalDate);
    return {
      ...result,
      items: result.items.map((row) => ({
        ...row,
        principalAmount: row.principalAmount.toFixed(2),
        ...provenance,
      })),
    };
  }
  async loan(memberId: string, id: string) {
    const row = await this.db.loan.findFirst({
      where: { id, memberId },
      select: loanSelect,
    });
    if (!row) throw new NotFoundException('Loan not found');
    // No linked application/account data is projected from a potentially inconsistent relation.
    return {
      ...row,
      principalAmount: row.principalAmount.toFixed(2),
      repaymentCapability: loanCapability,
      ...provenance,
    };
  }
  async schedule(
    memberId: string,
    id: string,
    limit?: string,
    cursor?: string,
  ) {
    await this.loan(memberId, id);
    // Installment order is unique per loan. Encode its integer in the shared cursor's id.
    const scope = `schedule:${memberId}:${id}`,
      { take, position } = loanPageInput(scope, limit, cursor);
    if (
      position &&
      (!/^[1-9]\d{0,8}$/.test(position.id) ||
        position.date !== '1970-01-01T00:00:00.000Z')
    )
      throw new BadRequestException('Invalid schedule cursor');
    const rows = await this.db.repaymentSchedule.findMany({
      where: {
        loanId: id,
        loan: { memberId },
        ...(position ? { installmentNumber: { gt: Number(position.id) } } : {}),
      },
      select: {
        id: true,
        installmentNumber: true,
        dueDate: true,
        principalDue: true,
        interestDue: true,
        totalDue: true,
        totalPaid: true,
        status: true,
      },
      orderBy: { installmentNumber: 'asc' },
      take: take + 1,
    });
    const result = page(
      rows.map((row) => ({
        ...row,
        id: String(row.installmentNumber),
        scheduleId: row.id,
      })),
      take,
      scope,
      () => new Date(0),
    );
    return {
      ...result,
      items: result.items.map((row) => ({
        ...row,
        principalDue: row.principalDue.toFixed(2),
        interestDue: row.interestDue.toFixed(2),
        totalDue: row.totalDue.toFixed(2),
        totalPaid: row.totalPaid.toFixed(2),
        ...provenance,
      })),
    };
  }
  async repayments(
    memberId: string,
    id: string,
    limit?: string,
    cursor?: string,
  ) {
    await this.loan(memberId, id);
    const scope = `repayments:${memberId}:${id}`,
      { take, position } = loanPageInput(scope, limit, cursor);
    const rows = await this.db.repaymentTransaction.findMany({
      where: {
        loanId: id,
        memberId,
        loan: { memberId },
        AND: [{ OR: [{ scheduleId: null }, { schedule: { loanId: id } }] }],
        ...after(position, 'paymentDate'),
      },
      select: {
        id: true,
        amountPaid: true,
        paymentDate: true,
        paymentStatus: true,
      },
      orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const result = page(rows, take, scope, (row) => row.paymentDate);
    return {
      ...result,
      items: result.items.map((row) => ({
        ...row,
        amountPaid: row.amountPaid.toFixed(2),
        ...provenance,
      })),
    };
  }
  async queue(reviewerId: string, limit?: string, cursor?: string) {
    const scope = `review:${reviewerId}`,
      { take, position } = loanPageInput(scope, limit, cursor);
    const rows = await this.db.loanApplication.findMany({
      where: {
        applicationStatus: { in: ['pending', 'under_review'] },
        ...after(position, 'applicationDate', true),
      },
      select: {
        ...applicationSelect,
        behaviouralScoreAtApplication: true,
        predictedRepaymentProbability: true,
      },
      orderBy: [{ applicationDate: 'asc' }, { id: 'asc' }],
      take: take + 1,
    });
    const result = page(rows, take, scope, (row) => row.applicationDate);
    return {
      ...result,
      items: result.items.map((row) => ({
        ...row,
        requestedAmount: row.requestedAmount.toFixed(2),
        behaviouralScoreAtApplication:
          row.behaviouralScoreAtApplication?.toString() ?? null,
        predictedRepaymentProbability:
          row.predictedRepaymentProbability?.toString() ?? null,
        snapshotContext:
          'Application-time stored values; model and scoring timestamp unavailable.',
        ...provenance,
      })),
    };
  }
}
