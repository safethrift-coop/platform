import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  MaxLength,
  Max,
} from 'class-validator';

export class WithdrawDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10000)
  amount!: number;

  // Required for withdrawals — we need to know why
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
