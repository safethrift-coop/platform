import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsCalendarDate } from '../membership/registration/date.validation';
export const trimInput = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
export class PersonalDetailsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trimInput)
  firstName!: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trimInput)
  lastName!: string;
  @IsString()
  @MinLength(12)
  @MaxLength(20)
  @Matches(/^\+?[0-9\s\-()]+$/)
  @Transform(trimInput)
  phoneNumber!: string;
  @IsCalendarDate(true)
  dateOfBirth!: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trimInput)
  addressLine1!: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimInput)
  addressLine2?: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trimInput)
  city!: string;
  @IsString()
  @Matches(/^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i)
  @MaxLength(12)
  @Transform(trimInput)
  postcode!: string;
}
// Account identity only. Declarations, membership tier and payment preferences
// belong exclusively to the authenticated membership application endpoint.
export class RegisterDto extends PersonalDetailsDto {
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email!: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_#])[A-Za-z\d@$!%*?&\-_#]{8,}$/,
  )
  password!: string;
}
