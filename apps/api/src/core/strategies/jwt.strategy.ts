import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import * as crypto from 'crypto';
import { JwtPayload } from '../decorators/current-member.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: JwtPayload & { ipHash?: string },
  ): JwtPayload {
    if (!payload.sub || !payload.email) {
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

    return payload;
  }
}
