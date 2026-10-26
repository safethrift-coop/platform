import { paymentConfig } from '../../modules/payment-webhooks/payment-webhook.config';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

class EnvironmentVariables {
  @IsIn(['true', 'false'])
  T36_JOBS_ENABLED: string = 'false';

  @IsIn(['disabled', 'simulate', 'resend'])
  T36_EMAIL_MODE: string = 'disabled';

  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsIn(['true', 'false'])
  SAVINGS_SIMULATION_ENABLED: string = 'false';

  @IsInt()
  @Min(1)
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_HOST!: string;

  @IsInt()
  REDIS_PORT: number = 6379;

  @IsString()
  REDIS_PASSWORD!: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @MinLength(64)
  ENCRYPTION_KEY!: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  paymentConfig(undefined, config as NodeJS.ProcessEnv);
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  // Production Resend activation requires separate authorization and a reviewed
  // change to this deployment gate. This implementation cannot enable it.
  if (
    ['production', 'staging'].includes(validated.NODE_ENV) &&
    validated.T36_EMAIL_MODE === 'resend'
  )
    throw new Error(
      'T36 external email is not authorized in production/staging',
    );
  return validated;
}
