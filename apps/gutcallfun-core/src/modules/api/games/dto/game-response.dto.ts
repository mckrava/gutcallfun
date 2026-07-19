import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';

/**
 * Mirrors the `game` table (initial-db-structure.sql) field-for-field, in
 * snake_case, per D-01. Deliberately OMITS the two SSE resume-cursor
 * columns (the last-frame-id resume token and its staleness timestamp):
 * those describe the backend's own feed-connection bookkeeping, not game
 * facts, and this surface is unauthenticated (T-02.1-13) — do not add them
 * back to this DTO.
 */
export class GameResponseDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({
    type: 'integer',
    example: 5001,
    description: 'TxLINE FixtureId.',
  })
  fixture_id: number;

  @ApiProperty({
    example: 'live',
    enum: ['scheduled', 'live', 'finished', 'cancelled'],
    description: 'One of the four `game_status` enum values.',
  })
  status: string;

  @ApiPropertyOptional({ example: '2026-07-18T15:00:00.000Z', nullable: true })
  starts_at: string | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true, example: 101 })
  participant1_id: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true, example: 102 })
  participant2_id: number | null;

  @ApiProperty({
    example: true,
    description: 'Tug-of-war direction: whether participant1 is the home side.',
  })
  participant1_is_home: boolean;

  @ApiPropertyOptional({ example: 'Brazil', nullable: true })
  team1_name: string | null;

  @ApiPropertyOptional({ example: 'Argentina', nullable: true })
  team2_name: string | null;

  @ApiPropertyOptional({ example: 'World Cup 2026', nullable: true })
  competition: string | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true, example: 1 })
  fixture_group_id: number | null;

  @ApiPropertyOptional({ example: '#FFD700', nullable: true })
  team1_jersey_color: string | null;

  @ApiPropertyOptional({ example: '#FFFFFF', nullable: true })
  team2_jersey_color: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    example: 4,
    description:
      'Raw open-set TxLINE StatusId as last observed on the feed. Deliberately not an enum — value 100 is observed in the wild.',
  })
  current_status_id: number | null;

  @ApiProperty({
    type: 'integer',
    example: 1,
    description: 'Denormalized for the fixture-list UI.',
  })
  score_p1: number;

  @ApiProperty({ type: 'integer', example: 0 })
  score_p2: number;

  @ApiProperty({ example: false, description: 'Demo/virtual fixture marker.' })
  is_replay: boolean;

  @ApiProperty({ example: '2026-07-10T09:00:00.000Z' })
  created_at: string;

  @ApiPropertyOptional({ example: '2026-07-18T15:32:00.000Z', nullable: true })
  updated_at: string | null;
}

/**
 * `{ items, total, limit, offset }` envelope for `GET /games`, extending the
 * shared abstract base from plan 01 (`common/dto/paginated-response.dto.ts`)
 * and re-declaring `items` with the concrete `GameResponseDto` shape, since
 * @nestjs/swagger cannot infer a generic type argument.
 */
export class PaginatedGamesResponseDto extends PaginatedResponseDto<GameResponseDto> {
  @ApiProperty({ type: () => GameResponseDto, isArray: true })
  items: GameResponseDto[];
}
