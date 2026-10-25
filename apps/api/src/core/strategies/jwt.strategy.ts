import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '@prisma/client';
import { JwtPayload } from '../decorators/current-member.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env['JWT_SECRET'] ?? '',
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload & { ipHash?: string },
  ): Promise<JwtPayload> {
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.email !== 'string' ||
      !payload.email
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Log IP mismatches for compliance monitoring
    // Do NOT reject — mobile users change IP constantly
    if (payload.ipHash && req.ip) {
      const currentIpHash = crypto
        .createHash('sha256')
        .update(req.ip)
        .digest('hex')
        .slice(0, 16);

      if (payload.ipHash !== currentIpHash) {
        this.logger.warn(
          `IP mismatch for member ${payload.sub} — ` +
            `token IP hash: ${payload.ipHash}, ` +
            `current IP hash: ${currentIpHash}`,
        );
      }
    }

    const members = this.prisma.member as Prisma.TransactionClient['member'];
    const member = await members.findUnique({
      where: { id: payload.sub },
      select: { email: true, membershipStatus: true, isAdmin: true },
    });
    if (!member || ['suspended', 'closed'].includes(member.membershipStatus))
      throw new UnauthorizedException('Account cannot authenticate.');
    return {
      ...payload,
      email: member.email,
      // Only administrative authority changes here. Existing signed staff,
      // compliance and board claims retain their prior policy; no new grants.
      role: member.isAdmin
        ? 'admin'
        : payload.role === 'admin'
          ? 'member'
          : payload.role,
    };
  }
}
