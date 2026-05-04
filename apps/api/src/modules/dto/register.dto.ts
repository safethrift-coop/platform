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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({
    description: 'Member first name',
    example: 'Adaeze',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.trim())
  firstName!: string;

  @ApiProperty({
    description: 'Member last name',
    example: 'Nwosu',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.trim())
  lastName!: string;

  @ApiProperty({
    description: 'Email address — used for login',
    example: 'adaeze@example.com',
  })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) => value.toLowerCase().trim())
  email!: string;

  @ApiProperty({
    description: 'UK phone number',
    example: '+447911123456',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(20)
  @Matches(/^\+?[0-9\s\-()]+$/, {
    message: 'Phone number must be a valid UK number',
  })
  phoneNumber!: string;

  @ApiProperty({
    description: 'Date of birth — must be 18 or over',
    example: '1990-05-15',
  })
  @IsDateString()
  dateOfBirth!: string;

  @ApiProperty({
    description: 'First line of UK address',
    example: '12 Cooperative Way',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  addressLine1!: string;

  @ApiPropertyOptional({
    description: 'Second line of UK address',
    example: 'Flat 2',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  addressLine2?: string;

  @ApiProperty({
    description: 'City',
    example: 'London',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({
    description: 'UK postcode',
    example: 'SW1A 1AA',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i, {
    message: 'Postcode must be a valid UK postcode',
  })
  postcode!: string;

  @ApiProperty({
    description:
      'Password — min 8 chars, must include uppercase, lowercase, number, and special character',
    example: 'Safethrift@2026',
    minLength: 8,
  })
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

  @ApiProperty({
    enum: MembershipType,
    description: 'Individual (£30/year) or Family (£50/year)',
    example: MembershipType.Individual,
  })
  @IsNotEmpty()
  @IsEnum(MembershipType)
  membershipType!: MembershipType;

  @ApiPropertyOptional({
    description: 'Occupation or employment status',
    example: 'Software Engineer',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  occupation?: string;

  @ApiPropertyOptional({
    description: 'Migration status',
    example: 'uk_citizen',
    enum: [
      'uk_citizen',
      'settled_status',
      'pre_settled_status',
      'visa_holder',
      'refugee',
      'asylum_seeker',
      'other',
    ],
  })
  @IsOptional()
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

  @ApiPropertyOptional({
    description: 'How did you hear about Safethrift?',
    example: 'Community event',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  referralSource?: string;

  @ApiPropertyOptional({
    description: 'Why do you want to join?',
    example: 'Access to fair finance',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  whyJoining?: string;

  @ApiProperty({
    enum: PaymentMethod,
    description: 'Preferred payment method for membership fee',
    example: PaymentMethod.DirectDebit,
  })
  @IsEnum(PaymentMethod)
  preferredPaymentMethod!: PaymentMethod;

  @ApiProperty({
    description: 'Declaration: I support the aims and values of Safethrift',
    example: true,
  })
  @IsBoolean()
  @Equals(true, {
    message: 'You must support the aims and values of Safethrift',
  })
  consentAimsAndValues!: boolean;

  @ApiProperty({
    description: 'Declaration: I accept the membership terms',
    example: true,
  })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the membership terms' })
  termsAccepted!: boolean;

  @ApiProperty({
    description: 'Declaration: I consent to data processing under GDPR',
    example: true,
  })
  @IsBoolean()
  @Equals(true, { message: 'You must consent to data processing' })
  consentDataProcessing!: boolean;

  @ApiProperty({
    description: 'Declaration: I consent to behavioural credit assessment',
    example: false,
  })
  @IsBoolean()
  consentCreditAssessment!: boolean;

  @ApiProperty({
    description: 'Typed full name as signature',
    example: 'Adaeze Okafor',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  signatureText!: string;
}
