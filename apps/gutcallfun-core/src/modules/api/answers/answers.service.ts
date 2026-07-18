import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ANSWERS_FIXTURE } from '../../../mocks/fixtures/answers.fixtures';
import { GAME_QUESTIONS_FIXTURE } from '../../../mocks/fixtures/game-questions.fixtures';
import {
  AnswerResponseDto,
  PaginatedAnswersResponseDto,
} from './dto/answer-response.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { ListAnswersQueryDto } from './dto/list-answers-query.dto';

// Fixture-backed this phase (D-01/D-05) — no repository injection, no
// TypeORM import.
@Injectable()
export class AnswersService {
  private readonly logger = new Logger(AnswersService.name);

  // A freshly-submitted answer is genuinely unresolved: awarded_points,
  // successful_outcome and resolved_at are null, reward_multiplier is 1.
  // Per D-02, game_question_id -> game_id resolution and one-answer-per-
  // question enforcement are Phase 4 concerns; this phase echoes a shape.
  create(dto: CreateAnswerDto): AnswerResponseDto {
    this.logger.debug(
      `Mock answer create: user ${dto.user_id} -> question ${dto.game_question_id} (nothing persisted, D-05)`,
    );

    // game_id is denormalized on user_game_answer for the leaderboard SUM
    // (idx_uga_leaderboard). Resolved via the game_question fixture lookup
    // since CreateAnswerDto only carries game_question_id, matching what a
    // real INSERT ... SELECT would need to derive it from the same FK.
    const question = GAME_QUESTIONS_FIXTURE.find(
      (q) => q.id === dto.game_question_id,
    );

    return {
      id: randomUUID(),
      user_id: dto.user_id,
      game_id: question?.game_id ?? 0,
      game_question_id: dto.game_question_id,
      selected_option_id: dto.selected_option_id,
      reward_multiplier: 1,
      awarded_points: null,
      successful_outcome: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
    };
  }

  findAll(query: ListAnswersQueryDto): PaginatedAnswersResponseDto {
    let answers = [...ANSWERS_FIXTURE];

    if (query.user_id) {
      answers = answers.filter((a) => a.user_id === query.user_id);
    }
    if (query.game_id !== undefined) {
      answers = answers.filter((a) => a.game_id === query.game_id);
    }

    const total = answers.length;
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const items = answers.slice(offset, offset + limit);

    return { items, total, limit, offset };
  }
}
