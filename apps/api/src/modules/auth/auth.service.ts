import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { requireRegistrationFixture } from '../membership/registration/registration.config';
import { RegisterDto } from '../dto/register.dto';
import { JwtPayload } from '../../core/decorators/current-member.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import axios from 'axios';
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const REFRESH_TOKEN_PREFIX = 'refresh:';
// Public timing padding, not a credential: missing slots still do bcrypt work.
const MISSING_REFRESH_HASH =
  '$2b$10$vjWoBOrS9eErsQft9HnYxejO97KgYvKXZWO2eD/8aM2SfSv6b5vJG';
const EMAIL_VERIFY_PREFIX = 'email_verify:';
const EMAIL_VERIFY_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const STEP_UP_TTL_SECONDS = 300; // 5 minutes
const STEP_UP_PREFIX = 'stepup:';
const PASSWORD_RESET_PREFIX = 'pwd_reset:';
const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1 hour

export interface AuthTokens {
  accessToken: string;
}

export interface MemberProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  membershipStatus: string;
  emailVerified: boolean;
  passwordHash: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  // ─────────────────────────────────────────────
  // REGISTRATION
  // ─────────────────────────────────────────────

  async register(
    dto: RegisterDto,
  ): Promise<{ message: string; memberId: string }> {
    requireRegistrationFixture(dto.email);
    try {
      // 1. Check for duplicate email
      const existing = await this.prisma.member.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }

      // 2. Age validation — must be 18+
      const dob = new Date(dto.dateOfBirth);
      const age = this.calculateAge(dob);
      if (age < 18) {
        throw new BadRequestException(
          'You must be at least 18 years old to register',
        );
      }
      if (age > 120) {
        throw new BadRequestException('Please enter a valid date of birth');
      }

      // 3. Breached password check via HIBP k-anonymity API
      await this.checkBreachedPassword(dto.password);

      // 4. Hash password
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      const membershipNumber = await this.generateMembershipNumber();

      // Account creation alone never writes a membership registration or declaration.
      const member = await this.prisma.member.create({
        data: {
          membershipNumber,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phoneNumber: dto.phoneNumber,
          dateOfBirth: dob,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          postcode: dto.postcode.toUpperCase().trim(),
          country: 'GB',
          membershipStatus: 'pending',
          passwordHash,
        },
      });

      // 7. Generate email verification token and store in Redis
      const verifyToken = crypto.randomUUID();
      await this.redis.set(
        `${EMAIL_VERIFY_PREFIX}${verifyToken}`,
        member.id,
        EMAIL_VERIFY_TTL_SECONDS,
      );

      // New — structured, searchable
      await this.notifications.sendVerificationEmail(
        dto.email,
        dto.firstName,
        verifyToken,
      );

      return {
        message:
          'Account created. Verify your email before completing a membership application. No application has been submitted.',
        memberId: member.id,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ConflictException('Account already exists');
      throw new ServiceUnavailableException(
        'Account creation unavailable; no membership application has been submitted',
      );
    }
  }

  // ─────────────────────────────────────────────
  // VALIDATE MEMBER (used by LocalStrategy)
  // ─────────────────────────────────────────────

  async validateMember(
    email: string,
    password: string,
  ): Promise<MemberProfile | null> {
    const member = await this.prisma.member.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        membershipStatus: true,
        emailVerified: true,
        passwordHash: true,
      },
    });

    if (!member) {
      // Timing-safe: always hash even when member not found
      // This prevents attackers discovering valid emails via response time
      await bcrypt.hash('dummy_timing_safe_hash_placeholder', BCRYPT_ROUNDS);
      return null;
    }

    const passwordHash = (member as Record<string, unknown>)[
      'passwordHash'
    ] as string;

    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) return null;

    // Silently rehash if cost factor has increased since last login
    await this.rehashIfNeeded(member.id, password, passwordHash);

    return {
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      membershipStatus: member.membershipStatus,
      emailVerified: member.emailVerified,
      passwordHash,
    };
  }

  // ─────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────

  async login(
    member: MemberProfile,
    ipAddress?: string,
  ): Promise<AuthTokens & { refreshToken: string }> {
    // Reload trusted authority instead of accepting a role from the local profile.
    const current = await this.prisma.member.findUnique({
      where: { id: member.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        membershipStatus: true,
        isAdmin: true,
      },
    });
    if (
      !current ||
      !current.emailVerified ||
      ['suspended', 'closed'].includes(current.membershipStatus)
    )
      throw new UnauthorizedException('Account cannot authenticate.');
    return this.issueTokens(
      current.id,
      current.email,
      current.isAdmin ? 'admin' : 'member',
      ipAddress,
    );
  }

  // ─────────────────────────────────────────────
  // EMAIL VERIFICATION
  // ─────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ message: string }> {
    const memberId = await this.redis.get(`${EMAIL_VERIFY_PREFIX}${token}`);

    if (!memberId) {
      throw new BadRequestException(
        'This verification link has expired or is invalid. Please request a new one.',
      );
    }

    await this.prisma.member.update({
      where: { id: memberId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    await this.redis.del(`${EMAIL_VERIFY_PREFIX}${token}`);
    this.logger.info(`Email verified for member ${memberId}`);

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // ─────────────────────────────────────────────
  // REFRESH TOKEN ROTATION
  // ─────────────────────────────────────────────

  async refresh(
    memberId: string,
    token: string | undefined,
    ipAddress?: string,
  ): Promise<AuthTokens & { refreshToken: string }> {
    const rejected = () =>
      new UnauthorizedException('Invalid or expired refresh session.');
    if (
      typeof memberId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(memberId) ||
      typeof token !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        token,
      )
    )
      throw rejected();
    const key = `${REFRESH_TOKEN_PREFIX}${memberId}`;
    const storedHash = await this.redis.get(key);
    const matches = await bcrypt.compare(
      token,
      storedHash ?? MISSING_REFRESH_HASH,
    );
    if (!storedHash || !matches) throw rejected();

    // No member lookup or token issuance before proving possession of the secret.
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        membershipStatus: true,
        isAdmin: true,
      },
    });
    if (
      !member ||
      !member.emailVerified ||
      ['suspended', 'closed'].includes(member.membershipStatus)
    ) {
      await this.redis.compareAndSwap(
        key,
        storedHash,
        null,
        REFRESH_TOKEN_TTL_SECONDS,
      );
      throw rejected();
    }
    const prepared = await this.prepareTokens(
      member.id,
      member.email,
      member.isAdmin ? 'admin' : 'member',
      ipAddress,
    );
    if (
      !(await this.redis.compareAndSwap(
        key,
        storedHash,
        prepared.refreshTokenHash,
        REFRESH_TOKEN_TTL_SECONDS,
      ))
    )
      throw rejected();
    return {
      accessToken: prepared.accessToken,
      refreshToken: prepared.refreshToken,
    };
  }

  // ─────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────

  async logout(memberId: string): Promise<{ message: string }> {
    await this.redis.del(`${REFRESH_TOKEN_PREFIX}${memberId}`);
    this.logger.info({
      level: 'info',
      message: `Member ${memberId} logged out`,
    });
    return { message: 'Logged out successfully.' };
  }

  // ─────────────────────────────────────────────
  // STEP-UP AUTHENTICATION
  // For high-risk actions: loan applications, large withdrawals
  // ─────────────────────────────────────────────

  async initiateStepUp(
    memberId: string,
    action: string,
  ): Promise<{ stepUpToken: string; expiresInSeconds: number }> {
    const token = crypto.randomUUID();
    await this.redis.set(
      `${STEP_UP_PREFIX}${memberId}:${action}`,
      token,
      STEP_UP_TTL_SECONDS,
    );
    this.logger.info({
      level: 'info',
      message: `Step-up initiated for member ${memberId} action: ${action}`,
    });
    return { stepUpToken: token, expiresInSeconds: STEP_UP_TTL_SECONDS };
  }

  async verifyStepUp(
    memberId: string,
    action: string,
    token: string,
  ): Promise<void> {
    const stored = await this.redis.get(
      `${STEP_UP_PREFIX}${memberId}:${action}`,
    );

    if (!stored || stored !== token) {
      throw new UnauthorizedException(
        'Step-up authentication failed or expired. Please re-authenticate to proceed.',
      );
    }

    // One-time use — delete immediately after successful verification
    await this.redis.del(`${STEP_UP_PREFIX}${memberId}:${action}`);
    this.logger.info(
      `Step-up verified for member ${memberId} action: ${action}`,
    );
  }

  // ─────────────────────────────────────────────
  // FORGOT PASSWORD
  // ─────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    const member = await this.prisma.member.findUnique({
      where: { email },
      select: { id: true, firstName: true, membershipStatus: true },
    });

    // Always return the same message regardless of whether the email exists.
    // This prevents attackers from using this endpoint to discover
    // which email addresses have Safethrift accounts (account enumeration).
    const genericMessage = {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };

    if (!member || member.membershipStatus === 'closed') {
      return genericMessage;
    }

    const resetToken = crypto.randomUUID();

    await this.redis.set(
      `${PASSWORD_RESET_PREFIX}${resetToken}`,
      member.id,
      PASSWORD_RESET_TTL_SECONDS,
    );

    // TODO (T36): Send email via SendGrid with reset link
    // The link will be: https://safethrift.coop/reset-password?token={resetToken}
    // For now, log the token so you can test it manually
    await this.notifications.sendPasswordResetEmail(
      email,
      member.firstName,
      resetToken,
    );
    return genericMessage;
  }

  // ─────────────────────────────────────────────
  // RESET PASSWORD
  // ─────────────────────────────────────────────

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const memberId = await this.redis.get(`${PASSWORD_RESET_PREFIX}${token}`);

    if (!memberId) {
      throw new BadRequestException(
        'This password reset link has expired or is invalid. Please request a new one.',
      );
    }
    await this.checkBreachedPassword(newPassword);

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.member.update({
      where: { id: memberId },
      data: { passwordHash: newHash } as Record<string, unknown>,
    });

    // Delete the reset token so it cannot be used again
    await this.redis.del(`${PASSWORD_RESET_PREFIX}${token}`);

    // Revoke the refresh session. Already issued access JWTs still expire normally.
    await this.redis.del(`${REFRESH_TOKEN_PREFIX}${memberId}`);

    this.logger.info(`Password reset completed for member ${memberId}`);

    return {
      message:
        'Password reset successfully. Please log in with your new password.',
    };
  }

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  private async prepareTokens(
    memberId: string,
    email: string,
    role: string,
    ipAddress?: string,
  ): Promise<AuthTokens & { refreshToken: string; refreshTokenHash: string }> {
    // Bind token to a hash of the IP — logged but not hard-rejected
    // Mobile users change IPs frequently so we never block on mismatch
    const ipHash = ipAddress
      ? crypto.createHash('sha256').update(ipAddress).digest('hex').slice(0, 16)
      : undefined;

    const payload: JwtPayload & { ipHash?: string } = {
      sub: memberId,
      email,
      role,
      ipHash,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env['JWT_SECRET'] ?? '',
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = crypto.randomUUID();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    return { accessToken, refreshToken, refreshTokenHash };
  }

  private async issueTokens(
    memberId: string,
    email: string,
    role: string,
    ipAddress?: string,
  ): Promise<AuthTokens & { refreshToken: string }> {
    const prepared = await this.prepareTokens(memberId, email, role, ipAddress);
    await this.redis.set(
      `${REFRESH_TOKEN_PREFIX}${memberId}`,
      prepared.refreshTokenHash,
      REFRESH_TOKEN_TTL_SECONDS,
    );
    return {
      accessToken: prepared.accessToken,
      refreshToken: prepared.refreshToken,
    };
  }

  private async checkBreachedPassword(password: string): Promise<void> {
    try {
      const sha1 = crypto
        .createHash('sha1')
        .update(password)
        .digest('hex')
        .toUpperCase();

      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);

      const response = await axios.get<string>(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        { timeout: 3000 },
      );

      const breached = response.data
        .split('\n')
        .some((line) => line.split(':')[0] === suffix);

      if (breached) {
        throw new BadRequestException(
          'This password has appeared in a known data breach. Please choose a different password.',
        );
      }
    } catch (err) {
      // If HIBP is unreachable, fail open — do not block registration
      // Log the failure for monitoring
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`HIBP breach check failed — skipping: ${String(err)}`);
    }
  }

  private async rehashIfNeeded(
    memberId: string,
    plainPassword: string,
    currentHash: string,
  ): Promise<void> {
    try {
      const currentRounds = bcrypt.getRounds(currentHash);
      if (currentRounds < BCRYPT_ROUNDS) {
        const newHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
        await this.prisma.member.update({
          where: { id: memberId },
          data: { passwordHash: newHash } as Record<string, unknown>,
        });
        this.logger.info({
          level: 'info',
          message: `Password rehashed for member ${memberId} (rounds: ${currentRounds} → ${BCRYPT_ROUNDS})`,
        });
      }
    } catch {
      // Never block login due to rehash failure
      this.logger.warn({
        level: 'warn',
        message: `Rehash failed for member ${memberId} — skipping`,
      });
    }
  }

  private calculateAge(dob: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  private async generateMembershipNumber(): Promise<string> {
    return Promise.resolve(`ST-${crypto.randomUUID()}`);
  }
}
