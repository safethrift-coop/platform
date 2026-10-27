import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { requireSavingsSimulation } from './savings-safety';

export const BALANCE_NOTICE =
  'Recorded balance — settlement unverified; may include simulation records.';
const savingsTypes = ['savings_fsa', 'savings_rsa', 'savings_gsa'] as const;
type Account = Prisma.MemberAccountGetPayload<Record<string, never>>;
type FeedRow = {
  id: string;
  source: 'deposit' | 'withdrawal';
  accountId: string;
  accountType: string;
  accountStatus: string;
  amount: string;
  transactionDate: Date;
  status: string;
  isSimulation: boolean | null;
};
type Cursor = {
  v: 1;
  memberId: string;
  accountId: string | null;
  date: string;
  source: 'deposit' | 'withdrawal';
  id: string;
};
export function historyLimit(value: unknown = '20'): number {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d?$/.test(value) ||
    Number(value) > 50
  )
    throw new BadRequestException('Limit must be an integer from 1 to 50');
  return Number(value);
}
function decodeCursor(
  value: unknown,
  memberId: string,
  accountId: string | null,
): Cursor | null {
  if (value === undefined) return null;
  try {
    if (
      typeof value !== 'string' ||
      value.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    )
      throw new Error();
    const c = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Cursor;
    if (
      c.v !== 1 ||
      c.memberId !== memberId ||
      c.accountId !== accountId ||
      !['deposit', 'withdrawal'].includes(c.source) ||
      typeof c.id !== 'string' ||
      c.id.length < 1 ||
      c.id.length > 256 ||
      Array.from(c.id).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      typeof c.date !== 'string' ||
      new Date(c.date).toISOString() !== c.date ||
      Object.keys(c).sort().join(',') !== 'accountId,date,id,memberId,source,v'
    )
      throw new Error();
    return c;
  } catch {
    throw new BadRequestException('Invalid transaction cursor');
  }
}
@Injectable()
export class AccountReadsService {
  constructor(private readonly prisma: PrismaService) {}
  capability(memberStatus: string, account?: Account) {
    let gate = false;
    try {
      requireSavingsSimulation();
      gate = true;
    } catch {
      /* Default closed. */
    }
    const eligible =
      gate &&
      memberStatus === 'active' &&
      (!account ||
        (account.accountStatus === 'active' &&
          savingsTypes.some((t) => t === account.accountType)));
    return {
      deposit: eligible,
      withdrawal:
        eligible &&
        (!account ||
          account.accountType !== 'savings_gsa' ||
          account.goalReached),
      simulationOnly: true as const,
      message: !gate
        ? 'Savings simulation is disabled. No external money moves.'
        : memberStatus !== 'active'
          ? 'Active membership is required for simulation.'
          : 'Local simulation only. Existing account and balance safeguards apply.',
    };
  }
  private project(account: Account, memberStatus: string) {
    return {
      id: account.id,
      accountType: account.accountType,
      accountNumber: account.accountNumber,
      accountStatus: account.accountStatus,
      currentBalance: account.currentBalance.toFixed(2),
      goalTarget: account.goalTarget?.toFixed(2) ?? null,
      goalDeadline: account.goalDeadline?.toISOString() ?? null,
      goalReached: account.goalReached,
      balanceNotice: BALANCE_NOTICE,
      settlement: 'unverified' as const,
      capability: this.capability(memberStatus, account),
    };
  }
  async overview(memberId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await tx.member.findUnique({
          where: { id: memberId },
          select: {
            membershipStatus: true,
            savingsPointsTotal: true,
            currentRiskBand: true,
          },
        });
        if (!member) throw new NotFoundException('Member not found');
        const accounts = await tx.memberAccount.findMany({
          where: {
            memberId,
            accountStatus: 'active',
            accountType: { in: [...savingsTypes] },
          },
          orderBy: [{ openedDate: 'asc' }, { id: 'asc' }],
        });
        return {
          savingsPointsTotal: member.savingsPointsTotal,
          riskBand: member.currentRiskBand,
          membershipStatus: member.membershipStatus,
          accounts: accounts.map((a) =>
            this.project(a, member.membershipStatus),
          ),
          recentActivity: await this.feed(tx, memberId, null, undefined, 5),
          capability: this.capability(member.membershipStatus),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async account(accountId: string, memberId: string) {
    return this.prisma.$transaction(async (tx) => {
      const account = await this.owned(tx, accountId, memberId);
      const member = await tx.member.findUniqueOrThrow({
        where: { id: memberId },
        select: { membershipStatus: true },
      });
      return { ...account, ...this.project(account, member.membershipStatus) };
    });
  }
  private async owned(
    tx: Prisma.TransactionClient,
    accountId: string,
    memberId: string,
  ) {
    const account = await tx.memberAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.memberId !== memberId)
      throw new ForbiddenException('You do not have access to this account');
    if (!savingsTypes.some((t) => t === account.accountType))
      throw new NotFoundException('Savings account not found');
    return account;
  }
  async history(
    accountId: string,
    memberId: string,
    cursor?: string,
    limit = 20,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException('Invalid limit');
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, accountId, memberId);
      return this.feed(tx, memberId, accountId, cursor, limit);
    });
  }
  private async feed(
    tx: Prisma.TransactionClient,
    memberId: string,
    accountId: string | null,
    rawCursor: string | undefined,
    limit: number,
  ) {
    const cursor = decodeCursor(rawCursor, memberId, accountId);
    // Every union branch is member-scoped; account ownership is checked above.
    // COLLATE C makes source/ID tie ordering independent of database locale.
    const rows = await tx.$queryRaw<FeedRow[]>`
      WITH activity AS (
        SELECT s.savings_txn_id AS id, 'deposit'::text AS source, s.account_id AS "accountId", a.account_type::text AS "accountType", a.account_status::text AS "accountStatus",
          s.amount::text AS amount, s.transaction_date AS "transactionDate", s.status::text AS status, s.is_simulation AS "isSimulation"
        FROM savings_transactions s JOIN member_accounts a ON a.account_id=s.account_id
        WHERE s.member_id=${memberId} AND a.member_id=${memberId}
          AND (${accountId}::text IS NULL OR s.account_id=${accountId})
          AND a.account_type::text IN ('savings_fsa','savings_rsa','savings_gsa')
        UNION ALL
        SELECT w.withdrawal_txn_id, 'withdrawal'::text, w.account_id, a.account_type::text, a.account_status::text,
          w.amount::text, w.transaction_date, w.status::text, w.is_simulation
        FROM withdrawal_transactions w JOIN member_accounts a ON a.account_id=w.account_id
        WHERE w.member_id=${memberId} AND a.member_id=${memberId}
          AND (${accountId}::text IS NULL OR w.account_id=${accountId})
          AND a.account_type::text IN ('savings_fsa','savings_rsa','savings_gsa')
      ) SELECT * FROM activity
      WHERE (${cursor?.date ?? null}::timestamp IS NULL
        OR "transactionDate" < ${cursor?.date ?? null}::timestamp
        OR ("transactionDate" = ${cursor?.date ?? null}::timestamp AND source COLLATE "C" > ${cursor?.source ?? null} COLLATE "C")
        OR ("transactionDate" = ${cursor?.date ?? null}::timestamp AND source=${cursor?.source ?? null} AND id COLLATE "C" < ${cursor?.id ?? null} COLLATE "C"))
      ORDER BY "transactionDate" DESC, source COLLATE "C" ASC, id COLLATE "C" DESC LIMIT ${limit + 1}`;
    const selected = rows.slice(0, limit);
    const items = selected.map((row) => ({
      ...row,
      id: `${row.source}:${row.id}`,
      transactionDate: row.transactionDate.toISOString(),
      provenance:
        row.isSimulation === true
          ? ('simulation' as const)
          : row.isSimulation === null
            ? ('historical_unknown' as const)
            : ('unverified' as const),
      settlement:
        row.isSimulation === true
          ? ('not_settled' as const)
          : ('unverified' as const),
    }));
    const last = selected.at(-1);
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              memberId,
              accountId,
              date: last.transactionDate.toISOString(),
              source: last.source,
              id: last.id,
            }),
          ).toString('base64url')
        : null;
    return {
      items,
      deposits: items.filter((i) => i.source === 'deposit'),
      withdrawals: items.filter((i) => i.source === 'withdrawal'),
      nextCursor,
      hasMore,
    };
  }
}
