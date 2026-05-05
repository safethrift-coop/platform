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
    const amount = new Decimal(payload.amount);
    let pointsToAward = 0;

    if (payload.accountType === 'savings_fsa') {
      // FSA: straightforward — multiply amount by rate
      pointsToAward = amount.times(POINTS_RATE_FSA).floor().toNumber();
    } else if (payload.accountType === 'savings_rsa') {
      // RSA: enhanced rate — 1.5 points per £1
      pointsToAward = amount.times(POINTS_RATE_RSA).floor().toNumber();
    } else if (payload.accountType === 'savings_gsa') {
      // GSA: check if this deposit hit a milestone
      // If it did, award the bonus rate. Otherwise award normal rate.
      const isMilestoneDeposit = this.checkGsaMilestone(
        payload.newBalance,
        payload.goalTarget,
        amount.toNumber(),
      );

      const rate = isMilestoneDeposit
        ? POINTS_RATE_GSA_MILESTONE
        : POINTS_RATE_GSA_NORMAL;

      pointsToAward = amount.times(rate).floor().toNumber();

      if (isMilestoneDeposit) {
        this.logger.info('GSA milestone reached — bonus points awarded', {
          memberId: payload.memberId,
          accountId: payload.accountId,
          newBalance: payload.newBalance,
          goalTarget: payload.goalTarget,
          bonusPoints: pointsToAward,
        });
      }
    }

    // If no points to award, stop here
    if (pointsToAward <= 0) {
      return;
    }

    // Update the member's total points in the database
    // We read the current total first, add the new points, then save
    const member = await this.prisma.member.findUnique({
      where: { id: payload.memberId },
      select: { id: true, savingsPointsTotal: true },
    });

    if (!member) {
      this.logger.error('Member not found during points calculation', {
        memberId: payload.memberId,
      });
      return;
    }

    const newTotal = member.savingsPointsTotal + pointsToAward;

    await this.prisma.member.update({
      where: { id: payload.memberId },
      data: { savingsPointsTotal: newTotal },
    });

    this.logger.info('Points awarded', {
      memberId: payload.memberId,
      accountType: payload.accountType,
      depositAmount: payload.amount,
      pointsAwarded: pointsToAward,
      newTotal,
    });
  }

  // Checks if a deposit crossed a GSA milestone threshold.
  // Example: goal is £1000, previous balance was £240, new balance is £260.
  // The 25% milestone (£250) was crossed by this deposit, so it returns true.
  private checkGsaMilestone(
    newBalance: number,
    goalTarget: number | null,
    depositAmount: number,
  ): boolean {
    // If there is no goal target, there can be no milestone
    if (!goalTarget || goalTarget <= 0) {
      return false;
    }

    const previousBalance = newBalance - depositAmount;

    // Check each milestone percentage
    for (const milestone of GSA_MILESTONES) {
      const milestoneAmount = goalTarget * milestone;

      // The deposit crossed this milestone if:
      // - the previous balance was below the milestone amount
      // - the new balance is at or above the milestone amount
      if (previousBalance < milestoneAmount && newBalance >= milestoneAmount) {
        return true;
      }
    }

    return false;
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
        (sum: number, txn: { amount: { toString: () => string } }) => {
          return sum + new Decimal(txn.amount.toString()).toNumber();
        },
        0,
      );
      if (account.accountType === 'savings_fsa') {
        fsaPoints += Math.floor(totalDeposited * POINTS_RATE_FSA);
      } else if (account.accountType === 'savings_rsa') {
        rsaPoints += Math.floor(totalDeposited * POINTS_RATE_RSA);
      } else if (account.accountType === 'savings_gsa') {
        gsaPoints += Math.floor(totalDeposited * POINTS_RATE_GSA_NORMAL);
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
