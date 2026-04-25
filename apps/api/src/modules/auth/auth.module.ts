import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from '../../core/strategies/jwt.strategy';
import { LocalStrategy } from '../../core/strategies/local.strategy';
import { PrismaService } from '../../core/database/prisma.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? '',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, PrismaService],
  exports: [AuthService],
})
export class AuthModule {}
