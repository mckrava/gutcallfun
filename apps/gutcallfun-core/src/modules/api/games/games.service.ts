import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameQuestionEntity } from '../../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../../models/game/game-question-option.entity';
import { UserGameEntity } from '../../../models/game/user-game.entity';
import { GAME_EVENTS_FIXTURE } from '../../../mocks/fixtures/game-events.fixtures';
import { GameEventPageDto } from './dto/game-event-page.dto';
import {
  GameResponseDto,
  PaginatedGamesResponseDto,
} from './dto/game-response.dto';
import { ListGameEventsQueryDto } from './dto/list-game-events-query.dto';
import { ListGamesQueryDto } from './dto/list-games-query.dto';
import { ListQuestionsQueryDto } from './dto/list-questions-query.dto';
import { QuestionOptionResponseDto } from './dto/question-option-response.dto';
import { QuestionResponseDto } from './dto/question-response.dto';
import { UserGameResponseDto } from './dto/user-game-response.dto';

function pgErrorOf(err: unknown): { code?: string; constraint?: string } {
  const e = err as
    | {
        code?: string;
        constraint?: string;
        driverError?: { code?: string; constraint?: string };
      }
    | null
    | undefined;
  return {
    code: e?.driverError?.code ?? e?.code,
    constraint: e?.driverError?.constraint ?? e?.constraint,
  };
}

const isUniqueViolation = (err: unknown): boolean =>
  pgErrorOf(err).code === '23505';
const isForeignKeyViolation = (err: unknown): boolean =>
  pgErrorOf(err).code === '23503';

