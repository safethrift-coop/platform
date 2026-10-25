import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { SAVINGS_DEPOSITED_EVENT } from './compliance.events';
import type { SavingsDepositedPayload } from './compliance.events';
import Decimal from 'decimal.js';

// AML rule thresholds
// These match UK financial crime guidance for cooperative finance
const LARGE_DEPOSIT_THRESHOLD = 5000; // Flag any single deposit over £5,000
const HIGH_VELOCITY_COUNT = 5; // Flag if more than 5 deposits in 24 hours
const HIGH_VELOCITY_HOURS = 24; // The time window for velocity check
const MONTHLY_SPIKE_MULTIPLIER = 3; // Flag if monthly total > 3x the average
const ROUND_AMOUNT_THRESHOLD = 3; // Flag if 3+ consecutive round amounts

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  //HandleDeposit - the AML event listener.
  @OnEvent(SAVINGS_DEPOSITED_EVENT)
  async handleDeposit(payload: SavingsDepositedPayload): Promise<void> {
    // Run all AML checks in parallel after every deposit
    // We catch errors per check so one failing rule does not block others
    await Promise.allSettled([
      this.checkLargeDeposit(payload),
      this.checkHighVelocity(payload),
      this.checkMonthlySpike(payload),
      this.checkRoundAmountPattern(payload),
    ]);
  }

  // Check for large single deposits
  private async checkLargeDeposit(
    payload: SavingsDepositedPayload,
  ): Promise<void> {
    if (new Decimal(payload.amount).lt(LARGE_DEPOSIT_THRESHOLD)) {
      return; // Not a large deposit — no flag needed
    }

    await this.createFlag(
      payload.memberId,
      'large_single_deposit',
      `Single deposit of £${new Decimal(payload.amount).toFixed(2)} exceeds the £${LARGE_DEPOSIT_THRESHOLD} threshold`,
      { amount: payload.amount, accountId: payload.accountId },
    );
  }

  // Check for high velocity of deposits
  private async checkHighVelocity(
    payload: SavingsDepositedPayload,
  ): Promise<void> {
    // Calculate the start of the 24-hour window
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - HIGH_VELOCITY_HOURS);

    // Count deposits in the last 24 hours for this member
    const recentDepositCount = await this.prisma.savingsTransaction.count({
      where: {
        memberId: payload.memberId,
        transactionDate: { gte: windowStart },
        status: 'completed',
      },
    });

    if (recentDepositCount <= HIGH_VELOCITY_COUNT) {
      return; // Normal activity — no flag needed
    }

    await this.createFlag(
      payload.memberId,
      'high_velocity',
      `${recentDepositCount} deposits made in the last ${HIGH_VELOCITY_HOURS} hours, ` +
        `exceeding the threshold of ${HIGH_VELOCITY_COUNT}`,
      {
        depositCount: recentDepositCount,
        windowHours: HIGH_VELOCITY_HOURS,
      },
    );
  }

  // Check for monthly deposit spikes
  private async checkMonthlySpike(
    payload: SavingsDepositedPayload,
  ): Promise<void> {
    // Get the first day of the current month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Get the start of the 6-month historical window for average calculation
    const historicalStart = new Date();
    historicalStart.setMonth(historicalStart.getMonth() - 6);

    // Sum all deposits this month
    const thisMonthDeposits = await this.prisma.savingsTransaction.findMany({
      where: {
        memberId: payload.memberId,
        transactionDate: { gte: monthStart },
        status: 'completed',
      },
      select: { amount: true },
    });

    const thisMonthTotal = thisMonthDeposits.reduce(
      (sum: Decimal, d: { amount: { toString: () => string } }) =>
        sum.plus(d.amount.toString()),
      new Decimal(0),
    );

    // Sum all deposits in the previous 6 months to calculate the average
    const historicalDeposits = await this.prisma.savingsTransaction.findMany({
      where: {
        memberId: payload.memberId,
        transactionDate: { gte: historicalStart, lt: monthStart },
        status: 'completed',
      },
      select: { amount: true },
    });

    // If no historical data, we cannot calculate a spike — skip
    if (historicalDeposits.length === 0) {
      return;
    }

    const historicalTotal = historicalDeposits.reduce(
      (sum: Decimal, d: { amount: { toString: () => string } }) =>
        sum.plus(d.amount.toString()),
      new Decimal(0),
    );

    // Average monthly deposit over the historical window
    const monthlyAverage = historicalTotal.div(6);

    // If no historical average, skip — cannot compare to zero
    if (monthlyAverage.isZero()) {
      return;
    }

    // Check if this month's total exceeds the spike threshold
    if (thisMonthTotal.lt(monthlyAverage.times(MONTHLY_SPIKE_MULTIPLIER))) {
      return; // Normal activity
    }

    await this.createFlag(
      payload.memberId,
      'monthly_spike',
      `This month's deposits total £${thisMonthTotal.toFixed(2)}, ` +
        `which is ${thisMonthTotal.div(monthlyAverage).toFixed(1)}x the ` +
        `6-month average of £${monthlyAverage.toFixed(2)}`,
      {
        thisMonthTotal: thisMonthTotal.toString(),
        monthlyAverage: monthlyAverage.toString(),
        multiplier: thisMonthTotal.div(monthlyAverage).toString(),
      },
    );
  }

  // Check round amounts pattern.
  private async checkRoundAmountPattern(
    payload: SavingsDepositedPayload,
  ): Promise<void> {
    // Get the last 10 deposits for this member
    const recentDeposits = await this.prisma.savingsTransaction.findMany({
      where: {
        memberId: payload.memberId,
        status: 'completed',
      },
      orderBy: { transactionDate: 'desc' },
      take: 10,
      select: { amount: true },
    });

    if (recentDeposits.length < ROUND_AMOUNT_THRESHOLD) {
      return; // Not enough deposits to detect a pattern
    }

    // Count consecutive round amounts from the most recent deposit
    // A "round amount" is divisible by 100 with no remainder
    let consecutiveRoundCount = 0;

    for (const deposit of recentDeposits) {
      const amount = new Decimal(deposit.amount.toString());

      // Check if the amount is a round number (divisible by 100)
      if (amount.mod(100).isZero()) {
        consecutiveRoundCount++;
      } else {
        // As soon as we see a non-round amount, the streak is broken
        break;
      }
    }

    if (consecutiveRoundCount < ROUND_AMOUNT_THRESHOLD) {
      return; // Not enough consecutive round amounts
    }

    await this.createFlag(
      payload.memberId,
      'round_amount_pattern',
      `${consecutiveRoundCount} consecutive round-number deposits detected. ` +
        `This pattern may indicate structuring.`,
      {
        consecutiveRoundCount,
        latestAmount: payload.amount,
      },
    );
  }

  // Helper method to create a compliance flag in the database
  private async createFlag(
    memberId: string,
    flagType: string,
    description: string,
    triggerData: Record<string, unknown>,
  ): Promise<void> {
    // Check if an identical open flag already exists for this member
    // We do not create duplicate flags for the same issue
    const existingFlag = await this.prisma.complianceFlag.findFirst({
      where: {
        memberId,
        flagType: flagType as any,
        status: { in: ['open', 'under_review'] },
      },
    });

    if (existingFlag) {
      // Flag already exists — do not create a duplicate
      return;
    }

    await this.prisma.complianceFlag.create({
      data: {
        memberId,
        flagType: flagType as any,
        status: 'open',
        description,
        triggerData: JSON.stringify(triggerData),
      },
    });

    this.logger.warn('AML flag created', {
      memberId,
      flagType,
      description,
    });
  }

  // Staff facing methods to manage flags (e.g. review, close) would go here
  async getOpenFlags(): Promise<unknown[]> {
    // Returns all open flags ordered by oldest first
    // Oldest flags should be reviewed first
    const flags = await this.prisma.complianceFlag.findMany({
      where: { status: { in: ['open', 'under_review'] } },
      orderBy: { createdAt: 'asc' },
    });

    return flags;
  }

  async getFlagsForMember(memberId: string): Promise<unknown[]> {
    const flags = await this.prisma.complianceFlag.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
    });

    return flags;
  }

  async updateFlag(
    flagId: string,
    reviewedBy: string,
    status: string,
    reviewNotes: string,
  ): Promise<unknown> {
    const flag = await this.prisma.complianceFlag.findUnique({
      where: { id: flagId },
    });

    if (!flag) {
      throw new NotFoundException('Flag not found');
    }

    // Validate the status transition
    const validStatuses = ['under_review', 'resolved', 'escalated'];

    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Status must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const updated = await this.prisma.complianceFlag.update({
      where: { id: flagId },
      data: {
        status: status as any,
        reviewedBy,
        reviewNotes,
        resolvedAt: status === 'resolved' ? new Date() : null,
      },
    });

    this.logger.info('Compliance flag updated', {
      flagId,
      memberId: flag.memberId,
      newStatus: status,
      reviewedBy,
    });

    return updated;
  }

  async generateSarDraft(memberId: string): Promise<Record<string, unknown>> {
    // Gather all the data needed for a Suspicious Activity Report
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        membershipNumber: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        city: true,
        postcode: true,
        membershipStatus: true,
        joinedDate: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Get all compliance flags for this member
    const flags = await this.prisma.complianceFlag.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
    });

    // Get recent transaction history
    const recentTransactions = await this.prisma.savingsTransaction.findMany({
      where: { memberId },
      orderBy: { transactionDate: 'desc' },
      take: 20,
      select: {
        transactionDate: true,
        amount: true,
        transactionType: true,
        referenceNumber: true,
      },
    });

    // Return a structured draft the compliance officer can review and submit
    return {
      generatedAt: new Date().toISOString(),
      reportType: 'Suspicious Activity Report — Draft',
      subject: {
        membershipNumber: member.membershipNumber,
        name: `${member.firstName} ${member.lastName}`,
        dateOfBirth: member.dateOfBirth,
        location: `${member.city}, ${member.postcode}`,
        joinedDate: member.joinedDate,
        membershipStatus: member.membershipStatus,
      },
      suspiciousActivity: {
        numberOfFlags: flags.length,
        flags: flags.map((f: any) => ({
          type: f.flagType,
          description: f.description,
          detectedAt: f.createdAt,
          status: f.status,
        })),
      },
      transactionHistory: recentTransactions,
      instructions:
        'This is a draft SAR. Please review all information for accuracy before submitting to the NCA via the UKFIU reporting portal at www.nationalcrimeagency.gov.uk.',
    };
  }
}
