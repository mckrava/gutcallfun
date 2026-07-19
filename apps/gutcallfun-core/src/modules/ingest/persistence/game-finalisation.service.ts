import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameStatus } from '../../../models/game/enums';
import { LiveFeedEmitter } from '../../live/events/live-feed.emitter';
import { StreamManagerService } from '../stream/stream-manager.service';

/**
 * Terminal transition for a game: `game_finalised` -> status='finished' and
 * the SSE source is released (RESL-05).
 *
 * WHY THIS EXISTS — before this, NOTHING anywhere moved a game out of
 * status='live'. `fixtures-cron` sets status only on INSERT (it deliberately
 * excludes status from updates to avoid clobbering concurrent writers), and
 * `source-scheduler` only does scheduled -> live. A game therefore stayed
 * 'live' forever once started, and `GameStateRebuildService` re-opened a real
 * TxLINE stream for it on every subsequent boot — observed on game 20, which
 * sat 'live' for ~7h after full time and reconnected on each restart.
 *
 * MATCHING RULE — keyed on the ACTION, never on `StatusId === 100`. Verified
 * against the 20 recorded full matches in
 * `initial-request-src/txodds-api-snapshots`: `game_finalised` carries
 * `StatusId: 100` in 18 of 20 cases and `StatusId: null` in the other 2.
 * Matching on the status id would silently miss ~10% of matches — exactly the
 * bug this service exists to fix. The feed's own `GameState` field is likewise
 * unusable: it still reads "scheduled" on the finalisation record itself.
 *
 * TERMINALITY — `game_finalised` occurs exactly once per fixture and is
 * effectively last: across those 20 matches only `disconnected` (15x) and
 * `comment` (1x) ever followed it, at most 2 trailing records. It is safe to
 * treat as terminal and release the stream immediately.
 *
 * `current_status_id` is set to 100 explicitly rather than copied from the
 * event, resolving the open sub-decision in
 * `.planning/todos/pending/game-finalised-current-status-id.md` (option B:
 * denormalize 100 as a terminal sentinel). Copying the event's own StatusId
 * would leave the 2-in-20 null cases stale at whatever the last in-play status
 * was, which is the very staleness that todo was raised about.
 *
 * SCOPE — this is the ONLINE path only. A match that finishes while the
 * process is down is never seen and stays 'live' forever; that needs a
 * separate reconciliation pass (fixtures-discovery or staleness based) and is
 * NOT implemented here.
 */
@Injectable()
export class GameFinalisationService {
  private readonly logger = new Logger(GameFinalisationService.name);

  constructor(
    @InjectRepository(GameEntity)
    private readonly gameRepo: Repository<GameEntity>,
    private readonly feed: LiveFeedEmitter,
    private readonly streamManager: StreamManagerService,
  ) {
    this.feed.on((message) => {
      if (message.type !== 'game_finalised') return;
      void this.finalise(message.gameId).catch((err: unknown) => {
        // Never let finalisation failure propagate into the ingest pipeline.
        this.logger.error(
          `Game ${message.gameId}: finalisation failed`,
          err as Error,
        );
      });
    });
  }

  private async finalise(gameId: number): Promise<void> {
    // Conditional on status='live' so a duplicate/replayed game_finalised is a
    // no-op rather than a second stream stop and a second log line.
    const result = await this.gameRepo
      .createQueryBuilder()
      .update(GameEntity)
      .set({
        status: GameStatus.FINISHED,
        currentStatusId: 100,
      })
      .where('id = :gameId', { gameId })
      .andWhere('status = :live', { live: GameStatus.LIVE })
      .execute();

    if (!result.affected) {
      this.logger.debug(
        `Game ${gameId}: game_finalised ignored — not in 'live' state (already finalised?)`,
      );
      return;
    }

    this.logger.log(
      `Game ${gameId}: finalised — status='finished', current_status_id=100, releasing stream`,
    );

    // Release the SSE source. Guarded because a stop failure must not leave the
    // row un-finalised: the DB write above has already committed, which is the
    // part that matters for correctness on the next boot.
    try {
      this.streamManager.stop(gameId);
    } catch (err) {
      this.logger.error(
        `Game ${gameId}: finalised in DB but stream stop failed`,
        err as Error,
      );
    }
  }
}
