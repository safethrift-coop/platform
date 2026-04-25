import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { validate } from './core/config/env.validation';
import { RedisModule } from './core/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './core/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60000, limit: 60 },
      { name: 'medium', ttl: 3600000, limit: 500 },
    ]),
    DatabaseModule,
    RedisModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
