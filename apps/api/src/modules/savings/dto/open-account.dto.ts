import {
  IsEnum,
  IsOptional,
  IsNumber,
  IsPositive,
  IsDateString,
} from 'class-validator';

export enum AccountType {
  FSA = 'savings_fsa',
  RSA = 'savings_rsa',
  GSA = 'savings_gsa',
}

export class OpenAccountDto {
  @IsEnum(AccountType)
  accountType!: AccountType;

  // GSA only — the amount the member wants to save toward
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  goalTarget?: number;

  // GSA only — when the member wants to reach the goal
  @IsOptional()
  @IsDateString()
  goalDeadline?: string;
}
