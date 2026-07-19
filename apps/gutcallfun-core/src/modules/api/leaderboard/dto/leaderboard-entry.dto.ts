import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';

/**
 * `total_points` is the aggregate Phase 5 will compute as
 * `SUM(awarded_points)` grouped by user (`idx_uga_leaderboard`); here it is
 * a pre-sorted fixture value. `rank` is assigned by the service from the
 * descending `total_points` ordering, not stored on the fixture row.
 */
export class LeaderboardEntryDto {
  @ApiProperty({ format: 'uuid' })
  user_id: string;

  @ApiProperty({ example: 'goal_hunter_42' })
  handle: string;

  @ApiProperty({ example: '🦊', nullable: true, description: 'Persisted avatar emoji.' })
  emoji: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://example.com/avatars/42.png',
  })
  image: string | null;

  @ApiProperty({ type: 'integer', example: 315 })
  total_points: number;

  @ApiProperty({
    type: 'integer',
    example: 1,
    description:
      'Strictly increasing from 1, assigned by descending total_points order.',
  })
  rank: number;
}

/**
 * `{ items, total, limit, offset }` envelope for `GET /leaderboard`.
 */
export class PaginatedLeaderboardResponseDto extends PaginatedResponseDto<LeaderboardEntryDto> {
  @ApiProperty({ type: () => LeaderboardEntryDto, isArray: true })
  items: LeaderboardEntryDto[];
}
