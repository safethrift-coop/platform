import {
  IsString,
  IsOptional,
  MaxLength,
  Matches,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateMemberDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.trim())
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.trim())
  lastName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  addressLine1?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i, {
    message: 'Postcode must be a valid UK postcode',
  })
  postcode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  @Matches(/^\+?[0-9\s\-()]+$/, {
    message: 'Phone number must be a valid format',
  })
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  occupation?: string;

  @IsString()
  @IsOptional()
  @IsIn(['en', 'fr', 'ar', 'so', 'ti', 'am', 'ur', 'pa', 'bn'])
  preferredLanguage?: string;
}
