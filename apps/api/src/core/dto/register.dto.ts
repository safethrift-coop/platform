import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsDateString,
  IsOptional,
  IsBoolean,
  Equals,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum MembershipType {
  Individual = 'individual',
  Family = 'family',
}

export enum PaymentMethod {
  DirectDebit = 'direct_debit',
  BankTransfer = 'bank_transfer',
  Card = 'card',
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.trim())
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.trim())
  lastName!: string;

  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) => value.toLowerCase().trim())
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(20)
  @Matches(/^\+?[0-9\s\-()]+$/, {
    message: 'Phone number must be a valid UK number',
  })
  phoneNumber!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  addressLine1!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i, {
    message: 'Postcode must be a valid UK postcode',
  })
  postcode!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_#])[A-Za-z\d@$!%*?&\-_#]{8,}$/,
    {
      message:
        'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
    },
  )
  password!: string;

  @IsEnum(MembershipType)
  membershipType!: MembershipType;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  occupation?: string;
  @IsIn([
    'uk_citizen',
    'settled_status',
    'pre_settled_status',
    'visa_holder',
    'refugee',
    'asylum_seeker',
    'other',
  ])
  migrationStatus?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  referralSource?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  whyJoining?: string;

  @IsEnum(PaymentMethod)
  preferredPaymentMethod!: PaymentMethod;

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
  consentCreditAssessment!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  signatureText!: string;
}
