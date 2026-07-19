import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GameQuestionEntity } from '../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../models/game/game-question-option.entity';
import { QuestionState } from '../../models/game/enums';
import { GameStateRegistry } from '../ingest/state/game-state.registry';
import { MatchClockDto } from '../realtime/dto/match-clock.dto';
import { SnapshotDto } from '../realtime/dto/snapshot.dto';
import { LiveWindowRegistry } from './live-window.registry';
import { toQuestionResponseDto } from './live-payload.mapper';

/**
 * Builds the real `snapshot` a client receives on `subscribe`.
 *
 * Every field is now sourced from live state rather than fixtures: score and
 * possession stage from the in-memory `GameState` the ingest state machine
 * maintains, the clock from the feed's own `Clock` reading, and
 * `active_question` from the actual open `game_question` row (with its four
 * stored options) — so a client joining mid-window immediately sees the
 * prediction card everyone else is already answering.
 */
@Injectable()
export class LiveStateService {
  private readonly logger = new Logger(LiveStateService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly gameStates: GameStateRegistry,
    private readonly windows: LiveWindowRegistry,
  ) {}

  async buildSnapshot(gameId: number): Promise<SnapshotDto> {
    const state = this.gameStates.get(gameId);

    return {
      game_id: gameId,
      score_p1: state?.score1 ?? 0,
      score_p2: state?.score2 ?? 0,
      possession_stage: state?.possessionStage ?? null,
      clock: this.buildClock(gameId),
      active_question: await this.findActiveQuestion(gameId),
      // Real data now — the synthetic cycle is gone.
      is_mock: false,
    };
  }

  /**
   * `GameState` still has no `periodStartedFeedTs` anchor (the D-07 gap noted
   * on MatchClockDto). Rather than emit a fixed placeholder, the anchor is
   * reconstructed from the feed's own `Clock.Seconds` reading, which is a real
   * per-period elapsed count: anchor = lastFeedTs - elapsed. That keeps
   * `elapsed_ms` truthful and still lets the client tick locally between
   * events, which is the whole reason the anchor is on the wire.
   */
  private buildClock(gameId: number): MatchClockDto {
    const state = this.gameStates.get(gameId);
    const lastFeedTs = state?.lastFeedTs ?? null;
    const clockSeconds = this.windows.getClockSeconds(gameId);

    const elapsedMs =
      clockSeconds === null ? null : Math.round(clockSeconds * 1_000);
    const periodStartedMs =
      lastFeedTs === null || elapsedMs === null ? null : lastFeedTs - elapsedMs;

    return {
      current_status_id: state?.currentStatusId ?? null,
      last_feed_ts:
        lastFeedTs === null ? null : new Date(lastFeedTs).toISOString(),
      period_started_feed_ts:
        periodStartedMs === null
          ? null
          : new Date(periodStartedMs).toISOString(),
      elapsed_ms: elapsedMs,
    };
  }

  /** The currently open question for this game, or null. Always an explicit null, never an omitted key (WS-02). */
  private async findActiveQuestion(
    gameId: number,
  ): Promise<SnapshotDto['active_question']> {
    try {
      const question = await this.dataSource
        .getRepository(GameQuestionEntity)
        .findOneBy({
          gameId,
          state: QuestionState.OPEN,
        });
      if (question === null) return null;

      const options = await this.dataSource
        .getRepository(GameQuestionOptionEntity)
        .findBy({ gameQuestionId: question.id });

      return toQuestionResponseDto(question, options);
    } catch (err) {
      // A snapshot that is missing its active question is far better than a
      // subscribe that fails outright.
      this.logger.error(
        `Game ${gameId}: failed to load active question`,
        err as Error,
      );
      return null;
    }
  }
}
