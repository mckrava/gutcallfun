import { ApiProperty } from '@nestjs/swagger';

/**
 * Mirrors `game_question_option`. `base_gain` is one of the four LOCKED,
 * calibrated point values (5, 7, 15, 100) — calibrated on a 1,708-sample
 * corpus and never recalibrated or invented here (project-wide constraint,
 * see CLAUDE.md "Game economy"). `base_gain` is frozen per question
 * instance; it deliberately lives on the option row, not the lookup table,
 * so a future recalibration never rewrites the price of an already-asked
 * question.
 */
export class QuestionOptionResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000101',
  })
  id: string;

  @ApiProperty({
    format: 'uuid',
    example: '00000000-0000-4000-8000-0000000000f1',
  })
  game_question_id: string;

  @ApiProperty({
    example: 'shot',
    enum: ['fizzles', 'danger', 'shot', 'goal'],
    description: 'FK -> game_question_outcome.key.',
  })
  outcome_key: string;

  @ApiProperty({
    type: 'integer',
    enum: [5, 7, 15, 100],
    example: 15,
    description:
      'LOCKED, calibrated point value for this rung of the shot-based ladder. Never recalibrate.',
  })
  base_gain: number;

  @ApiProperty({
    type: 'integer',
    example: 3,
    description: 'Stable display ordering, 1-4.',
  })
  display_order: number;
}
