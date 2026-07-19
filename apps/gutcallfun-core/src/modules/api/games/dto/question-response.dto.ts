import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { QuestionOptionResponseDto } from './question-option-response.dto';

/**
 * Mirrors `game_question`, with an embedded `options` array of exactly four
 * `QuestionOptionResponseDto` entries — the prediction-card contract. Pairs
 * `@ValidateNested({ each: true })` with `@Type(() => QuestionOptionResponseDto)`:
 * without `@Type`, class-validator would validate a bare plain object and
 * every rule on the nested class would be silently skipped (RESEARCH.md
 * Pitfall 5).
 */
export class QuestionResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '00000000-0000-4000-8000-0000000000f1',
  })
  id: string;

  @ApiProperty({ type: 'integer', example: 3 })
  game_id: number;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: '00000000-0000-4000-8000-000000000005',
  })
  trigger_event_id: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, example: null })
  resolution_event_id: string | null;

  @ApiProperty({
    example: 'attack_outcome',
    enum: ['attack_outcome', 'static'],
  })
  question_type: string;

  @ApiProperty({ example: 'How far will this attack go?' })
  content: string;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    example: 1,
    description:
      'Attacking team (1 | 2) — attributes shots/goals to this window.',
  })
  participant: number | null;

  @ApiProperty({
    example: 'open',
    enum: ['open', 'pending_confirmation', 'resolved', 'voided'],
  })
  state: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: null,
    description:
      'Winning option; set at resolution. Null while open/pending/voided.',
  })
  resolved_option_id: string | null;

  @ApiProperty({ type: 'integer', example: 5, description: 'Seconds.' })
  answer_window_ttl: number;

  @ApiProperty({
    example: '2026-07-18T15:12:08.000Z',
    description:
      'Precomputed answer-lock timestamp — one comparison at read time.',
  })
  expires_at: string;

  @ApiProperty({ example: '2026-07-18T15:12:03.000Z' })
  created_at: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  resolved_at: string | null;

  @ApiProperty({
    type: () => QuestionOptionResponseDto,
    isArray: true,
    description:
      'Always exactly four entries: fizzles, danger, shot, goal — the LOCKED 5/7/15/100 ladder.',
  })
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionResponseDto)
  options: QuestionOptionResponseDto[];
}
