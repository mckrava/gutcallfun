import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GAME_EVENTS_FIXTURE } from '../../../mocks/fixtures/game-events.fixtures';
import { GAME_QUESTIONS_FIXTURE } from '../../../mocks/fixtures/game-questions.fixtures';
import {
  GAMES_FIXTURE,
  USER_GAMES_FIXTURE,
} from '../../../mocks/fixtures/games.fixtures';
import { GameEventPageDto } from './dto/game-event-page.dto';
import {
  GameResponseDto,
  PaginatedGamesResponseDto,
} from './dto/game-response.dto';
import { JoinGameDto } from './dto/join-game.dto';
import { ListGameEventsQueryDto } from './dto/list-game-events-query.dto';
import { ListGamesQueryDto } from './dto/list-games-query.dto';
import { ListQuestionsQueryDto } from './dto/list-questions-query.dto';
import { QuestionResponseDto } from './dto/question-response.dto';
import { UserGameResponseDto } from './dto/user-game-response.dto';

/**
 * Fixture-backed this phase (D-01/D-05) — no repository injection, no
 * TypeORM import. Phase 5 rewrites the method bodies to query Postgres; the
 * controller/routes/DTOs stay identical.
 */
@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  findAll(query: ListGamesQueryDto): PaginatedGamesResponseDto {
    let games = [...GAMES_FIXTURE];

    if (query.status) {
      games = games.filter((game) => game.status === query.status);
    }

    if (query.user_id) {
      const joinedGameIds = new Set(
        USER_GAMES_FIXTURE.filter((ug) => ug.user_id === query.user_id).map(
          (ug) => ug.game_id,
        ),
      );
      games = games.filter((game) => joinedGameIds.has(game.id));
    }

    // Stable comparator: starts_at ascending, then id ascending (D-04 — two
    // consecutive identical requests must return byte-identical bodies).
    games.sort((a, b) => {
      const aTime = a.starts_at ? Date.parse(a.starts_at) : 0;
      const bTime = b.starts_at ? Date.parse(b.starts_at) : 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.id - b.id;
    });

    const total = games.length;
    // Defensive defaults: the global ValidationPipe (transform: true)
    // applies the class defaults for real requests, but unit tests call
    // this service directly with plain objects (e.g. `findAll({})`), which
    // bypass class instantiation — so `limit`/`offset` must be defaulted
    // here too, not only via the DTO's field initializers.
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const items = games.slice(offset, offset + limit);

    return { items, total, limit, offset };
  }

  findOne(gameId: number): GameResponseDto {
    const game = GAMES_FIXTURE.find((g) => g.id === gameId);
    if (!game) {
      throw new NotFoundException(`Game ${gameId} not found`);
    }
    return game;
  }

  findEvents(gameId: number, query: ListGameEventsQueryDto): GameEventPageDto {
    // Resolve the game first — a non-existent game_id is a 404, not an
    // empty page (API-02: structured, meaningful errors).
    this.findOne(gameId);

    const afterSeq = query.after_seq ?? 0;
    const limit = query.limit ?? 20;
    const allEventsForGame = GAME_EVENTS_FIXTURE.filter(
      (event) => event.game_id === gameId,
    ).sort((a, b) => a.seq - b.seq);
    const eligible = allEventsForGame.filter((event) => event.seq > afterSeq);
    const items = eligible.slice(0, limit);

    // An after_seq beyond the highest seq in the log is the normal "caught
    // up" state a polling client hits constantly — HTTP 200, empty items,
    // next_seq null. Never a 404.
    const reachedEndOfLog = items.length === eligible.length;
    const lastItem = items[items.length - 1];
    const next_seq = reachedEndOfLog ? null : (lastItem?.seq ?? null);

    return { items, next_seq };
  }

  findQuestions(
    gameId: number,
    query: ListQuestionsQueryDto,
  ): QuestionResponseDto[] {
    this.findOne(gameId);

    let questions = GAME_QUESTIONS_FIXTURE.filter(
      (question) => question.game_id === gameId,
    );
    if (query.state) {
      questions = questions.filter(
        (question) => question.state === query.state,
      );
    }

    return questions.map((question) => ({
      ...question,
      options: [...question.options].sort(
        (a, b) => a.display_order - b.display_order,
      ),
    }));
  }

  // Nothing is persisted this phase (D-05); the shape is the deliverable.
  // GAME-03's join-twice question (idempotent 200 vs 409 vs upsert) is
  // explicitly UNRESOLVED and deferred to Phase 5 — see PLAN.md
  // flagged_assumptions. This mock returns the shape unconditionally.
  join(gameId: number, dto: JoinGameDto): UserGameResponseDto {
    this.findOne(gameId);
    this.logger.debug(
      `Mock join: user ${dto.user_id} -> game ${gameId} (nothing persisted, D-05)`,
    );

    return {
      game_id: gameId,
      user_id: dto.user_id,
      squad_id: dto.squad_id ?? null,
      joined_at: '2026-07-18T16:00:00.000Z',
    };
  }
}
