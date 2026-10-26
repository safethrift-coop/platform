import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '../../core/database/prisma.service';
import { MembershipTier } from './dto/apply-membership.dto';
import { NotificationsService } from '../notifications/notifications.service';

const MEMBERSHIP_FEE: Record<MembershipTier, number> = {
  [MembershipTier.Individual]: 30,
  [MembershipTier.Family]: 50,
};

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

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
      select: {
        id: true,
        memberId: true,
        membershipType: true,
        submission: { select: { id: true } },
      },
    });

    if (!registration) throw new NotFoundException('Application not found');
    if (registration.submission)
      throw new ForbiddenException(
        'Development fixture applications cannot be administratively actioned',
      );

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
    const member = await this.prisma.member.findUnique({
      where: { id: registration.memberId },
      select: {
        email: true,
        firstName: true,
        membershipNumber: true,
        preferredPaymentMethod: true,
      },
    });

    if (member) {
      await this.notificationsService.sendMembershipApproved(
        member.email,
        member.firstName,
        member.membershipNumber,
        registration.membershipType ?? 'individual',
        MEMBERSHIP_FEE[registration.membershipType as MembershipTier] ?? 30,
        registration.preferredPaymentMethod ?? 'bank_transfer',
      );
    }

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
      select: {
        id: true,
        memberId: true,
        submission: { select: { id: true } },
      },
    });

    if (!registration) throw new NotFoundException('Application not found');
    if (registration.submission)
      throw new ForbiddenException(
        'Development fixture applications cannot be administratively actioned',
      );

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
    const memberForEmail = await this.prisma.member.findUnique({
      where: { id: registration.memberId },
      select: { email: true, firstName: true },
    });

    if (memberForEmail) {
      await this.notificationsService.sendMembershipRejected(
        memberForEmail.email,
        memberForEmail.firstName,
        decisionNotes,
      );
    }

    return { message: 'Application rejected.' };
  }

  private async generateAccountNumber(): Promise<string> {
    const count = await this.prisma.memberAccount.count();
    const padded = String(count + 1).padStart(8, '0');
    return `ST-ACC-${padded}`;
  }
}
