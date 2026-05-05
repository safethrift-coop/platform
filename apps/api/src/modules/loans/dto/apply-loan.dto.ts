import {
  IsNumber,
  IsPositive,
  IsInt,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApplyLoanDto {
  @ApiProperty({
    description: 'Amount requested in GBP',
    example: 500,
    minimum: 50,
    maximum: 5000,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(50)
  @Max(5000)
  requestedAmount!: number;

  @ApiProperty({
    description: 'Purpose of the loan',
    example: 'Business equipment purchase',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  loanPurpose!: string;

  @ApiProperty({
    description: 'Requested repayment term in months',
    example: 12,
    minimum: 3,
    maximum: 36,
  })
  @IsInt()
  @Min(3)
  @Max(36)
  requestedTermMonths!: number;
}
