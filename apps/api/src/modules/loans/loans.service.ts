import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ApplyLoanDto } from './dto/apply-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';
import type { Prisma } from '@prisma/client';

export const LOAN_EXECUTION_DISABLED =
  'Loan execution is disabled. No application, lending, disbursement or repayment collection is enabled.';

@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  async applyForLoan(memberId: string, _dto: ApplyLoanDto): Promise<never> {
    void _dto;
    const db = this.prisma as unknown as Prisma.TransactionClient;
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { membershipStatus: true, emailVerified: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.membershipStatus !== 'active')
      throw new ForbiddenException('Membership must be active');
    if (!member.emailVerified)
      throw new ForbiddenException('Email verification required');
    throw new ForbiddenException(LOAN_EXECUTION_DISABLED);
  }

  async repay(
    loanId: string,
    memberId: string,
    _dto: RepayLoanDto,
    key?: string,
  ): Promise<never> {
    void _dto;
    const db = this.prisma as unknown as Prisma.TransactionClient;
    // Ownership precedes even key validation. A legacy key is never authority.
    const loan = await db.loan.findFirst({
      where: { id: loanId, memberId },
      select: { id: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key))
      throw new BadRequestException('A bounded Idempotency-Key is required');
    // Legacy rows cannot bind mode, operation and the original normalized body.
    // Never return them as replays, including matching amount/key requests.
    // No receipt or new write contract is introduced under this authorization.
    throw new ForbiddenException(LOAN_EXECUTION_DISABLED);
  }

  approve(
    _applicationId: string,
    _reviewedBy: string,
    _notes?: string,
  ): Promise<never> {
    void _applicationId;
    void _reviewedBy;
    void _notes;
    return Promise.reject(new ForbiddenException(LOAN_EXECUTION_DISABLED));
  }
  reject(
    _applicationId: string,
    _reviewedBy: string,
    _notes?: string,
  ): Promise<never> {
    void _applicationId;
    void _reviewedBy;
    void _notes;
    return Promise.reject(new ForbiddenException(LOAN_EXECUTION_DISABLED));
  }
}
