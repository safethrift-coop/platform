import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { SAVINGS_DEPOSITED_EVENT } from './points.events';
import type { SavingsDepositedPayload } from './points.events';
import Decimal from 'decimal.js';

// Points rates per account type
// These are constants so they are easy to find and change
const POINTS_RATE_FSA = 1; // 1 point per £1
const POINTS_RATE_RSA = 1.5; // 1.5 points per £1
const POINTS_RATE_GSA_NORMAL = 1; // 1 point per £1 normally
const POINTS_RATE_GSA_MILESTONE = 2; // 2 points per £1 on milestone deposits

// GSA milestone thresholds as percentages
// Points bonus triggers at 25%, 50%, 75%, and 100% of the goal
const GSA_MILESTONES = [0.25, 0.5, 0.75, 1.0];

@Injectable()
export class PointsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  // This method runs automatically when a deposit happens.
  // It listens for the 'savings.deposited' event fired by SavingsService.
  @OnEvent(SAVINGS_DEPOSITED_EVENT)
  async handleDeposit(payload: SavingsDepositedPayload): Promise<void> {
    try {
      await this.calculateAndAwardPoints(payload);
    } catch (error) {
      // We catch errors here because an event listener failure
      // should never affect the deposit that already succeeded.
      // The deposit is committed to the database — points are secondary.
      this.logger.error('Failed to calculate points after deposit', {
        memberId: payload.memberId,
        accountId: payload.accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async calculateAndAwardPoints(
    payload: SavingsDepositedPayload,
  ): Promise<void> {
    // Validate against the committed request; do not trust event amounts or replay
    // historical deposits whose previous processing cannot be established.
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.savingsRequest.findUnique({
        where: { transactionId: payload.transactionId },
      });
      if (!request || request.operation !== 'deposit' || !request.event)
        throw new Error('No committed simulated deposit event');
      const event = request.event as unknown as SavingsDepositedPayload;
      const transaction = await tx.savingsTransaction.findUniqueOrThrow({
        where: { id: payload.transactionId },
      });
      if (
        !transaction.isSimulation ||
        transaction.status !== 'completed' ||
        transaction.memberId !== request.memberId ||
        transaction.accountId !== request.accountId ||
        event.transactionId !== transaction.id
      )
        throw new Error('Invalid committed deposit');
      const amount = new Decimal(transaction.amount.toString());
      let rate = new Decimal(0);
      if (event.accountType === 'savings_fsa')
        rate = new Decimal(POINTS_RATE_FSA);
      if (event.accountType === 'savings_rsa')
        rate = new Decimal(POINTS_RATE_RSA);
      if (event.accountType === 'savings_gsa') {
        const milestone =
          event.goalTarget !== null &&
          new Decimal(event.goalTarget).gt(0) &&
          GSA_MILESTONES.some((fraction) => {
            const target = new Decimal(event.goalTarget!).times(
              String(fraction),
            );
            return (
              new Decimal(event.newBalance).minus(amount).lt(target) &&
              new Decimal(event.newBalance).gte(target)
            );
          });
        rate = new Decimal(
          milestone ? POINTS_RATE_GSA_MILESTONE : POINTS_RATE_GSA_NORMAL,
        );
      }
      const points = amount.times(rate).floor().toNumber(); // Integer points, never monetary arithmetic.
      const receipt = await tx.savingsPointsReceipt.createMany({
        data: [{ transactionId: transaction.id, points }],
        skipDuplicates: true,
      });
      if (receipt.count === 1 && points > 0)
        await tx.member.update({
          where: { id: transaction.memberId },
          data: { savingsPointsTotal: { increment: points } },
        });
    });
  }

  // Returns the member's current points balance and breakdown
  async getMyPoints(memberId: string): Promise<{
    total: number;
    breakdown: {
      fsaDeposits: number;
      rsaDeposits: number;
      gsaDeposits: number;
    };
  }> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { savingsPointsTotal: true },
    });

    if (!member) {
      return {
        total: 0,
        breakdown: { fsaDeposits: 0, rsaDeposits: 0, gsaDeposits: 0 },
      };
    }

    // Calculate breakdown by summing deposits per account type
    // We group by account type to show how points were earned
    const accounts = await this.prisma.memberAccount.findMany({
      where: { memberId },
      select: { id: true, accountType: true },
    });

    // Start each counter at zero
    let fsaPoints = 0;
    let rsaPoints = 0;
    let gsaPoints = 0;

    // For each account, sum up the deposits and apply the rate
    for (const account of accounts) {
      const deposits = await this.prisma.savingsTransaction.findMany({
        where: { accountId: account.id, status: 'completed' },
        select: { amount: true },
      });

      // Add up all deposit amounts for this account
      const totalDeposited = deposits.reduce(
        (sum: Decimal, txn: { amount: { toString: () => string } }) =>
          sum.plus(txn.amount.toString()),
        new Decimal(0),
      );
      if (account.accountType === 'savings_fsa') {
        fsaPoints += totalDeposited.times(POINTS_RATE_FSA).floor().toNumber();
      } else if (account.accountType === 'savings_rsa') {
        rsaPoints += totalDeposited.times(POINTS_RATE_RSA).floor().toNumber();
      } else if (account.accountType === 'savings_gsa') {
        gsaPoints += totalDeposited
          .times(POINTS_RATE_GSA_NORMAL)
          .floor()
          .toNumber();
      }
    }

    return {
      total: member.savingsPointsTotal,
      breakdown: {
        fsaDeposits: fsaPoints,
        rsaDeposits: rsaPoints,
        gsaDeposits: gsaPoints,
      },
    };
  }

  // Returns recent savings transactions as a points history log
  async getPointsHistory(memberId: string): Promise<unknown[]> {
    const transactions = await this.prisma.savingsTransaction.findMany({
      where: { memberId, status: 'completed' },
      orderBy: { transactionDate: 'desc' },
      take: 50,
      select: {
        id: true,
        transactionDate: true,
        amount: true,
        transactionType: true,
        accountId: true,
      },
    });

    return transactions;
  }
}
