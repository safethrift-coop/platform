import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'adaeze@example.com',
    description: 'Registered email address',
  })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) => value.toLowerCase().trim())
  email!: string;

  @ApiProperty({
    example: 'Safethrift@2026',
    description: 'Account password',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
