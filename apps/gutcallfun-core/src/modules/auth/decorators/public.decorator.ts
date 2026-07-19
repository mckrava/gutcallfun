import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a session. Read by JwtAuthGuard, which is
 * registered globally (Step 4) — until then this is inert metadata, so applying
 * it now keeps the auth routes correct once the global guard lands.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
