import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './core/logger/logger.config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: WinstonModule.createLogger(winstonConfig),
  });

  app.enableShutdownHooks();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      hidePoweredBy: true,
    }),
  );

  app.use(cookieParser());

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://safethrift.coop', 'https://app.safethrift.coop']
        : ['http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Only enable Swagger in development
  // In production, API docs should not be publicly accessible
  if (process.env['NODE_ENV'] !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Safethrift API')
      .setDescription(
        'Safethrift cooperative finance platform — REST API documentation. ' +
          'All financial endpoints require a valid JWT access token.',
      )
      .setVersion('1.0')
      .setContact(
        'Safethrift Engineering',
        'https://safethrift.coop',
        'engineering@safethrift.coop',
      )
      .setLicense('Private', '')
      // This adds the Authorize button in the UI
      // so you can paste a JWT token and test protected endpoints
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste your access token here',
        },
        'access-token', // this name is referenced in @ApiBearerAuth() decorators
      )
      .addTag('auth', 'Registration, login, password reset')
      .addTag('members', 'Member profile and GDPR controls')
      .addTag('membership', 'Membership applications and admin approval')
      .addTag('accounts', 'Savings accounts, deposits, and withdrawals')
      .addTag('points', 'Savings points balance and history')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true, // token stays after page refresh
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Safethrift API running on port ${port}`);
}

void bootstrap();
