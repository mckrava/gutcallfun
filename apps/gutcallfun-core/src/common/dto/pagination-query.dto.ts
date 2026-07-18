import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Shared limit/offset query DTO reused by every paginated list endpoint
 * across this phase (plans 02 and 03). Both properties are documented with
 * an explicit `type: 'integer'` because @nestjs/swagger would otherwise infer
 * the looser OpenAPI `number` from the TypeScript `number` type, and
 * integer-vs-number is part of the contract being frozen here (D-05).
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Maximum number of items to return (1-100, default 20).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    default: 0,
    description: 'Number of items to skip before starting to collect the result set.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
