import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  MaxLength,
  Max,
} from 'class-validator';

export class DepositDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10000)
  amount!: number;

  // Optional note the member can add to explain the deposit
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
