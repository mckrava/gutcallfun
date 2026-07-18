import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared { items, total, limit, offset } envelope shape reused by every
 * paginated list endpoint across this phase (plans 02 and 03).
 *
 * @nestjs/swagger cannot infer a generic type argument for `items`, so this
 * is exposed as an abstract base class. Concrete resource DTOs (e.g.
 * `PaginatedUsersResponseDto`) extend this class and re-declare `items` with
 * a concrete `@ApiProperty({ type: [ResourceDto] }) items: ResourceDto[]`
 * override so Swagger documents the actual item shape.
 */
export abstract class PaginatedResponseDto<T> {
  abstract items: T[];

  @ApiProperty({ type: 'integer', description: 'Total number of items available across all pages.' })
  total: number;

  @ApiProperty({ type: 'integer', description: 'The `limit` value that produced this page.' })
  limit: number;

  @ApiProperty({ type: 'integer', description: 'The `offset` value that produced this page.' })
  offset: number;
}
