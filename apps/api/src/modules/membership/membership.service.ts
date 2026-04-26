import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { ApplyMembershipDto, MembershipTier } from './dto/apply-membership.dto';

const MEMBERSHIP_FEE: Record<MembershipTier, number> = {
  [MembershipTier.Individual]: 30,
  [MembershipTier.Family]: 50,
};

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  async apply(
    memberId: string,
    dto: ApplyMembershipDto,
  ): Promise<{ message: string; applicationId: string }> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        membershipStatus: true,
        emailVerified: true,
      },
    });

    if (!member) throw new NotFoundException('Member not found');

    if (!member.emailVerified) {
      throw new BadRequestException(
        'Please verify your email address before applying for membership',
      );
    }

    if (
      member.membershipStatus === 'active' ||
      member.membershipStatus === 'pending'
    ) {
      throw new ConflictException(
        'You already have an active or pending membership application',
      );
    }

    if (
      dto.membershipType === MembershipTier.Family &&
      (!dto.householdMembers || dto.householdMembers.length === 0)
    ) {
      throw new BadRequestException(
        'Household member details are required for family membership',
      );
    }

    const fee = MEMBERSHIP_FEE[dto.membershipType];

    const registration = await this.prisma.$transaction(async (tx) => {
      const reg = await tx.memberRegistration.create({
        data: {
          memberId,
          registrationChannel: 'web_portal',
          membershipType: dto.membershipType,
          membershipFeePaid: false,
          membershipFeeAmount: fee,
          householdMembersJson: dto.householdMembers
            ? JSON.stringify(dto.householdMembers)
            : null,
          termsAccepted: dto.termsAccepted,
          termsAcceptedAt: new Date(),
          consentDataProcessing: dto.consentDataProcessing,
          consentDataProcessedAt: new Date(),
          consentCreditAssess: dto.consentCreditAssessment,
          consentCreditAssessAt: new Date(),
          referralSource: dto.referralSource,
          whyJoining: dto.whyJoining,
          preferredPaymentMethod: dto.preferredPaymentMethod,
          signatureText: dto.signatureText,
        },
      });

      await tx.member.update({
        where: { id: memberId },
        data: {
          membershipStatus: 'pending',
          occupation: dto.occupation,
        },
      });

      return reg;
    });

    this.logger.info('Membership application submitted', {
      memberId,
      membershipType: dto.membershipType,
      fee,
      applicationId: registration.id,
    });

    return {
      message:
        'Your membership application has been received. We will review it and send payment instructions to your email.',
      applicationId: registration.id,
    };
  }

  async getMyMembership(memberId: string): Promise<Record<string, unknown>> {
    const registration = await this.prisma.memberRegistration.findFirst({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        registrationDate: true,
        membershipType: true,
        membershipFeePaid: true,
        membershipFeeAmount: true,
        preferredPaymentMethod: true,
        createdAt: true,
      },
    });

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        membershipStatus: true,
        membershipNumber: true,
        joinedDate: true,
      },
    });

    return {
      status: member?.membershipStatus ?? 'unknown',
      membershipNumber: member?.membershipNumber,
      joinedDate: member?.joinedDate,
      application: registration,
    };
  }

  async approve(
    applicationId: string,
    reviewedBy: string,
    decisionNotes?: string,
  ): Promise<{ message: string }> {
    const registration = await this.prisma.memberRegistration.findUnique({
      where: { id: applicationId },
      select: { id: true, memberId: true, membershipType: true },
    });

    if (!registration) throw new NotFoundException('Application not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: registration.memberId },
        data: { membershipStatus: 'active' },
      });

      await tx.memberRegistration.update({
        where: { id: applicationId },
        data: {
          membershipFeePaid: false,
          registrationNotes: decisionNotes,
        },
      });

      await tx.memberAccount.create({
        data: {
          memberId: registration.memberId,
          accountType: 'savings_fsa',
          accountNumber: await this.generateAccountNumber(),
          accountStatus: 'active',
          currentBalance: 0,
        },
      });
    });

    this.logger.info('Membership application approved', {
      applicationId,
      memberId: registration.memberId,
      reviewedBy,
    });

    // TODO (T36): Send approval email with payment instructions

    return {
      message:
        'Application approved. Payment instructions will be sent to the member.',
    };
  }

  async reject(
    applicationId: string,
    reviewedBy: string,
    decisionNotes: string,
  ): Promise<{ message: string }> {
    const registration = await this.prisma.memberRegistration.findUnique({
      where: { id: applicationId },
      select: { id: true, memberId: true },
    });

    if (!registration) throw new NotFoundException('Application not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: registration.memberId },
        data: { membershipStatus: 'closed' },
      });

      await tx.memberRegistration.update({
        where: { id: applicationId },
        data: { registrationNotes: decisionNotes },
      });
    });

    this.logger.info('Membership application rejected', {
      applicationId,
      memberId: registration.memberId,
      reviewedBy,
      decisionNotes,
    });

    // TODO (T36): Send rejection email with reason

    return { message: 'Application rejected.' };
  }

  private async generateAccountNumber(): Promise<string> {
    const count = await this.prisma.memberAccount.count();
    const padded = String(count + 1).padStart(8, '0');
    return `ST-ACC-${padded}`;
  }
}
