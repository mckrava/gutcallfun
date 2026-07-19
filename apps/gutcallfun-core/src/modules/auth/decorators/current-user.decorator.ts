import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthPrincipal } from '../auth.types';

/** Injects the JwtStrategy-resolved principal (`req.user`) into a handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    return ctx.switchToHttp().getRequest<{ user: AuthPrincipal }>().user;
  },
);
