import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { UpdateMemberDto } from './dto/update-member.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

export interface MemberProfile {
  id: string;
  membershipNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  city: string;
  postcode: string;
  membershipStatus: string;
  savingsPointsTotal: number;
  currentRiskBand: string;
  emailVerified: boolean;
  joinedDate: Date;
  preferredLanguage: string;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,

    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  async findById(memberId: string): Promise<MemberProfile> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        membershipNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        city: true,
        postcode: true,
        membershipStatus: true,
        savingsPointsTotal: true,
        currentRiskBand: true,
        emailVerified: true,
        joinedDate: true,
        preferredLanguage: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }

  async update(memberId: string, dto: UpdateMemberDto): Promise<MemberProfile> {
    const existing = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Member not found');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.firstName !== undefined) updateData['firstName'] = dto.firstName;
    if (dto.lastName !== undefined) updateData['lastName'] = dto.lastName;
    if (dto.addressLine1 !== undefined)
      updateData['addressLine1'] = dto.addressLine1;
    if (dto.addressLine2 !== undefined)
      updateData['addressLine2'] = dto.addressLine2;
    if (dto.city !== undefined) updateData['city'] = dto.city;
    if (dto.postcode !== undefined)
      updateData['postcode'] = dto.postcode.toUpperCase().trim();
    if (dto.phoneNumber !== undefined)
      updateData['phoneNumber'] = dto.phoneNumber;
    if (dto.occupation !== undefined) updateData['occupation'] = dto.occupation;
    if (dto.preferredLanguage !== undefined)
      updateData['preferredLanguage'] = dto.preferredLanguage;

    await this.prisma.member.update({
      where: { id: memberId },
      data: updateData,
    });

    this.logger.info(`Member ${memberId} updated profile`);

    return this.findById(memberId);
  }

  async exportData(memberId: string): Promise<Record<string, unknown>> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        membershipNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        dateOfBirth: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        postcode: true,
        occupation: true,
        joinedDate: true,
        membershipStatus: true,
        preferredLanguage: true,
      },
    });

    if (!member) throw new NotFoundException('Member not found');

    const [
      registration,
      accounts,
      savingsTransactions,
      loanApplications,
      reminderLogs,
    ] = await Promise.all([
      this.prisma.memberRegistration.findFirst({
        where: { memberId },
        select: {
          registrationDate: true,
          registrationChannel: true,
          membershipType: true,
          consentDataProcessing: true,
          consentCreditAssess: true,
          termsAccepted: true,
        },
      }),
      this.prisma.memberAccount.findMany({
        where: { memberId },
        select: {
          accountNumber: true,
          accountType: true,
          currentBalance: true,
          openedDate: true,
          accountStatus: true,
        },
      }),
      this.prisma.savingsTransaction.findMany({
        where: { memberId },
        select: {
          transactionDate: true,
          amount: true,
          transactionType: true,
          status: true,
        },
        orderBy: { transactionDate: 'desc' },
        take: 100,
      }),
      this.prisma.loanApplication.findMany({
        where: { memberId },
        select: {
          applicationDate: true,
          requestedAmount: true,
          loanPurpose: true,
          applicationStatus: true,
        },
      }),
      this.prisma.reminderLog.findMany({
        where: { memberId },
        select: {
          reminderType: true,
          reminderChannel: true,
          sentDate: true,
          deliveryStatus: true,
        },
        take: 50,
      }),
    ]);

    this.logger.info(`Data export requested by member ${memberId}`);

    return {
      exportedAt: new Date().toISOString(),
      member,
      registration,
      accounts,
      savingsTransactions,
      loanApplications,
      reminderLogs,
    };
  }

  async anonymise(memberId: string): Promise<{ message: string }> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, membershipStatus: true },
    });

    if (!member) throw new NotFoundException('Member not found');

    await this.prisma.member.update({
      where: { id: memberId },
      data: {
        firstName: 'Anonymised',
        lastName: 'Member',
        email: `deleted_${memberId}@anonymised.invalid`,
        phoneNumber: '00000000000',
        nationalIdNumber: null,
        addressLine1: 'Anonymised',
        addressLine2: null,
        city: 'Anonymised',
        postcode: 'AN0 0NY',
        occupation: null,
        membershipStatus: 'closed',
        emailVerified: false,
        mfaSecret: null,
      },
    });

    this.logger.info(`Member ${memberId} anonymised (GDPR erasure request)`);

    return {
      message:
        'Your personal data has been anonymised. Financial records are retained as required by UK law.',
    };
  }
}
