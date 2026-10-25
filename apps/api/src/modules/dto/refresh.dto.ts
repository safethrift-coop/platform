import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class RefreshDto {
  // Locator only: the secret must authenticate against this member's stored hash.
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  memberId!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID(4)
  refreshToken?: string;
}
