import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { ApplyLoanDto } from './dto/apply-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

type RiskBand = 'low_risk' | 'moderate_risk' | 'high_risk' | 'unscored';

// The maximum a member can borrow is a multiple of their savings balance
// Low risk members can borrow up to 2x their savings
// Moderate risk members can borrow up to 1.5x
// High risk members can borrow up to 1x
const LOAN_MULTIPLIER: Record<RiskBand, number> = {
  low_risk: 2,
  moderate_risk: 1.5,
  high_risk: 1,
  unscored: 0.5,
};

// Minimum savings points required to apply for a loan
const MIN_POINTS_REQUIRED = 100;

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  async applyForLoan(memberId: string, dto: ApplyLoanDto): Promise<unknown> {
    // Step 1 — Fetch member and check eligibility
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        membershipStatus: true,
        emailVerified: true,
        savingsPointsTotal: true,
        currentRiskBand: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Must be an active member to apply
    if (member.membershipStatus !== 'active') {
      throw new ForbiddenException(
        'Your membership must be active before you can apply for a loan',
      );
    }

    // Must have verified their email
    if (!member.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email address before applying for a loan',
      );
    }

    // Must have enough savings points
    if (member.savingsPointsTotal < MIN_POINTS_REQUIRED) {
      throw new BadRequestException(
        `You need at least ${MIN_POINTS_REQUIRED} savings points to apply for a loan. ` +
          `You currently have ${member.savingsPointsTotal} points. ` +
          `Keep saving to earn more points.`,
      );
    }

    // Step 2 — Check the member does not already have an active loan
    const activeLoan = await this.prisma.loan.findFirst({
      where: {
        memberId,
        loanStatus: { in: ['active', 'disbursement_pending'] },
      },
    });

    if (activeLoan) {
      throw new BadRequestException(
        'You already have an active loan. Please complete your current repayments before applying for a new loan.',
      );
    }

    // Step 3 — Calculate the maximum they can borrow
    // This is based on their total savings balance across all accounts
    const accounts = await this.prisma.memberAccount.findMany({
      where: { memberId, accountStatus: 'active' },
      select: { currentBalance: true },
    });

    // Add up all savings balances
    const totalSavings = accounts.reduce(
      (
        sum: Decimal,
        account: { currentBalance: { toString: () => string } },
      ) => {
        return sum.plus(new Decimal(account.currentBalance.toString()));
      },
      new Decimal(0),
    );

    const riskBand = (member.currentRiskBand ?? 'unscored') as RiskBand;
    const multiplier = LOAN_MULTIPLIER[riskBand] ?? 0.5;
    const maxLoanAmount = totalSavings.times(multiplier);

    // Check the requested amount does not exceed the maximum
    const requestedAmount = new Decimal(dto.requestedAmount);

    if (requestedAmount.gt(maxLoanAmount)) {
      throw new BadRequestException(
        `The maximum you can borrow is £${maxLoanAmount.toFixed(2)} ` +
          `based on your savings of £${totalSavings.toFixed(2)} ` +
          `and your ${riskBand} risk band. ` +
          `Save more to increase your borrowing limit.`,
      );
    }

    // Also check they have at least some savings
    if (totalSavings.lte(0)) {
      throw new BadRequestException(
        'You must have savings before you can apply for a loan.',
      );
    }

    // Step 4 — Create the loan application
    // We snapshot the score and points at the time of application
    // Even if the model is retrained later, we preserve what it said now
    const application = await this.prisma.loanApplication.create({
      data: {
        memberId,
        requestedAmount: requestedAmount.toNumber(),
        loanPurpose: dto.loanPurpose,
        requestedTermMonths: dto.requestedTermMonths,
        applicationStatus: 'pending',
        savingsPointsAtApplication: member.savingsPointsTotal,
        riskBandAtApplication: riskBand,
        applicationDate: new Date(),
      },
    });

    this.logger.info('Loan application submitted', {
      memberId,
      applicationId: application.id,
      requestedAmount: requestedAmount.toString(),
      totalSavings: totalSavings.toString(),
      maxLoanAmount: maxLoanAmount.toString(),
      riskBand: member.currentRiskBand,
      pointsAtApplication: member.savingsPointsTotal,
    });

    return {
      applicationId: application.id,
      status: 'pending',
      requestedAmount: requestedAmount.toNumber(),
      maxYouCanBorrow: maxLoanAmount.toNumber(),
      message:
        'Your loan application has been submitted and is being reviewed by our team. ' +
        'We will notify you of the decision within 2 working days.',
    };
  }

  async getMyLoans(memberId: string): Promise<unknown[]> {
    // Return all applications — pending, approved, rejected
    // Members should see their full history
    const applications = await this.prisma.loanApplication.findMany({
      where: { memberId },
      orderBy: { applicationDate: 'desc' },
    });

    return applications;
  }

  async getLoan(loanId: string, memberId: string): Promise<unknown> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    // Ownership check — a member cannot see another member's loan
    if (loan.memberId !== memberId) {
      throw new ForbiddenException('You do not have access to this loan');
    }

    return loan;
  }

  async getSchedule(loanId: string, memberId: string): Promise<unknown[]> {
    // First verify the loan belongs to this member
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      select: { id: true, memberId: true },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    if (loan.memberId !== memberId) {
      throw new ForbiddenException('You do not have access to this loan');
    }

    // Return the schedule ordered by instalment number
    const schedule = await this.prisma.repaymentSchedule.findMany({
      where: { loanId },
      orderBy: { installmentNumber: 'asc' },
    });

    return schedule;
  }

  async repay(
    loanId: string,
    memberId: string,
    dto: RepayLoanDto,
    idempotencyKey: string,
  ): Promise<unknown> {
    // Step 1 — Idempotency check
    const existing = await this.prisma.repaymentTransaction.findFirst({
      where: { idempotencyKey },
    });

    if (existing) {
      this.logger.info('Duplicate repayment request — returning original', {
        idempotencyKey,
        transactionId: existing.id,
      });
      return existing;
    }

    // Step 2 — Fetch and validate the loan
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    if (loan.memberId !== memberId) {
      throw new ForbiddenException('You do not have access to this loan');
    }

    if (loan.loanStatus !== 'active') {
      throw new BadRequestException(
        'This loan is not active. Only active loans can receive repayments.',
      );
    }

    const paymentAmount = new Decimal(dto.amount);
    const principalAmount = new Decimal(loan.principalAmount.toString());

    // Step 3 — Find the next due instalment
    // We look for the oldest instalment that is not yet fully paid
    const nextInstalment = await this.prisma.repaymentSchedule.findFirst({
      where: {
        loanId,
        status: { in: ['due', 'partial', 'late'] },
      },
      orderBy: { installmentNumber: 'asc' },
    });

    // Step 4 — Record the repayment and update schedule atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the repayment transaction record
      const transaction = await tx.repaymentTransaction.create({
        data: {
          loanId,
          memberId,
          scheduleId: nextInstalment?.id ?? null,
          amountPaid: paymentAmount.toNumber(),
          paymentDate: new Date(),
          paymentChannel: 'web_portal',
          referenceNumber: `RPY-${uuidv4().slice(0, 8).toUpperCase()}`,
          paymentStatus: 'completed',
          idempotencyKey,
        },
      });

      // If there is a current instalment, update its status
      if (nextInstalment) {
        const totalDue = new Decimal(nextInstalment.totalDue.toString());
        const totalPaid = new Decimal(nextInstalment.totalPaid.toString());
        const newTotalPaid = totalPaid.plus(paymentAmount);

        let newStatus: string;

        if (newTotalPaid.gte(totalDue)) {
          // Fully paid this instalment
          newStatus = 'paid';
        } else {
          // Partially paid — still outstanding
          newStatus = 'partial';
        }

        await tx.repaymentSchedule.update({
          where: { id: nextInstalment.id },
          data: {
            totalPaid: newTotalPaid.toNumber(),
            status: newStatus as any,
            paidDate: newStatus === 'paid' ? new Date() : null,
          },
        });
      }

      return transaction;
    });

    // Step 5 — Check if the loan is now fully repaid
    // Count how many instalments are still outstanding
    const remainingInstalments = await this.prisma.repaymentSchedule.count({
      where: {
        loanId,
        status: { in: ['due', 'partial', 'late', 'missed'] },
      },
    });

    if (remainingInstalments === 0) {
      // All instalments paid — mark the loan as complete
      await this.prisma.loan.update({
        where: { id: loanId },
        data: { loanStatus: 'completed' },
      });

      this.logger.info('Loan fully repaid', {
        memberId,
        loanId,
        principalAmount: principalAmount.toString(),
      });
    }

    this.logger.info('Repayment recorded', {
      memberId,
      loanId,
      amount: paymentAmount.toString(),
      transactionId: result.id,
      remainingInstalments,
    });

    return {
      transaction: result,
      remainingInstalments,
      loanComplete: remainingInstalments === 0,
    };
  }

  //approve (admin only)
  async approve(
    applicationId: string,
    reviewedBy: string,
    decisionNotes?: string,
  ): Promise<unknown> {
    // Step 1 — Fetch the application
    const application = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Loan application not found');
    }

    if (application.applicationStatus !== 'pending') {
      throw new BadRequestException(
        'This application has already been reviewed',
      );
    }

    // Step 2 — Find the member's loan account
    // Each member has a dedicated loan account in member_accounts
    let loanAccount = await this.prisma.memberAccount.findFirst({
      where: { memberId: application.memberId, accountType: 'loan' },
    });

    // If no loan account exists yet, create one
    if (!loanAccount) {
      loanAccount = await this.prisma.memberAccount.create({
        data: {
          memberId: application.memberId,
          accountType: 'loan',
          accountNumber: `ST-LOAN-${uuidv4().slice(0, 8).toUpperCase()}`,
          accountStatus: 'active',
          currentBalance: application.requestedAmount,
        },
      });
    }

    // Step 3 — Calculate the monthly instalment
    // Interest rate is always 0 for Safethrift
    // Monthly instalment = principal / term months
    const principal = new Decimal(application.requestedAmount);
    const termMonths = application.requestedTermMonths;
    const monthlyInstalment = principal
      .dividedBy(termMonths)
      .toDecimalPlaces(2);

    // Calculate the maturity date
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + termMonths);

    // Step 4 — Create the loan and repayment schedule atomically
    const loan = await this.prisma.$transaction(async (tx) => {
      // Update application status
      await tx.loanApplication.update({
        where: { id: applicationId },
        data: {
          applicationStatus: 'approved',
          reviewedBy,
          reviewDate: new Date(),
          decisionNotes: decisionNotes ?? null,
        },
      });

      // Create the approved loan
      const newLoan = await tx.loan.create({
        data: {
          memberId: application.memberId,
          applicationId,
          loanAccountId: loanAccount!.id,
          principalAmount: principal.toNumber(),
          interestRate: 0,
          termMonths,
          installmentAmount: monthlyInstalment.toNumber(),
          loanStatus: 'active',
          maturityDate,
        },
      });

      // Generate the full repayment schedule
      // One row per month for the entire term
      const scheduleRows = [];
      const dueDate = new Date();

      for (let i = 1; i <= termMonths; i++) {
        // Each instalment is due one month after the previous
        dueDate.setMonth(dueDate.getMonth() + 1);

        scheduleRows.push({
          loanId: newLoan.id,
          installmentNumber: i,
          dueDate: new Date(dueDate),
          principalDue: monthlyInstalment.toNumber(),
          interestDue: 0,
          totalDue: monthlyInstalment.toNumber(),
          totalPaid: 0,
          status: 'due',
        });
      }

      // Insert all schedule rows in one query
      await tx.repaymentSchedule.createMany({
        data: scheduleRows as any,
      });

      return newLoan;
    });

    this.logger.info('Loan application approved', {
      applicationId,
      loanId: loan.id,
      memberId: application.memberId,
      amount: principal.toString(),
      termMonths,
      monthlyInstalment: monthlyInstalment.toString(),
      reviewedBy,
    });

    // TODO (T36): Send approval email to member

    return {
      loanId: loan.id,
      principalAmount: principal.toNumber(),
      monthlyInstalment: monthlyInstalment.toNumber(),
      termMonths,
      maturityDate,
      message: 'Loan approved. Repayment schedule has been generated.',
    };
  }

  //reject (admin only)
  async reject(
    applicationId: string,
    reviewedBy: string,
    decisionNotes: string,
  ): Promise<unknown> {
    const application = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Loan application not found');
    }

    if (application.applicationStatus !== 'pending') {
      throw new BadRequestException(
        'This application has already been reviewed',
      );
    }

    await this.prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        applicationStatus: 'rejected',
        reviewedBy,
        reviewDate: new Date(),
        decisionNotes,
      },
    });

    this.logger.info('Loan application rejected', {
      applicationId,
      memberId: application.memberId,
      reviewedBy,
      decisionNotes,
    });

    // TODO (T36): Send rejection email with reason

    return { message: 'Application rejected.' };
  }

  //getPendingApplications (admin)
  async getPendingApplications(): Promise<unknown[]> {
    // Returns all applications waiting for review
    // Ordered by date so oldest applications are reviewed first
    const applications = await this.prisma.loanApplication.findMany({
      where: { applicationStatus: 'pending' },
      orderBy: { applicationDate: 'asc' },
    });

    return applications;
  }
}
