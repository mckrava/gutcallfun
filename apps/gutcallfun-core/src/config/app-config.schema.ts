import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false, require_protocol: true })
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
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
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
