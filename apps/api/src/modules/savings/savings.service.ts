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
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SavingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
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
    idempotencyKey: string,
  ): Promise<unknown> {
    // Step 1 — Check for duplicate request using idempotency key
    const existing = await this.prisma.savingsTransaction.findFirst({
      where: { idempotencyKey },
    });

    if (existing) {
      // Return the original transaction — do not process again
      this.logger.info('Duplicate deposit request — returning original', {
        idempotencyKey,
        transactionId: existing.id,
      });
      return existing;
    }

    // Step 2 — Fetch and validate the account
    const account = await this.prisma.memberAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.memberId !== memberId) {
      throw new ForbiddenException('You do not have access to this account');
    }

    if (account.accountStatus !== 'active') {
      throw new BadRequestException(
        'You can only deposit into an active account',
      );
    }

    // Step 3 — Convert amount to Decimal for safe arithmetic
    const depositAmount = new Decimal(dto.amount);
    const currentBalance = new Decimal(account.currentBalance.toString());
    const newBalance = currentBalance.plus(depositAmount);

    // Step 4 — Create the transaction and update balance atomically
    // Both operations happen together or neither happens
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the transaction record first
      const transaction = await tx.savingsTransaction.create({
        data: {
          memberId,
          accountId,
          amount: depositAmount.toNumber(),
          transactionType: 'deposit',
          status: 'completed',
          idempotencyKey,
          referenceNumber: `DEP-${uuidv4().slice(0, 8).toUpperCase()}`,
          channel: 'web_portal',
        },
      });

      // Then update the balance
      await tx.memberAccount.update({
        where: { id: accountId },
        data: {
          currentBalance: newBalance.toNumber(),
        },
      });

      return transaction;
    });

    // Step 5 — Check if GSA goal has been reached
    if (account.accountType === 'savings_gsa' && account.goalTarget) {
      const goalTarget = new Decimal(account.goalTarget.toString());

      if (newBalance.gte(goalTarget) && !account.goalReached) {
        await this.prisma.memberAccount.update({
          where: { id: accountId },
          data: { goalReached: true },
        });

        this.logger.info('GSA goal reached', {
          memberId,
          accountId,
          goalTarget: goalTarget.toString(),
          finalBalance: newBalance.toString(),
        });
      }
    }

    this.logger.info('Deposit completed', {
      memberId,
      accountId,
      amount: depositAmount.toString(),
      newBalance: newBalance.toString(),
      transactionId: result.id,
    });

    return {
      transaction: result,
      newBalance: newBalance.toNumber(),
    };
  }

  async withdraw(
    accountId: string,
    memberId: string,
    dto: WithdrawDto,
    idempotencyKey: string,
  ): Promise<unknown> {
    // Step 1 — Idempotency check
    const existing = await this.prisma.withdrawalTransaction.findFirst({
      where: { idempotencyKey },
    });

    if (existing) {
      return existing;
    }

    // Step 2 — Fetch and validate the account
    const account = await this.prisma.memberAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.memberId !== memberId) {
      throw new ForbiddenException('You do not have access to this account');
    }

    if (account.accountStatus !== 'active') {
      throw new BadRequestException(
        'You can only withdraw from an active account',
      );
    }

    // Step 3 — GSA withdrawal rules
    // Members can only withdraw from a GSA when the goal is reached
    // or after the cooling-off period (we treat this as goal not reached yet)
    if (account.accountType === 'savings_gsa' && !account.goalReached) {
      throw new BadRequestException(
        'You can only withdraw from your goal-based account once your savings goal has been reached',
      );
    }

    // Step 4 — Check sufficient balance
    const withdrawAmount = new Decimal(dto.amount);
    const currentBalance = new Decimal(account.currentBalance.toString());

    if (withdrawAmount.gt(currentBalance)) {
      throw new BadRequestException(
        `Insufficient balance. Your current balance is £${currentBalance.toFixed(2)}`,
      );
    }

    const newBalance = currentBalance.minus(withdrawAmount);

    // Step 5 — Create withdrawal record and update balance atomically
    const result = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.withdrawalTransaction.create({
        data: {
          memberId,
          accountId,
          amount: withdrawAmount.toNumber(),
          withdrawalReason: dto.reason ?? null,
          status: 'completed',
          idempotencyKey,
          referenceNumber: `WDR-${uuidv4().slice(0, 8).toUpperCase()}`,
          channel: 'web_portal',
        },
      });

      await tx.memberAccount.update({
        where: { id: accountId },
        data: { currentBalance: newBalance.toNumber() },
      });

      return transaction;
    });

    this.logger.info('Withdrawal completed', {
      memberId,
      accountId,
      amount: withdrawAmount.toString(),
      newBalance: newBalance.toString(),
    });

    return {
      transaction: result,
      newBalance: newBalance.toNumber(),
    };
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
