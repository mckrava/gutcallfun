import { ApiProperty } from '@nestjs/swagger';

/**
 * Mirrors `game_question_outcome` — the four static, LOCKED reference rows
 * (fizzles/danger/shot/goal, CLAUDE.md "Game economy"). Lets the UI label
 * outcomes from the API instead of hardcoding the four strings.
 */
export class QuestionOutcomeResponseDto {
  @ApiProperty({ example: 'shot', enum: ['fizzles', 'danger', 'shot', 'goal'] })
  key: string;

  @ApiProperty({
    example: 'Shot taken',
    description: 'Editable display label.',
  })
  content: string;

  @ApiProperty({
    type: 'integer',
    example: 3,
    description: 'Adjacency position for partial credit: |pos_a - pos_b| = 1.',
  })
  ladder_position: number;
}
