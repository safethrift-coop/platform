import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type { SavingsDepositedPayload } from '../points/points.events';
import {
  databaseCode,
  requireSavingsSimulation,
  retrySavingsTransaction,
  validateMutation,
} from './savings-safety';
import { SAVINGS_DEPOSITED_EVENT } from '../points/points.events';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { OpenAccountDto, AccountType } from './dto/open-account.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class SavingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async openAccount(memberId: string, dto: OpenAccountDto): Promise<unknown> {
    // Step 1 — Check the member exists and is active
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, membershipStatus: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.membershipStatus !== 'active') {
      throw new ForbiddenException(
        'Your membership must be active before you can open a savings account',
      );
    }

    // Step 2 — Check the member does not already have this account type
    // Each member can only have one FSA, one RSA, and one GSA
    const existingAccount = await this.prisma.memberAccount.findFirst({
      where: {
        memberId,
        accountType: dto.accountType,
        accountStatus: { not: 'closed' },
      },
    });

    if (existingAccount) {
      throw new ConflictException(
        `You already have an open ${dto.accountType} account`,
      );
    }

    // Step 3 — GSA-specific validation
    // A goal-based account requires a target amount and deadline
    if (dto.accountType === AccountType.GSA) {
      if (!dto.goalTarget) {
        throw new BadRequestException(
          'A goal-based savings account requires a target amount',
        );
      }

      if (!dto.goalDeadline) {
        throw new BadRequestException(
          'A goal-based savings account requires a target deadline',
        );
      }

      const deadline = new Date(dto.goalDeadline);
      const today = new Date();

      if (deadline <= today) {
        throw new BadRequestException(
          'The goal deadline must be in the future',
        );
      }
    }

    // Step 4 — Generate a unique account number
    const accountNumber = await this.generateAccountNumber(dto.accountType);

    // Step 5 — Create the account
    const account = await this.prisma.memberAccount.create({
      data: {
        memberId,
        accountType: dto.accountType,
        accountNumber,
        accountStatus: 'active',
        currentBalance: 0,
        goalTarget: dto.goalTarget ?? null,
        goalDeadline: dto.goalDeadline ? new Date(dto.goalDeadline) : null,
        goalReached: false,
      },
    });

    this.logger.info('Savings account opened', {
      memberId,
      accountId: account.id,
      accountType: dto.accountType,
      accountNumber,
    });

    return account;
  }

  async getAccounts(memberId: string): Promise<unknown[]> {
    // Return all accounts for this member, regardless of status
    const accounts = await this.prisma.memberAccount.findMany({
      where: { memberId },
      orderBy: { openedDate: 'asc' },
    });

    return accounts;
  }

  async getAccount(accountId: string, memberId: string): Promise<unknown> {
    const account = await this.prisma.memberAccount.findUnique({
      where: { id: accountId },
    });

    // Step 1 — Check the account exists
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // Step 2 — Check the account belongs to this member
    // This is the ownership check — a member cannot see another member's account
    if (account.memberId !== memberId) {
      throw new ForbiddenException('You do not have access to this account');
    }

    return account;
  }

  async deposit(
    accountId: string,
    memberId: string,
    dto: DepositDto,
    key: string,
  ): Promise<unknown> {
    return this.mutate(
      'deposit',
      accountId,
      memberId,
      dto.amount,
      dto.note,
      key,
    );
  }

  async withdraw(
    accountId: string,
    memberId: string,
    dto: WithdrawDto,
    key: string,
  ): Promise<unknown> {
    return this.mutate(
      'withdrawal',
      accountId,
      memberId,
      dto.amount,
      dto.reason,
      key,
    );
  }

  private async mutate(
    operation: 'deposit' | 'withdrawal',
    accountId: string,
    memberId: string,
    input: string,
    detail: string | undefined,
    key: string,
  ): Promise<unknown> {
    requireSavingsSimulation();
    const amount = validateMutation(input, key);
    if (
      detail !== undefined &&
      (typeof detail !== 'string' ||
        detail.length > (operation === 'deposit' ? 200 : 500))
    ) {
      throw new BadRequestException('Invalid transaction detail');
    }
    const payload = JSON.stringify({ amount, detail: detail ?? null });
    const replay = (request: {
      memberId: string;
      accountId: string;
      operation: string;
      payload: string;
      response: Prisma.JsonValue | null;
    }) => {
      if (
        request.memberId !== memberId ||
        request.accountId !== accountId ||
        request.operation !== operation ||
        request.payload !== payload
      ) {
        throw new ConflictException(
          'Idempotency-Key is already bound to a different request',
        );
      }
      if (!request.response)
        throw new ConflictException(
          'Request outcome is unavailable; do not create a replacement operation',
        );
      return request.response;
    };

    let outcome: {
      response: Prisma.JsonValue;
      event?: SavingsDepositedPayload;
    };
    try {
      outcome = await retrySavingsTransaction(() =>
        this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.savingsRequest.findUnique({
              where: { key },
            });
            if (existing) return { response: replay(existing) };

            // Old rows have no saved response or request detail. Never invent either.
            const [oldDeposit, oldWithdrawal] = await Promise.all([
              tx.savingsTransaction.findUnique({
                where: { idempotencyKey: key },
                select: { id: true },
              }),
              tx.withdrawalTransaction.findUnique({
                where: { idempotencyKey: key },
                select: { id: true },
              }),
            ]);
            if (oldDeposit || oldWithdrawal)
              throw new ConflictException(
                'Legacy Idempotency-Key cannot be safely replayed; manual review required',
              );

            await tx.savingsRequest.create({
              data: { key, memberId, accountId, operation, payload },
            });
            const member = await tx.member.findUnique({
              where: { id: memberId },
              select: { membershipStatus: true },
            });
            if (!member || member.membershipStatus !== 'active')
              throw new ForbiddenException('Active membership is required');
            const account = await tx.memberAccount.findUnique({
              where: { id: accountId },
            });
            if (!account) throw new NotFoundException('Account not found');
            if (account.memberId !== memberId)
              throw new ForbiddenException(
                'You do not have access to this account',
              );
            if (
              account.accountStatus !== 'active' ||
              !['savings_fsa', 'savings_rsa', 'savings_gsa'].includes(
                account.accountType,
              )
            ) {
              throw new BadRequestException(
                'An active savings account is required',
              );
            }
            if (
              operation === 'withdrawal' &&
              account.accountType === 'savings_gsa' &&
              !account.goalReached
            ) {
              throw new BadRequestException(
                'The savings goal must be reached before withdrawal',
              );
            }
            const updated = await tx.memberAccount.updateMany({
              where: {
                id: accountId,
                memberId,
                accountStatus: 'active',
                ...(operation === 'withdrawal'
                  ? { currentBalance: { gte: amount } }
                  : {}),
              },
              data: {
                currentBalance:
                  operation === 'deposit'
                    ? { increment: amount }
                    : { decrement: amount },
              },
            });
            if (updated.count !== 1)
              throw new BadRequestException(
                'Insufficient balance or unavailable account',
              );
            const after = await tx.memberAccount.findUniqueOrThrow({
              where: { id: accountId },
            });
            // Preserve the existing once-reached GSA rule, but set it atomically.
            const reached =
              after.goalReached ||
              (after.accountType === 'savings_gsa' &&
                after.goalTarget !== null &&
                new Decimal(after.currentBalance.toString()).gte(
                  after.goalTarget.toString(),
                ));
            if (reached !== after.goalReached)
              await tx.memberAccount.update({
                where: { id: accountId },
                data: { goalReached: reached },
              });
            const common = {
              memberId,
              accountId,
              amount,
              status: 'completed' as const,
              idempotencyKey: key,
              isSimulation: true,
              channel: 'simulation',
              referenceNumber: `${operation === 'deposit' ? 'DEP' : 'WDR'}-${randomUUID()}`,
            };
            const transaction =
              operation === 'deposit'
                ? await tx.savingsTransaction.create({
                    data: {
                      ...common,
                      transactionType: 'deposit',
                      metadata: JSON.stringify({
                        simulation: true,
                        note: detail ?? null,
                      }),
                    },
                  })
                : await tx.withdrawalTransaction.create({
                    data: { ...common, withdrawalReason: detail ?? null },
                  });
            const newBalance = new Decimal(
              after.currentBalance.toString(),
            ).toFixed(2);
            // Persist exactly the JSON returned to both the original caller and replays.
            const response = JSON.parse(
              JSON.stringify({
                transaction: { ...transaction, amount },
                newBalance,
                simulation: true,
                settlement: 'not_settled',
              }),
            ) as Prisma.JsonObject;
            const event: SavingsDepositedPayload | undefined =
              operation === 'deposit'
                ? {
                    transactionId: transaction.id,
                    memberId,
                    accountId,
                    accountType: after.accountType,
                    amount,
                    newBalance,
                    goalTarget:
                      after.goalTarget === null
                        ? null
                        : new Decimal(after.goalTarget.toString()).toFixed(2),
                    goalReached: reached,
                    simulation: true,
                  }
                : undefined;
            await tx.savingsRequest.update({
              where: { key },
              data: {
                transactionId: transaction.id,
                response,
                ...(event ? { event: { ...event } } : {}),
              },
            });
            return { response, event };
          },
          { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 },
        ),
      );
    } catch (error) {
      if (databaseCode(error) !== 'P2002') throw error;
      // A competing claim rolled back this entire attempt. Read only committed state.
      const existing = await this.prisma.savingsRequest.findUnique({
        where: { key },
      });
      if (!existing) throw error; // An unrelated unique constraint must not be treated as replay.
      return replay(existing);
    }
    if (outcome.event) {
      try {
        await this.eventEmitter.emitAsync(
          SAVINGS_DEPOSITED_EVENT,
          outcome.event,
        );
      } catch (error) {
        this.logger.error(
          'Post-commit savings event failed; financial state is committed',
          {
            transactionId: outcome.event.transactionId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    return outcome.response;
  }

  async getTransactions(
    accountId: string,
    memberId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<unknown> {
    // Step 1 — Verify account ownership
    const account = await this.prisma.memberAccount.findUnique({
      where: { id: accountId },
      select: { id: true, memberId: true },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.memberId !== memberId) {
      throw new ForbiddenException('You do not have access to this account');
    }

    // Step 2 — Fetch deposits
    const deposits = await this.prisma.savingsTransaction.findMany({
      where: { accountId },
      orderBy: { transactionDate: 'desc' },
      take: limit,
      // If a cursor is provided, start after that record
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    // Step 3 — Fetch withdrawals separately
    const withdrawals = await this.prisma.withdrawalTransaction.findMany({
      where: { accountId },
      orderBy: { transactionDate: 'desc' },
      take: limit,
    });

    // Step 4 — Get the cursor for the next page
    // If we got a full page of results, there are probably more
    const nextCursor =
      deposits.length === limit ? deposits[deposits.length - 1]?.id : null;

    return {
      deposits,
      withdrawals,
      nextCursor,
      hasMore: deposits.length === limit,
    };
  }

  // Private helper — generates a unique account number
  private async generateAccountNumber(accountType: string): Promise<string> {
    const count = await this.prisma.memberAccount.count();
    const padded = String(count + 1).padStart(8, '0');

    // Prefix by account type so numbers are self-describing
    const prefix =
      accountType === 'savings_fsa'
        ? 'FSA'
        : accountType === 'savings_rsa'
          ? 'RSA'
          : 'GSA';

    return `ST-${prefix}-${padded}`;
  }
}
