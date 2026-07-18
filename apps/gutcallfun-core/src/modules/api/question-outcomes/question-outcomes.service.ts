import { Injectable } from '@nestjs/common';
import { QUESTION_OUTCOMES_FIXTURE } from '../../../mocks/fixtures/question-outcomes.fixtures';
import { QuestionOutcomeResponseDto } from './dto/question-outcome-response.dto';

// Fixture-backed this phase (D-01/D-05) — no repository injection, no
// TypeORM import.
@Injectable()
export class QuestionOutcomesService {
  findAll(): QuestionOutcomeResponseDto[] {
    return [...QUESTION_OUTCOMES_FIXTURE].sort(
      (a, b) => a.ladder_position - b.ladder_position,
    );
  }
}
