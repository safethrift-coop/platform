import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { RegisterDto } from '../dto/register.dto';
import { JwtPayload } from '../../core/decorators/current-member.decorator';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const REFRESH_TOKEN_PREFIX = 'refresh:';
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

    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  // ─────────────────────────────────────────────
  // REGISTRATION
  // ─────────────────────────────────────────────

  async register(
    dto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string; memberId: string }> {
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

    // 5. Create member + registration record atomically
    const member = await this.prisma.$transaction(async (tx) => {
      const newMember = await tx.member.create({
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
          occupation: dto.occupation,
          membershipStatus: 'pending',
          passwordHash,
        },
      });

      await tx.memberRegistration.create({
        data: {
          memberId: newMember.id,
          registrationChannel: 'web_portal',
          membershipType: dto.membershipType,
          membershipFeePaid: false,
          termsAccepted: dto.termsAccepted,
          termsAcceptedAt: new Date(),
          consentDataProcessing: dto.consentDataProcessing,
          consentDataProcessedAt: new Date(),
          consentCreditAssess: dto.consentCreditAssessment,
          consentCreditAssessAt: new Date(),
          referralSource: dto.referralSource,
          whyJoining: dto.whyJoining,
          preferredPaymentMethod: dto.preferredPaymentMethod,
          signatureText: dto.signatureText,
          ipAddress,
          userAgent,
        },
      });

      // 6. AML risk flag for high-risk migration statuses
      const highRiskStatuses = ['asylum_seeker', 'refugee', 'other'];
      if (
        dto.migrationStatus &&
        highRiskStatuses.includes(dto.migrationStatus)
      ) {
        await tx.kycVerification.create({
          data: {
            memberId: newMember.id,
            documentType: 'passport',
            verificationStatus: 'pending',
            riskFlag: true,
            riskFlagReason: 'Enhanced due diligence required',
            notes: 'Auto-flagged at registration — compliance review needed',
          },
        });
        this.logger.warn(
          `AML risk flag set at registration for member ${newMember.id}`,
        );
      }

      return newMember;
    });

    // 7. Generate email verification token and store in Redis
    const verifyToken = uuidv4();
    await this.redis.set(
      `${EMAIL_VERIFY_PREFIX}${verifyToken}`,
      member.id,
      EMAIL_VERIFY_TTL_SECONDS,
    );

    // New — structured, searchable
    this.logger.info('Member registered', {
      memberId: member.id,
      ipAddress,
      membershipType: dto.membershipType,
    });

    return {
      message:
        'Registration successful. Please check your email to verify your account.',
      memberId: member.id,
    };
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
    if (!member.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in',
      );
    }

    if (
      member.membershipStatus === 'suspended' ||
      member.membershipStatus === 'closed'
    ) {
      throw new UnauthorizedException(
        'Your account has been suspended. Please contact support.',
      );
    }

    return this.issueTokens(member.id, member.email, 'member', ipAddress);
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
    token: string,
    ipAddress?: string,
  ): Promise<AuthTokens & { refreshToken: string }> {
    const storedHash = await this.redis.get(
      `${REFRESH_TOKEN_PREFIX}${memberId}`,
    );

    if (!storedHash) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    const isValid = await bcrypt.compare(token, storedHash);

    if (!isValid) {
      // Token mismatch — possible theft. Wipe all sessions immediately.
      await this.redis.del(`${REFRESH_TOKEN_PREFIX}${memberId}`);
      this.logger.warn({
        level: 'warn',
        message: `Refresh token replay detected for member ${memberId}. All sessions terminated.`,
      });
      throw new UnauthorizedException(
        'Invalid session detected. All sessions have been terminated for your security. Please log in again.',
      );
    }

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, email: true, membershipStatus: true },
    });

    if (
      !member ||
      member.membershipStatus === 'suspended' ||
      member.membershipStatus === 'closed'
    ) {
      await this.redis.del(`${REFRESH_TOKEN_PREFIX}${memberId}`);
      throw new UnauthorizedException('Account is no longer active.');
    }

    // Delete old refresh token before issuing new one (rotation)
    await this.redis.del(`${REFRESH_TOKEN_PREFIX}${memberId}`);

    return this.issueTokens(memberId, member.email, 'member', ipAddress);
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
    const token = uuidv4();
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

    const resetToken = uuidv4();

    await this.redis.set(
      `${PASSWORD_RESET_PREFIX}${resetToken}`,
      member.id,
      PASSWORD_RESET_TTL_SECONDS,
    );

    // TODO (T36): Send email via SendGrid with reset link
    // The link will be: https://safethrift.coop/reset-password?token={resetToken}
    // For now, log the token so you can test it manually
    this.logger.info(
      `Password reset token for member ${member.id}: ${resetToken}`,
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

    // Invalidate all existing sessions — wipe refresh tokens
    // If an attacker triggered this reset, they cannot keep the old session alive
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

  private async issueTokens(
    memberId: string,
    email: string,
    role: string,
    ipAddress?: string,
  ): Promise<AuthTokens & { refreshToken: string }> {
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

    const refreshToken = uuidv4();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.redis.set(
      `${REFRESH_TOKEN_PREFIX}${memberId}`,
      refreshTokenHash,
      REFRESH_TOKEN_TTL_SECONDS,
    );

    return { accessToken, refreshToken };
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
    const count = await this.prisma.member.count();
    const padded = String(count + 1).padStart(5, '0');
    return `ST-${padded}`;
  }
}
