import {
  IsEnum,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  ValidateNested,
  IsDateString,
  Equals,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum MembershipTier {
  Individual = 'individual',
  Family = 'family',
}

class HouseholdMemberDto {
  @IsString()
  @MaxLength(200)
  fullName!: string;

  @IsDateString()
  dateOfBirth!: string;
}

export class ApplyMembershipDto {
  @IsEnum(MembershipTier)
  membershipType!: MembershipTier;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HouseholdMemberDto)
  householdMembers?: HouseholdMemberDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referralSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  whyJoining?: string;

  @IsBoolean()
  @Equals(true, {
    message: 'You must support the aims and values of Safethrift',
  })
  consentAimsAndValues!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the membership terms' })
  termsAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'You must consent to data processing' })
  consentDataProcessing!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'You must consent to credit assessment' })
  consentCreditAssessment!: boolean;

  @IsString()
  @MaxLength(200)
  signatureText!: string;

  @IsEnum(['direct_debit', 'bank_transfer', 'card'])
  preferredPaymentMethod!: string;
}
