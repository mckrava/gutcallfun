import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Note the snake_case body shape: the route sketch in CONTEXT.md showed
 * camelCase (`userId`, `gameQuestionId`, `selectedOptionId`); that sketch is
 * superseded here by the resolved snake_case-both-directions convention
 * (RESEARCH.md Pattern 1). Per D-02, `user_id` is supplied by the caller
 * and unverified this phase — Phase 3 replaces it with the session, and
 * Phase 4 adds real one-answer-per-question + expiry enforcement.
 */
export class CreateAnswerDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'PROVISIONAL: caller-supplied and unverified this phase (D-02). Phase 3 replaces this with the authenticated session.',
  })
  @IsUUID()
  user_id: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  game_question_id: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  selected_option_id: string;
}
