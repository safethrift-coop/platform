import {
  IsDefined,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
  Equals,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PersonalDetailsDto, trimInput } from '../../dto/register.dto';
import { IsCalendarDate } from '../registration/date.validation';
import { DEVELOPMENT_CONTENT_VERSION } from '../registration/registration.config';
export enum MembershipTier {
  Individual = 'individual',
  Family = 'family',
}
class HouseholdMemberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trimInput)
  fullName!: string;
  @IsCalendarDate()
  dateOfBirth!: string;
}
export class ApplyMembershipDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PersonalDetailsDto)
  personalDetails!: PersonalDetailsDto;
  @IsEnum(MembershipTier)
  membershipType!: MembershipTier;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HouseholdMemberDto)
  householdMembers?: HouseholdMemberDto[];
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimInput)
  occupation?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimInput)
  referralSource?: string;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimInput)
  whyJoining?: string;
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsBoolean({ each: true })
  declarations!: boolean[];
  @Equals(DEVELOPMENT_CONTENT_VERSION)
  contentVersion!: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trimInput)
  signatureText!: string;
  @IsCalendarDate()
  signedDate!: string;
  @IsEnum(['direct_debit', 'bank_transfer', 'card'])
  preferredPaymentMethod!: string;
}
