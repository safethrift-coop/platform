import { IsString, Matches, IsOptional, MaxLength } from 'class-validator';

export class WithdrawDto {
  // Exact decimal input. Numeric JSON amounts are deliberately not accepted.
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
