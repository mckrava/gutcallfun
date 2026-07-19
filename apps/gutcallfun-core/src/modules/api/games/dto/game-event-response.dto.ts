import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Mirrors the `game_event` table field-for-field, in snake_case. `payload`
 * is documented as a free-form object (not a typed schema) because the feed
 * action set is open — 26+ `type` values observed, more may appear.
 */
export class GameEventResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000001',
  })
  id: string;

  @ApiProperty({ type: 'integer', example: 3 })
  game_id: number;

  @ApiProperty({
    example: 'attack_possession',
    description: 'Feed Action — an open set, not an enum.',
  })
  type: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Full raw feed message (free-form — the action set is open, so this is not a typed schema).',
  })
  payload: Record<string, unknown>;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    example: 42,
    description: 'Feed Id — matches confirm/amend/discard actions.',
  })
  action_id: number | null;

  @ApiProperty({
    type: 'integer',
    example: 7,
    description: 'Feed Seq, per-fixture monotonic ordering.',
  })
  seq: number;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'Feed Confirmed — goals: false first, ~80s median to true.',
  })
  confirmed: boolean | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    example: 1,
    description: '1 | 2',
  })
  participant: number | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    example: 4,
    description: 'Raw feed StatusId — open set, not an enum.',
  })
  status_id: number | null;

  @ApiProperty({ example: '2026-07-18T15:12:03.000Z', description: 'Feed Ts.' })
  feed_ts: string;

  @ApiProperty({ example: '2026-07-18T15:12:03.120Z' })
  received_at: string;
}
