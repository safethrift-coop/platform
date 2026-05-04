import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Request,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import type { Response, Request as ExpressRequest } from 'express';
import { AuthService, MemberProfile } from './auth.service';
import { RegisterDto } from '../dto/register.dto';
import { RefreshDto } from '../dto/refresh.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dto/forgot-password.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new member account' })
  @ApiResponse({
    status: 201,
    description: 'Registration successful — check email to verify',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or underage applicant',
  })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @Post('register')
  @Throttle({ short: { limit: 3, ttl: 3600000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: ExpressRequest,
  ): Promise<{ message: string; memberId: string }> {
    return this.authService.register(dto, req.ip, req.headers['user-agent']);
  }

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Returns JWT access token' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or email not verified',
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard('local'))
  async login(
    @Request() req: ExpressRequest & { user: MemberProfile },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.authService.login(req.user, req.ip);

    // Refresh token goes in HttpOnly cookie — never exposed to JavaScript
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/api/v1/auth/refresh',
    });

    return { accessToken: tokens.accessToken };
  }

  @Get('verify-email')
  async verifyEmail(
    @Query('token') token: string,
  ): Promise<{ message: string }> {
    return this.authService.verifyEmail(token);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    // Read member ID from the existing access token
    // The refresh token comes from the HttpOnly cookie
    const cookieToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;

    const tokenToUse = cookieToken ?? dto.refreshToken;

    // memberId must come from a valid but possibly expired access token
    // For now we use the body — in T31 this will use a dedicated refresh JWT
    const tokens = await this.authService.refresh(
      dto.refreshToken,
      tokenToUse,
      req.ip,
    );

    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/api/v1/auth/refresh',
    });

    return { accessToken: tokens.accessToken };
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout — invalidates refresh token' })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentMember() member: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    // Clear the cookie on logout
    res.clearCookie(REFRESH_COOKIE_NAME, {
      path: '/api/v1/auth/refresh',
    });
    return this.authService.logout(member.sub);
  }

  @Post('step-up/initiate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async initiateStepUp(
    @Body('action') action: string,
    @CurrentMember() member: JwtPayload,
  ): Promise<{ stepUpToken: string; expiresInSeconds: number }> {
    return this.authService.initiateStepUp(member.sub, action);
  }

  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({
    status: 200,
    description: 'Always returns success to prevent email enumeration',
  })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 3600000 } })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto.email);
  }

  @ApiOperation({ summary: 'Reset password using token from email' })
  @ApiResponse({
    status: 200,
    description: 'Password changed — all sessions invalidated',
  })
  @ApiResponse({ status: 400, description: 'Token expired or invalid' })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 3600000 } })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }
}
