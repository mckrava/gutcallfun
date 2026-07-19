import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { GameQuestionEntity } from '../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../models/game/game-question-option.entity';
import { QuestionState, QuestionType } from '../../models/game/enums';
import { LiveBroadcastEmitter } from './events/live-broadcast.emitter';
import { LiveWindowRegistry } from './live-window.registry';
import { QuestionResolutionService } from './question-resolution.service';
import { toQuestionMessageDto } from './live-payload.mapper';
import {
  ANSWER_WINDOW_TTL_SECONDS,
  LADDER,
  QUESTION_CONTENT,
  Rung,
} from './live.constants';

/** Postgres unique_violation. Raised by uq_gq_one_open_per_game when a second window races in. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Opens a prediction window: one `game_question` row plus exactly four
 * `game_question_option` rows, in ONE transaction, then pushes the `question`
 * event to the game's room.
 *
 * The four options copy the LOCKED 5/7/15/100 ladder into per-instance rows.
 * That copy is the whole point of the frozen-`base_gain` rule: the price of an
 * already-asked question can never move, even if the ladder table is ever
 * recalibrated later.
 */
@Injectable()
export class QuestionWindowService {
  private readonly logger = new Logger(QuestionWindowService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly registry: LiveWindowRegistry,
    private readonly resolution: QuestionResolutionService,
    private readonly broadcast: LiveBroadcastEmitter,
  ) {}

  /**
   * @param triggerEventId `game_event.id` of the message that opened this
   *   window (WNDW-01: `trigger_event_id` FKs the event log). Null when the
   *   triggering insert was an orIgnore no-op.
   * @param participant The attacking team (1 | 2) from the feed message.
   * @param seedRung The resolution high-water floor to seed (260719-m7e,
   *   LD-2), derived from the stage that triggered this open via
   *   `seedRungForStage`. Defaults to `'fizzles'` — load-bearing for the
   *   `maybeOpenFallback` caller (LD-5), which passes no stage and must keep
   *   seeding the unchanged floor.
   */
  async open(
    gameId: number,
    triggerEventId: string | null,
    participant: number | null,
    seedRung: Extract<Rung, 'fizzles' | 'danger'> = 'fizzles',
  ): Promise<void> {
    const openedAtWall = Date.now();
    // STAT-03: `expires_at` is the answer lock and is measured on the SERVER
    // WALL CLOCK — never from feed Ts. It is the sole authority for whether an
    // answer is accepted, and is a DIFFERENT deadline from when the window
    // resolves (see QuestionResolutionService).
    const expiresAt = new Date(
      openedAtWall + ANSWER_WINDOW_TTL_SECONDS * 1_000,
    );

    try {
      const opened = await this.dataSource.transaction(async (manager) => {
        const questionInsert = await manager
          .createQueryBuilder()
          .insert()
          .into(GameQuestionEntity)
          .values({
            gameId,
            triggerEventId,
            resolutionEventId: null,
            questionType: QuestionType.ATTACK_OUTCOME,
            content: QUESTION_CONTENT,
            participant,
            state: QuestionState.OPEN,
            resolvedOptionId: null,
            answerWindowTtl: ANSWER_WINDOW_TTL_SECONDS,
            expiresAt,
          })
          .execute();

        const questionId = questionInsert.identifiers[0]?.id as
          string | undefined;
        if (questionId === undefined) {
          throw new Error('game_question insert returned no id');
        }

        await manager
          .createQueryBuilder()
          .insert()
          .into(GameQuestionOptionEntity)
          .values(
            LADDER.map((rung) => ({
              gameQuestionId: questionId,
              outcomeKey: rung.outcomeKey,
              baseGain: rung.baseGain,
              displayOrder: rung.displayOrder,
            })),
          )
          .execute();

        // Read both back from the committed rows rather than trusting the
        // in-memory values — the DTO and the in-memory window must reflect
        // exactly what was persisted.
        const question = await manager.findOneByOrFail(GameQuestionEntity, {
          id: questionId,
        });
        const options = await manager.findBy(GameQuestionOptionEntity, {
          gameQuestionId: questionId,
        });

        return { question, options };
      });

      this.registry.open({
        questionId: opened.question.id,
        gameId,
        participant,
        openedAtWall,
        expiresAt: opened.question.expiresAt,
        options: opened.options.map((option) => ({
          id: option.id,
          outcomeKey: option.outcomeKey as Rung,
          baseGain: option.baseGain,
          displayOrder: option.displayOrder,
        })),
        possessionRung: seedRung,
        shotActionIds: new Set<number>(),
        goalSightings: new Map(),
        resolutionEventId: null,
        resolving: false,
        deferred: false,
      });

      this.resolution.scheduleResolve(gameId, opened.question.id);

      this.broadcast.emit({
        event: 'question',
        gameId,
        payload: toQuestionMessageDto(opened.question, opened.options),
      });

      this.logger.log(
        `Game ${gameId}: opened window ${opened.question.id} (participant ${participant ?? 'unknown'}), expires ${opened.question.expiresAt.toISOString()}`,
      );
    } catch (err) {
      if (this.isOneOpenPerGameViolation(err)) {
        // The DB partial unique index (uq_gq_one_open_per_game) is the
        // authoritative backstop for the one-open-window-per-game rule. Losing
        // this race is expected and benign — a window is already open, which is
        // the desired end state. Never let it reach the ingest pipeline.
        this.logger.warn(
          `Game ${gameId}: window open lost the race to uq_gq_one_open_per_game — a window is already open`,
        );
        return;
      }
      this.logger.error(
        `Game ${gameId}: failed to open prediction window`,
        err as Error,
      );
    }
  }

  private isOneOpenPerGameViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const driverError = err.driverError as { code?: string } | undefined;
    return driverError?.code === PG_UNIQUE_VIOLATION;
  }
}