/** timestamptz columns arrive as Date from pg; the wire contract is an ISO string. */
const toIso = (value: Date | string | null | undefined): string | null =>
  value == null ? null : new Date(value).toISOString();

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    @InjectRepository(GameEntity)
    private readonly gamesRepo: Repository<GameEntity>,
    @InjectRepository(UserGameEntity)
    private readonly userGamesRepo: Repository<UserGameEntity>,
    @InjectRepository(GameQuestionEntity)
    private readonly questionsRepo: Repository<GameQuestionEntity>,
    @InjectRepository(GameQuestionOptionEntity)
    private readonly optionsRepo: Repository<GameQuestionOptionEntity>,
  ) {}

  async findAll(query: ListGamesQueryDto): Promise<PaginatedGamesResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.gamesRepo.createQueryBuilder('g');

    if (query.status) {
      // Explicit cast: `status` is the game_status enum, and an untyped bind
      // parameter would leave PG to infer the comparison operand type.
      qb.andWhere('g.status = CAST(:status AS game_status)', {
        status: query.status,
      });
    }
    if (query.user_id) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM user_game ug WHERE ug.game_id = g.id AND ug.user_id = :userId)',
        { userId: query.user_id },
      );
    }

    // starts_at ascending then id ascending, matching the previous ordering
    // contract. NULLS FIRST keeps unscheduled games where they used to sort.
    qb.orderBy('g.startsAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('g.id', 'ASC')
      .skip(offset)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((row) => this.toGameDto(row)),
      total,
      limit,
      offset,
    };
  }

  async findOne(gameId: number): Promise<GameResponseDto> {
    return this.toGameDto(await this.findGameOrThrow(gameId));
  }

  /**
   * Still fixture-backed: the game_event read model is owned by the ingest /
   * live pipeline, not this plan. A game with no matching fixture rows yields
   * an empty page, never a 404.
   */
  async findEvents(
    gameId: number,
    query: ListGameEventsQueryDto,
  ): Promise<GameEventPageDto> {
    await this.findGameOrThrow(gameId);

    const afterSeq = query.after_seq ?? 0;
    const limit = query.limit ?? 20;
    const allEventsForGame = GAME_EVENTS_FIXTURE.filter(
      (event) => event.game_id === gameId,
    ).sort((a, b) => a.seq - b.seq);
    const eligible = allEventsForGame.filter((event) => event.seq > afterSeq);
    const items = eligible.slice(0, limit);

    const reachedEndOfLog = items.length === eligible.length;
    const lastItem = items[items.length - 1];
    const next_seq = reachedEndOfLog ? null : (lastItem?.seq ?? null);

    return { items, next_seq };
  }

  async findQuestions(
    gameId: number,
    query: ListQuestionsQueryDto,
  ): Promise<QuestionResponseDto[]> {
    await this.findGameOrThrow(gameId);

    const qb = this.questionsRepo
      .createQueryBuilder('q')
      .where('q.gameId = :gameId', { gameId });

    if (query.state) {
      qb.andWhere('q.state = CAST(:state AS question_state)', {
        state: query.state,
      });
    }

    const questions = await qb
      .orderBy('q.createdAt', 'ASC')
      .addOrderBy('q.id', 'ASC')
      .getMany();

    if (questions.length === 0) return [];

    // GameQuestionEntity declares no OneToMany to its options (the relation is
    // only modelled from the option side) and src/models is off-limits, so the
    // options are fetched in one batched second query and grouped in memory
    // rather than via leftJoinAndSelect.
    const options = await this.optionsRepo.find({
      where: { gameQuestionId: In(questions.map((q) => q.id)) },
      order: { displayOrder: 'ASC' },
    });

    const optionsByQuestion = new Map<string, QuestionOptionResponseDto[]>();
    for (const option of options) {
      const bucket = optionsByQuestion.get(option.gameQuestionId) ?? [];
      bucket.push(this.toOptionDto(option));
      optionsByQuestion.set(option.gameQuestionId, bucket);
    }

    return questions.map((question) => ({
      id: question.id,
      game_id: question.gameId,
      trigger_event_id: question.triggerEventId ?? null,
      resolution_event_id: question.resolutionEventId ?? null,
      question_type: question.questionType,
      content: question.content,
      participant: question.participant ?? null,
      state: question.state,
      resolved_option_id: question.resolvedOptionId ?? null,
      answer_window_ttl: question.answerWindowTtl,
      expires_at: toIso(question.expiresAt) as string,
      created_at: toIso(question.createdAt) as string,
      resolved_at: toIso(question.resolvedAt),
      options: optionsByQuestion.get(question.id) ?? [],
    }));
  }

  /**
   * Idempotent by design: joining a game twice returns the existing
   * user_game row instead of erroring, so the demo UI can call join on every
   * page load without special-casing.
   */
  async join(
    gameId: number,
    userId: string,
    squadId: number | null,
  ): Promise<UserGameResponseDto> {
    await this.findGameOrThrow(gameId);

    const existing = await this.userGamesRepo.findOne({
      where: { gameId, userId },
    });
    if (existing) {
      return this.toUserGameDto(existing);
    }

    try {
      await this.userGamesRepo.insert({
        gameId,
        userId,
        squadId: squadId ?? null,
      });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        // The only caller-supplied FK is user_id — game_id was validated above.
        throw new NotFoundException(`User ${userId} not found`);
      }
      if (!isUniqueViolation(err)) throw err;
      // Lost a race with a concurrent join; fall through and re-read.
    }

    const row = await this.userGamesRepo.findOne({
      where: { gameId, userId },
    });
    if (!row) {
      throw new NotFoundException(
        `Join for user ${userId} on game ${gameId} could not be read back`,
      );
    }
    return this.toUserGameDto(row);
  }

  private async findGameOrThrow(gameId: number): Promise<GameEntity> {
    const game = await this.gamesRepo.findOne({ where: { id: gameId } });
    if (!game) {
      throw new NotFoundException(`Game ${gameId} not found`);
    }
    return game;
  }

  private toGameDto(game: GameEntity): GameResponseDto {
    return {
      id: game.id,
      fixture_id: game.fixtureId,
      status: game.status,
      starts_at: toIso(game.startsAt),
      participant1_id: game.participant1Id ?? null,
      participant2_id: game.participant2Id ?? null,
      participant1_is_home: game.participant1IsHome,
      team1_name: game.team1Name ?? null,
      team2_name: game.team2Name ?? null,
      competition: game.competition ?? null,
      fixture_group_id: game.fixtureGroupId ?? null,
      team1_jersey_color: game.team1JerseyColor ?? null,
      team2_jersey_color: game.team2JerseyColor ?? null,
      current_status_id: game.currentStatusId ?? null,
      score_p1: game.scoreP1,
      score_p2: game.scoreP2,
      is_replay: game.isReplay,
      created_at: toIso(game.createdAt) as string,
      updated_at: toIso(game.updatedAt),
    };
  }

  private toOptionDto(
    option: GameQuestionOptionEntity,
  ): QuestionOptionResponseDto {
    return {
      id: option.id,
      game_question_id: option.gameQuestionId,
      outcome_key: option.outcomeKey,
      // base_gain is read straight off the row — the 5/7/15/100 ladder is
      // frozen per question instance and is never recomputed here.
      base_gain: option.baseGain,
      display_order: option.displayOrder,
    };
  }

  private toUserGameDto(userGame: UserGameEntity): UserGameResponseDto {
    return {
      game_id: userGame.gameId,
      user_id: userGame.userId,
      squad_id: userGame.squadId ?? null,
      joined_at: toIso(userGame.joinedAt) as string,
    };
  }
}
