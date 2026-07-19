import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessClaims, AuthPrincipal } from './auth.types';

/**
 * Validates `Authorization: Bearer <access JWT>`. Only tokens minted as access
 * tokens (`typ: 'access'`) are accepted — a registration token, which shares
 * the signing secret, must never authenticate a protected request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessClaims): AuthPrincipal {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Not an access token');
    }
    return { userId: payload.sub };
  }
}
