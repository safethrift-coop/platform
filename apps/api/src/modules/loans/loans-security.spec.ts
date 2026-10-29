import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { loanPageInput } from './loan-reads.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('T42 disabled loan execution', () => {
  const loan = { findFirst: jest.fn() };
  const member = { findUnique: jest.fn() };
  const repaymentTransaction = { findFirst: jest.fn(), create: jest.fn() };
  const transaction = jest.fn();
  const service = new LoansService({
    loan,
    member,
    repaymentTransaction,
    $transaction: transaction,
  } as unknown as PrismaService);
  beforeEach(() => {
    jest.clearAllMocks();
    loan.findFirst.mockResolvedValue({ id: 'owned' });
    member.findUnique.mockResolvedValue({
      membershipStatus: 'active',
      emailVerified: true,
    });
  });
  it('checks ownership before key handling and never queries/replays a legacy repayment', async () => {
    loan.findFirst.mockResolvedValue(null);
    await expect(
      service.repay('foreign', 'A', { amount: 1 }, 'B-key'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(loan.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', memberId: 'A' },
      select: { id: true },
    });
    expect(repaymentTransaction.findFirst).not.toHaveBeenCalled();
  });
  it('denies matching, changed-payload, cross-resource and concurrent keys without executing or replaying', async () => {
    const attempts = Array.from({ length: 12 }, (_, i) =>
      service.repay(
        i % 2 ? 'owned' : 'another',
        'A',
        { amount: i + 1 },
        'same-key',
      ),
    );
    const results = await Promise.allSettled(attempts);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected')
        expect(result.reason).toBeInstanceOf(ForbiddenException);
    }
    expect(repaymentTransaction.findFirst).not.toHaveBeenCalled();
    expect(repaymentTransaction.create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects missing/invalid request keys after ownership', async () => {
    for (const key of [undefined, '', 'x'.repeat(129), 'bad key'])
      await expect(
        service.repay('owned', 'A', { amount: 1 }, key),
      ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('keeps active membership/email checks and denies all origination/decisions', async () => {
    const dto = {
      requestedAmount: 50,
      requestedTermMonths: 3,
      loanPurpose: 'test',
    };
    await expect(service.applyForLoan('A', dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    member.findUnique.mockResolvedValue({
      membershipStatus: 'pending',
      emailVerified: true,
    });
    await expect(service.applyForLoan('A', dto)).rejects.toThrow(
      'Membership must be active',
    );
    member.findUnique.mockResolvedValue({
      membershipStatus: 'active',
      emailVerified: false,
    });
    await expect(service.applyForLoan('A', dto)).rejects.toThrow(
      'Email verification required',
    );
    await expect(service.approve('app', 'admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.reject('app', 'admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('validates strict bounded member/resource cursors and limits', () => {
    for (const value of ['0', '51', '1x', '1.0', '-1'])
      expect(() => loanPageInput('A', value)).toThrow();
    const cursor = Buffer.from(
      JSON.stringify({
        v: 1,
        scope: 'A',
        id: 'id:1',
        date: '2026-01-01T00:00:00.000Z',
      }),
    ).toString('base64url');
    expect(loanPageInput('A', '2', cursor).take).toBe(2);
    expect(() => loanPageInput('B', '2', cursor)).toThrow();
    for (const value of ['', '!', 'a'.repeat(2049)])
      expect(() => loanPageInput('A', '2', value)).toThrow();
  });
});
