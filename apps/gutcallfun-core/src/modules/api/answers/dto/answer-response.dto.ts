import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';

/**
 * Mirrors `user_game_answer`. `awarded_points` and `successful_outcome` are
 * nullable-until-resolved: in this phase they are illustrative fixture
 * shapes, not real scoring results (T-02.1-16 / must_haves prohibitions —
 * do not present them as authoritative before Phase 4 exists).
 *
 * `reward_multiplier` is `numeric(6,3)` in Postgres, and the `pg` driver
 * returns `numeric` columns as strings. This phase serializes it as a JSON
 * number (the shape the UI should bind to) — Phase 5 must coerce explicitly
 * at the mapper boundary or the wire type will silently change from number
 * to string once real persistence lands.
 */
export class AnswerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  user_id: string;

  @ApiProperty({
    type: 'integer',
    example: 3,
    description: 'Denormalized for leaderboard SUM.',
  })
  game_id: number;

  @ApiProperty({ format: 'uuid' })
  game_question_id: string;

  @ApiProperty({ format: 'uuid' })
  selected_option_id: string;

  @ApiProperty({
    type: 'number',
    example: 1,
    description:
      'numeric(6,3) in Postgres; streak x partial-credit, finalized at resolution. invariant: awarded_points = round(base_gain * reward_multiplier).',
  })
  reward_multiplier: number;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    example: null,
    description:
      'NULL until resolved. Illustrative fixture shape this phase, not a real scoring result.',
  })
  awarded_points: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description:
      'NULL until resolved. Illustrative fixture shape this phase, not a real scoring result.',
  })
  successful_outcome: boolean | null;

  @ApiProperty({ example: '2026-07-18T15:01:07.000Z' })
  created_at: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  resolved_at: string | null;
}

/**
 * `{ items, total, limit, offset }` envelope for `GET /answers`.
 */
export class PaginatedAnswersResponseDto extends PaginatedResponseDto<AnswerResponseDto> {
  @ApiProperty({ type: () => AnswerResponseDto, isArray: true })
  items: AnswerResponseDto[];
}
