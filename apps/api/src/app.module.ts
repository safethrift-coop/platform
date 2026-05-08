import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { validate } from './core/config/env.validation';
import { RedisModule } from './core/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './core/database/database.module';
import { MembersModule } from './modules/members/members.module';
import { MembershipModule } from './modules/membership/membership.module';
import { LoggerModule } from './core/logger/logger.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { SavingsModule } from './modules/savings/savings.module';
import { PointsModule } from './modules/points/points.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoansModule } from './modules/loans/loans.module';
import { ScoringModule } from './modules/scoring/scoring.module';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60000, limit: 60 },
      { name: 'medium', ttl: 3600000, limit: 500 },
    ]),

    EventEmitterModule.forRoot(),

    DatabaseModule,
    RedisModule,
    AuthModule,
    MembersModule,
    MembershipModule,
    SavingsModule,
    PointsModule,
    LoansModule,
    ScoringModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
