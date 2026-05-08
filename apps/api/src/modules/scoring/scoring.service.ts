import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import Decimal from 'decimal.js';
import {
  FEATURE_WINDOW_MONTHS,
  MODEL_COEFFICIENTS,
  MODEL_VERSION,
  MODEL_NAME,
  RISK_THRESHOLDS,
} from './scoring.constants';

// This interface describes the five computed features — the xi vector
interface BehaviouralFeatures {
  savingsRegularity: number;
  savingsConsistency: number;
  withdrawalDiscipline: number;
  incomeStability: number;
  responseToReminders: number;
}

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  // ComputeAndSaveScore This is the main method. It computes features, calculates the score, saves the result, and updates the member's risk band.
  async computeAndSaveScore(memberId: string): Promise<unknown> {
    // Step 1 — Check the member exists
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, membershipStatus: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Step 2 — Define the feature window
    // We look at the last FEATURE_WINDOW_MONTHS months of behaviour
    const windowEnd = new Date();
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - FEATURE_WINDOW_MONTHS);

    // Step 3 — Compute all five features
    const features = await this.computeFeatures(
      memberId,
      windowStart,
      windowEnd,
    );

    // Step 4 — Calculate the score using the logistic regression formula
    // si = β0 + β1×x1 + β2×x2 + β3×x3 + β4×x4 + β5×x5
    const c = MODEL_COEFFICIENTS;

    const scoreSi =
      c.beta0 +
      c.savingsRegularity * features.savingsRegularity +
      c.savingsConsistency * features.savingsConsistency +
      c.withdrawalDiscipline * features.withdrawalDiscipline +
      c.incomeStability * features.incomeStability +
      c.responseToReminders * features.responseToReminders;

    // Step 5 — Convert score to probability using the logistic function
    // pi = 1 / (1 + e^(-si))
    // This squashes any score into the range (0, 1)
    const repaymentProbability = 1 / (1 + Math.exp(-scoreSi));

    // Step 6 — Determine risk band from probability
    let riskBand: string;

    if (repaymentProbability >= RISK_THRESHOLDS.LOW_RISK) {
      riskBand = 'low_risk';
    } else if (repaymentProbability >= RISK_THRESHOLDS.MODERATE_RISK) {
      riskBand = 'moderate_risk';
    } else {
      riskBand = 'high_risk';
    }

    // Step 7 — Save the feature snapshot and risk score atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // Save the feature vector — the xi values
      const snapshot = await tx.behaviouralFeatureSnapshot.create({
        data: {
          memberId,
          snapshotDate: new Date(),
          savingsRegularity: features.savingsRegularity,
          savingsConsistency: features.savingsConsistency,
          withdrawalDiscipline: features.withdrawalDiscipline,
          incomeStability: features.incomeStability,
          responseToReminders: features.responseToReminders,
          featureWindowStart: windowStart,
          featureWindowEnd: windowEnd,
          modelVersion: MODEL_VERSION,
        },
      });

      // Save the computed score and probability — the model output
      const riskScore = await tx.riskScore.create({
        data: {
          memberId,
          snapshotId: snapshot.id,
          beta0: c.beta0,
          scoreSi,
          repaymentProbabilityPi: repaymentProbability,
          riskBand: riskBand as any,
          modelName: MODEL_NAME,
          modelVersion: MODEL_VERSION,
          scoredAt: new Date(),
        },
      });

      // Update the member's current risk band for fast dashboard access
      // This cached value means the dashboard does not have to query risk_scores every time
      await tx.member.update({
        where: { id: memberId },
        data: { currentRiskBand: riskBand as any },
      });

      return { snapshot, riskScore };
    });

    this.logger.info('Behavioural score computed', {
      memberId,
      scoreSi: scoreSi.toFixed(4),
      repaymentProbability: repaymentProbability.toFixed(4),
      riskBand,
      modelVersion: MODEL_VERSION,
      features,
    });

    return {
      score: scoreSi,
      repaymentProbability,
      riskBand,
      features,
      modelVersion: MODEL_VERSION,
      snapshotId: result.snapshot.id,
      riskScoreId: result.riskScore.id,
    };
  }

  //GetLatestScore
  async getLatestScore(memberId: string): Promise<unknown> {
    // Get the most recent risk score for this member
    const riskScore = await this.prisma.riskScore.findFirst({
      where: { memberId },
      orderBy: { scoredAt: 'desc' },
    });

    // Get the corresponding feature snapshot so we can show the breakdown
    let snapshot = null;

    if (riskScore) {
      snapshot = await this.prisma.behaviouralFeatureSnapshot.findUnique({
        where: { id: riskScore.snapshotId },
      });
    }

    // If no score exists, return a default unscored response
    // This happens for new members who have not yet saved enough history
    if (!riskScore) {
      return {
        riskBand: 'unscored',
        repaymentProbability: null,
        score: null,
        features: null,
        message:
          'You do not have a score yet. Keep saving regularly to build your behavioural profile.',
      };
    }

    return {
      riskBand: riskScore.riskBand,
      repaymentProbability: riskScore.repaymentProbabilityPi,
      score: riskScore.scoreSi,
      scoredAt: riskScore.scoredAt,
      modelVersion: riskScore.modelVersion,
      features: snapshot
        ? {
            savingsRegularity: snapshot.savingsRegularity,
            savingsConsistency: snapshot.savingsConsistency,
            withdrawalDiscipline: snapshot.withdrawalDiscipline,
            incomeStability: snapshot.incomeStability,
            responseToReminders: snapshot.responseToReminders,
          }
        : null,
    };
  }

  //computeFeatures (private)
  //This is where the actual feature calculation happens.
  // Each feature has its own private method to keep things readable.
  private async computeFeatures(
    memberId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<BehaviouralFeatures> {
    // Compute all five features in parallel for efficiency
    const [
      savingsRegularity,
      savingsConsistency,
      withdrawalDiscipline,
      incomeStability,
      responseToReminders,
    ] = await Promise.all([
      this.computeSavingsRegularity(memberId, windowStart, windowEnd),
      this.computeSavingsConsistency(memberId, windowStart, windowEnd),
      this.computeWithdrawalDiscipline(memberId, windowStart, windowEnd),
      this.computeIncomeStability(memberId, windowStart, windowEnd),
      this.computeResponseToReminders(memberId, windowStart, windowEnd),
    ]);

    return {
      savingsRegularity,
      savingsConsistency,
      withdrawalDiscipline,
      incomeStability,
      responseToReminders,
    };
  }

  //computeSavingsRegularity
  private async computeSavingsRegularity(
    memberId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number> {
    // Count how many distinct months had at least one deposit
    const deposits = await this.prisma.savingsTransaction.findMany({
      where: {
        memberId,
        transactionDate: { gte: windowStart, lte: windowEnd },
        status: 'completed',
      },
      select: { transactionDate: true },
    });

    if (deposits.length === 0) {
      return 0;
    }

    // Get the unique months that had at least one deposit
    // We use a Set to automatically deduplicate
    const monthsWithDeposits = new Set(
      deposits.map((d: { transactionDate: Date | string }) => {
        const date = new Date(d.transactionDate);
        // Format as "YYYY-MM" so each month is a unique string
        return `${date.getFullYear()}-${date.getMonth()}`;
      }),
    );

    // Regularity = months with deposits / total months in window
    const regularity = monthsWithDeposits.size / FEATURE_WINDOW_MONTHS;

    // Clamp to [0, 1] — cannot be more than 100% regular
    return Math.min(regularity, 1);
  }

  //computeSavingsConsistency
  private async computeSavingsConsistency(
    memberId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number> {
    const deposits = await this.prisma.savingsTransaction.findMany({
      where: {
        memberId,
        transactionDate: { gte: windowStart, lte: windowEnd },
        status: 'completed',
      },
      select: { amount: true },
    });

    // Need at least 2 deposits to calculate consistency
    if (deposits.length < 2) {
      // Single deposit or none — we return 0.5 (neutral)
      // We do not penalise new members for having little history
      return 0.5;
    }

    // Convert amounts to numbers
    const amounts = deposits.map((d: { amount: { toString: () => string } }) =>
      new Decimal(d.amount.toString()).toNumber(),
    );

    // Calculate the mean (average) deposit amount
    const sum = amounts.reduce(
      (total: number, amount: number) => total + amount,
      0,
    );
    const mean = sum / amounts.length;

    // Calculate standard deviation — how spread out the amounts are
    // A low standard deviation means deposits are similar amounts (consistent)
    // A high standard deviation means amounts vary wildly (inconsistent)
    const squaredDifferences = amounts.map((amount: number) => {
      const difference = amount - mean;
      return difference * difference;
    });

    const variance =
      squaredDifferences.reduce((total: number, sq: number) => total + sq, 0) /
      amounts.length;

    const standardDeviation = Math.sqrt(variance);

    // Coefficient of variation = standard deviation / mean
    // This normalises the spread relative to the average amount
    // A member saving £100 ± £10 has the same CV as one saving £1000 ± £100
    if (mean === 0) return 0;

    const coefficientOfVariation = standardDeviation / mean;

    // Convert to a 0-1 score where 1 = perfectly consistent
    // We cap the CV at 1.0 — beyond that the member is very inconsistent
    const consistency = Math.max(0, 1 - Math.min(coefficientOfVariation, 1));

    return consistency;
  }

  //computeWithdrawalDiscipline
  private async computeWithdrawalDiscipline(
    memberId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number> {
    // Get total amount deposited in the window
    const deposits = await this.prisma.savingsTransaction.findMany({
      where: {
        memberId,
        transactionDate: { gte: windowStart, lte: windowEnd },
        status: 'completed',
      },
      select: { amount: true },
    });

    // Get total amount withdrawn in the window
    const withdrawals = await this.prisma.withdrawalTransaction.findMany({
      where: {
        memberId,
        transactionDate: { gte: windowStart, lte: windowEnd },
        status: 'completed',
      },
      select: { amount: true },
    });

    // If no deposits, return 0 — no saving activity
    if (deposits.length === 0) {
      return 0;
    }

    const totalDeposited = deposits.reduce(
      (sum: number, d: { amount: { toString: () => string } }) =>
        sum + new Decimal(d.amount.toString()).toNumber(),
      0,
    );

    const totalWithdrawn = withdrawals.reduce(
      (sum: number, w: { amount: { toString: () => string } }) =>
        sum + new Decimal(w.amount.toString()).toNumber(),
      0,
    );

    // Withdrawal ratio = how much was withdrawn relative to what was saved
    // 0 = withdrew nothing (best possible)
    // 1 = withdrew everything that was saved (worst possible)
    const withdrawalRatio = totalWithdrawn / totalDeposited;

    // Discipline score = 1 - withdrawal ratio
    // Clamped to [0, 1] because ratio could theoretically exceed 1
    const discipline = Math.max(0, 1 - Math.min(withdrawalRatio, 1));

    return discipline;
  }

  //computeIncomeStability
  private async computeIncomeStability(
    memberId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number> {
    // Get income records in the window
    const incomeRecords = await this.prisma.incomeRecord.findMany({
      where: {
        memberId,
        recordPeriodStart: { gte: windowStart, lte: windowEnd },
      },
      select: { incomeVolatilityScore: true },
    });

    // If no income records exist, return a neutral score
    // We do not penalise members for not having income records yet
    if (incomeRecords.length === 0) {
      return 0.5;
    }

    // Average the volatility scores across all records
    // incomeVolatilityScore is between 0 and 1 where 0 = stable, 1 = volatile
    const totalVolatility = incomeRecords.reduce(
      (
        sum: number,
        record: { incomeVolatilityScore: { toString: () => string } | null },
      ) => {
        if (!record.incomeVolatilityScore) return sum;
        return (
          sum + new Decimal(record.incomeVolatilityScore.toString()).toNumber()
        );
      },
      0,
    );

    const avgVolatility = totalVolatility / incomeRecords.length;

    // Stability is the inverse of volatility
    // High volatility = low stability
    const stability = 1 - avgVolatility;

    return Math.max(0, Math.min(stability, 1));
  }

  //computeResponseToReminders
  private async computeResponseToReminders(
    memberId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number> {
    // Get all reminders sent in the window
    const reminders = await this.prisma.reminderLog.findMany({
      where: {
        memberId,
        sentDate: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true },
    });

    // If no reminders were sent, return a neutral score
    // A member who has never missed a payment has never needed reminders
    if (reminders.length === 0) {
      return 0.5;
    }

    const reminderIds = reminders.map((r: { id: string }) => r.id);

    // Count how many reminders got a positive response
    // Positive = paid after reminder or saved after reminder
    const positiveResponses = await this.prisma.reminderResponse.count({
      where: {
        reminderId: { in: reminderIds },
        responseType: {
          in: ['paid_after_reminder', 'saved_after_reminder'],
        },
      },
    });

    // Responsiveness = positive responses / total reminders sent
    const responsiveness = positiveResponses / reminders.length;

    return Math.min(responsiveness, 1);
  }
}
