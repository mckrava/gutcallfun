import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

/**
 * The 'jwt' passport guard, with a `@Public()` bypass. Intended to be
 * registered globally (Step 4, via APP_GUARD) so every route is protected by
 * default and opts out explicitly — the AUTH-03 default-deny posture.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // This is an HTTP concern only. WebSocket handlers authenticate at the
    // handshake (Step 5), not per-message — don't let this Bearer-header guard
    // reject @SubscribeMessage calls that carry no HTTP request.
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
