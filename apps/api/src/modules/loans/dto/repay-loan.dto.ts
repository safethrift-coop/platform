import { IsNumber, IsPositive, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RepayLoanDto {
  @ApiProperty({
    description: 'Amount being repaid in GBP',
    example: 83.33,
    minimum: 0.01,
    maximum: 10000,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10000)
  amount!: number;
}
