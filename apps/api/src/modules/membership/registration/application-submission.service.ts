import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { MembershipApplicationSubmission } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  ApplyMembershipDto,
  MembershipTier,
} from '../dto/apply-membership.dto';
import {
  DEVELOPMENT_CONTENT_VERSION,
  DEVELOPMENT_DECLARATIONS,
  requireRegistrationFixture,
} from './registration.config';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function receipt(row: MembershipApplicationSubmission) {
  return {
    applicationId: row.registrationId,
    submissionId: row.id,
    submittedAt: row.submittedAt.toISOString(),
    developmentFixture: true,
    message:
      'Synthetic application received. Await administrative review. No membership approval or payment has occurred.',
  };
}
@Injectable()
export class ApplicationSubmissionService {
  constructor(private readonly prisma: PrismaService) {}
  private async safe<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Never let Prisma validation/constraint errors echo personal snapshots into logs.
      throw new ServiceUnavailableException(
        'Application persistence unavailable; retry with the same submission key',
      );
    }
  }
  async submit(
    memberId: string,
    dto: ApplyMembershipDto,
    key: string | undefined,
  ) {
    requireRegistrationFixture();
    if (!key || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key))
      throw new BadRequestException(
        'A member-scoped Idempotency-Key is required',
      );
    const household = dto.householdMembers ?? [];
    if (
      (dto.membershipType === MembershipTier.Family && !household.length) ||
      (dto.membershipType === MembershipTier.Individual && household.length)
    )
      throw new BadRequestException(
        'Household members are required only for the family journey',
      );
    const normalized = {
      ...dto,
      personalDetails: {
        ...dto.personalDetails,
        addressLine2: dto.personalDetails.addressLine2 ?? '',
        postcode: dto.personalDetails.postcode.toUpperCase(),
      },
      householdMembers: household,
      occupation: dto.occupation ?? '',
      referralSource: dto.referralSource ?? '',
      whyJoining: dto.whyJoining ?? '',
    };
    const requestHash = createHash('sha256')
      .update(canonical(normalized))
      .digest('hex');
    return this.safe(() =>
      this.prisma.$transaction(
        async (tx) => {
          // ReadCommitted + member row lock ensures a waiting duplicate reads the
          // winner's committed receipt, while serializing eligibility/state changes.
          await tx.$queryRaw`SELECT member_id FROM members WHERE member_id = ${memberId} FOR UPDATE`;
          const member = await tx.member.findUnique({
            where: { id: memberId },
          });
          if (!member) throw new NotFoundException('Account not found');
          requireRegistrationFixture(member.email);
          if (!member.emailVerified)
            throw new ForbiddenException(
              'Verify your email before submitting an application',
            );
          if (member.membershipStatus !== 'pending')
            throw new ForbiddenException(
              'This account is not eligible for a new application',
            );
          const existing = await tx.membershipApplicationSubmission.findUnique({
            where: { memberId },
          });
          if (existing) {
            if (
              existing.idempotencyKey !== key ||
              existing.requestHash !== requestHash
            )
              throw new ConflictException(
                'An application already exists; retrieve its receipt instead of submitting again',
              );
            return receipt(existing);
          }
          if (await tx.memberRegistration.count({ where: { memberId } }))
            throw new ConflictException(
              'Historical registration requires separate review; it has not been classified as a new application',
            );
          const now = new Date();
          const registration = await tx.memberRegistration.create({
            data: {
              memberId,
              registrationChannel: 'web_portal',
              membershipType: dto.membershipType,
              householdMembersJson: household.length
                ? JSON.stringify(household)
                : null,
              referralSource: dto.referralSource,
              whyJoining: dto.whyJoining,
              preferredPaymentMethod: dto.preferredPaymentMethod,
              signatureText: dto.signatureText,
              // Legacy legal consent fields remain false/NULL: fixture checkboxes are
              // not acceptance of approved terms, privacy or credit-assessment policies.
            },
          });
          const submission = await tx.membershipApplicationSubmission.create({
            data: {
              memberId,
              registrationId: registration.id,
              idempotencyKey: key,
              requestHash,
              submittedAt: now,
              signedAt: now,
              signedDate: new Date(dto.signedDate + 'T00:00:00.000Z'),
              contentVersion: dto.contentVersion,
              declarationResponses: DEVELOPMENT_DECLARATIONS.map(
                (label, index) => ({ label, checked: dto.declarations[index] }),
              ),
              personalDetails: {
                ...normalized.personalDetails,
                occupation: normalized.occupation,
              },
            },
          });
          await tx.auditLog.create({
            data: {
              tableName: 'membership_application_submissions',
              recordId: submission.id,
              actionType: 'insert',
              changedBy: memberId,
              newValue: JSON.stringify({
                registrationId: registration.id,
                contentVersion: dto.contentVersion,
                developmentFixture: true,
              }),
            },
          });
          return receipt(submission);
        },
        { isolationLevel: 'ReadCommitted', timeout: 15000 },
      ),
    );
  }
  async context(memberId: string) {
    requireRegistrationFixture();
    return this.safe(() =>
      this.prisma.$transaction(async (tx) => {
        const member = await tx.member.findUnique({
          where: { id: memberId },
          select: {
            id: true,
            email: true,
            emailVerified: true,
            membershipStatus: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            phoneNumber: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            postcode: true,
          },
        });
        if (!member) throw new NotFoundException('Account not found');
        requireRegistrationFixture(member.email);
        if (!member.emailVerified)
          throw new ForbiddenException('Email verification required');
        const submission = await tx.membershipApplicationSubmission.findUnique({
          where: { memberId },
        });
        const historical =
          !submission &&
          (await tx.memberRegistration.count({ where: { memberId } })) > 0;
        return {
          memberId: member.id,
          email: member.email,
          state: submission
            ? 'submitted'
            : historical
              ? 'historical_review_required'
              : member.membershipStatus === 'pending'
                ? 'not_submitted'
                : 'ineligible',
          personalDetails: {
            firstName: member.firstName,
            lastName: member.lastName,
            dateOfBirth: member.dateOfBirth.toISOString().slice(0, 10),
            phoneNumber: member.phoneNumber,
            addressLine1: member.addressLine1,
            addressLine2: member.addressLine2 ?? '',
            city: member.city,
            postcode: member.postcode,
          },
          receipt: submission ? receipt(submission) : null,
          content: {
            version: DEVELOPMENT_CONTENT_VERSION,
            approved: false,
            declarations: DEVELOPMENT_DECLARATIONS,
          },
        };
      }),
    );
  }
}
