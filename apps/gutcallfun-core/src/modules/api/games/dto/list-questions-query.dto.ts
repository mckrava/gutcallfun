import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

const QUESTION_STATE_VALUES = [
  'open',
  'pending_confirmation',
  'resolved',
  'voided',
] as const;

export class ListQuestionsQueryDto {
  @ApiPropertyOptional({
    enum: QUESTION_STATE_VALUES,
    description: 'Filter by exact question_state.',
  })
  @IsOptional()
  @IsIn(QUESTION_STATE_VALUES)
  state?: string;
}
