import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameQuestionEntity } from '../../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../../models/game/game-question-option.entity';
import { UserGameAnswerEntity } from '../../../models/game/user-game-answer.entity';
import {
  AnswerResponseDto,
  PaginatedAnswersResponseDto,
} from './dto/answer-response.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { ListAnswersQueryDto } from './dto/list-answers-query.dto';

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

const isUniqueViolation = (err: unknown): boolean => pgErrorOf(err).code === '23505';
const isForeignKeyViolation = (err: unknown): boolean => pgErrorOf(err).code === '23503';

/** timestamptz columns arrive as Date from pg; the wire contract is an ISO string. */
const toIso = (value: Date | string | null | undefined): string | null =>
  value == null ? null : new Date(value).toISOString();

@Injectable()
export class AnswersService {
  private readonly logger = new Logger(AnswersService.name);

  constructor(
    @InjectRepository(UserGameAnswerEntity)
    private readonly answersRepo: Repository<UserGameAnswerEntity>,
    @InjectRepository(GameQuestionEntity)
    private readonly questionsRepo: Repository<GameQuestionEntity>,
    @InjectRepository(GameQuestionOptionEntity)
    private readonly optionsRepo: Repository<GameQuestionOptionEntity>,
  ) {}

  /**
   * Records a pick against an open prediction window.
   *
   * Rejects, in order: unknown question (404), a window whose expires_at has
   * already passed (409), an option that belongs to a different question
   * (400), and a second answer from the same user to the same question (409,
   * backstopped by the uq_uga_user_question constraint for the race).
   *
   * awarded_points / successful_outcome / resolved_at stay NULL and
   * reward_multiplier is left at its default of 1 — the resolver owns scoring.
   */
  async create(dto: CreateAnswerDto): Promise<AnswerResponseDto> {
    const question = await this.questionsRepo.findOne({
      where: { id: dto.game_question_id },
    });
    if (!question) {
      throw new NotFoundException(`Question ${dto.game_question_id} not found`);
    }

    if (new Date(question.expiresAt).getTime() <= Date.now()) {
      throw new ConflictException(
        `The answer window for question ${question.id} has closed`,
      );
    }

    const option = await this.optionsRepo.findOne({
      where: { id: dto.selected_option_id },
    });
    if (!option || option.gameQuestionId !== question.id) {
      throw new BadRequestException(
        `Option ${dto.selected_option_id} does not belong to question ${question.id}`,
      );
    }

    const existing = await this.answersRepo.findOne({
      where: { userId: dto.user_id, gameQuestionId: question.id },
    });
    if (existing) {
      throw new ConflictException(
        `User ${dto.user_id} has already answered question ${question.id}`,
      );
    }

    let insertedId: string;
    try {
      const result = await this.answersRepo.insert({
        userId: dto.user_id,
        // game_id is denormalized onto user_game_answer for the leaderboard
        // SUM (idx_uga_leaderboard); it is derived from the question row, not
        // taken from the request body.
        gameId: question.gameId,
        gameQuestionId: question.id,
        selectedOptionId: option.id,
        rewardMultiplier: '1',
      });
      insertedId = result.identifiers[0].id as string;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `User ${dto.user_id} has already answered question ${question.id}`,
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(`User ${dto.user_id} not found`);
      }
      throw err;
    }

    const row = await this.answersRepo.findOne({ where: { id: insertedId } });
    if (!row) {
      throw new NotFoundException(`Answer ${insertedId} could not be read back`);
    }
    return this.toResponseDto(row);
  }

  async findAll(query: ListAnswersQueryDto): Promise<PaginatedAnswersResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.answersRepo.createQueryBuilder('a');

    if (query.user_id) {
      qb.andWhere('a.userId = :userId', { userId: query.user_id });
    }
    if (query.game_id !== undefined) {
      qb.andWhere('a.gameId = :gameId', { gameId: query.game_id });
    }

    qb.orderBy('a.createdAt', 'ASC').addOrderBy('a.id', 'ASC').skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((row) => this.toResponseDto(row)),
      total,
      limit,
      offset,
    };
  }

  private toResponseDto(answer: UserGameAnswerEntity): AnswerResponseDto {
    return {
      id: answer.id,
      user_id: answer.userId,
      game_id: answer.gameId,
      game_question_id: answer.gameQuestionId,
      selected_option_id: answer.selectedOptionId,
      // reward_multiplier is numeric(6,3) — the pg driver returns it as a
      // string. Coerce, or the wire type silently flips from number to string.
      reward_multiplier: Number(answer.rewardMultiplier),
      awarded_points: answer.awardedPoints ?? null,
      successful_outcome: answer.successfulOutcome ?? null,
      created_at: toIso(answer.createdAt) as string,
      resolved_at: toIso(answer.resolvedAt),
    };
  }
}
