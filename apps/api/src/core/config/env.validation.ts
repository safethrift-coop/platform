import { validateRegistrationEnvironment } from '../../modules/membership/registration/registration.config';
import { paymentConfig } from '../../modules/payment-webhooks/payment-webhook.config';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
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

  @IsIn(['disabled', 'simulate', 'twilio'])
  T36_SMS_MODE: string = 'disabled';

  @IsOptional()
  @IsString()
  TWILIO_ACCOUNT_SID?: string;

  @IsOptional()
  @IsString()
  TWILIO_API_KEY_SID?: string;

  @IsOptional()
  @IsString()
  TWILIO_API_KEY_SECRET?: string;

  @IsOptional()
  @IsString()
  TWILIO_AUTH_TOKEN?: string;

  @IsOptional()
  @IsString()
  TWILIO_MESSAGING_SERVICE_SID?: string;

  @IsOptional()
  @IsString()
  T36_TWILIO_STATUS_CALLBACK_URL?: string;

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
  validateRegistrationEnvironment(config);
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

  // Live T36 reminder delivery requires separate authorization and a code change.
  if (validated.T36_EMAIL_MODE === 'resend')
    throw new Error('T36 external email is not authorized');
  if (
    ['production', 'staging'].includes(validated.NODE_ENV) &&
    validated.T36_SMS_MODE === 'twilio'
  )
    throw new Error('T36 external SMS is not authorized in production/staging');
  if (validated.T36_SMS_MODE === 'twilio') {
    for (const key of [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_API_KEY_SID',
      'TWILIO_API_KEY_SECRET',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_MESSAGING_SERVICE_SID',
      'T36_TWILIO_STATUS_CALLBACK_URL',
    ] as const)
      if (!validated[key]) throw new Error(`T36 ${key} is required`);
    let callback: URL;
    try {
      callback = new URL(validated.T36_TWILIO_STATUS_CALLBACK_URL!);
    } catch {
      throw new Error('T36 Twilio callback URL must be valid HTTPS');
    }
    if (callback.protocol !== 'https:')
      throw new Error('T36 Twilio callback URL must be valid HTTPS');
  }
  return validated;
}
