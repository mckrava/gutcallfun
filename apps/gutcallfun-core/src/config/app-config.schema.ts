import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsUrl({
    protocols: ['postgresql', 'postgres'],
    require_tld: false,
    require_protocol: true,
  })
  DATABASE_URL: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  NODE_ENV: string = 'development';

  @IsString()
  TXLINE_GUEST_JWT: string;

  @IsString()
  TXLINE_API_TOKEN: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PAST_FIXTURES_COUNT: number = 20;

  @IsInt()
  SERVICE_LEVEL_ID: number;

  @IsUrl({ require_tld: false, require_protocol: true })
  WEB_APP_ORIGIN: string;

  /**
   * OPTIONAL fallback: when set to a positive integer, a prediction window is
   * opened for a live game if none has opened in that many milliseconds, even
   * without a clean attack_possession trigger.
   *
   * Deliberately OPTIONAL with no default — leaving it unset disables the
   * fallback entirely. It must never become a required boot variable: this app
   * hard-fails on missing required env, and one such trap (WEB_APP_ORIGIN) is
   * already enough.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  LIVE_QUESTION_FALLBACK_TIMER_MS?: number;

  // ---- Phase 3: Wallet Auth (AUTH-01/02/03) ----

  // Secret used to sign stateless access JWTs. Refresh tokens are opaque
  // in-memory values (not JWTs), so no refresh secret is needed. Min length is
  // an ASVS-L1 guard against a trivially brute-forceable HMAC key.
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  // Access-token lifetime in seconds (short-lived; refresh extends the session).
  @IsOptional()
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL: number = 900; // 15 minutes

  // Refresh-token lifetime in seconds (governs the in-memory refresh store TTL).
  @IsOptional()
  @IsInt()
  @Min(300)
  JWT_REFRESH_TTL: number = 2_592_000; // 30 days

  // Domain bound into the SIWS sign-in message (anti-phishing). Optional —
  // falls back to the WEB_APP_ORIGIN host when unset (resolved in AuthService).
  @IsOptional()
  @IsString()
  AUTH_DOMAIN?: string;

  // Dev match simulator (POST /dev/live/*). FAIL-CLOSED: DevModule is mounted
  // ONLY when this is exactly "true" (see app.module.ts), so the routes don't
  // exist at all otherwise — including production. Never set in a real deploy.
  @IsOptional()
  @IsString()
  ENABLE_DEV_SIM?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  // RESEARCH Pitfall 6: SL=1 silently ships a 60s-delayed feed under a live
  // premise. Fail fast — never allow a non-12 service level to boot.
  if (validated.SERVICE_LEVEL_ID !== 12) {
    throw new Error(
      `SERVICE_LEVEL_ID must be 12 (real-time delivery); got ${validated.SERVICE_LEVEL_ID}. ` +
        'SL=1 silently delays the feed by ~60s, breaking the live prediction-window premise.',
    );
  }

  return validated;
}
