import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

const GAME_STATUS_VALUES = [
  'scheduled',
  'live',
  'finished',
  'cancelled',
] as const;

/**
 * Extends the shared pagination DTO (plan 01) with the two `GET /games`
 * filters: `status` (one of the four `game_status` enum values) and
 * `user_id` (games this user has joined, resolved through the `user_game`
 * fixture rows).
 */
export class ListGamesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: GAME_STATUS_VALUES,
    description: 'Filter by exact game_status.',
  })
  @IsOptional()
  @IsIn(GAME_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filter to games this user has joined (resolved via user_game).',
  })
  @IsOptional()
  @IsUUID()
  user_id?: string;
}
