/**
 * SourceSchedulerService — the single is_replay source-switch scheduler
 * (D-02, D-06, RPLY-02, RPLY-03).
 *
 * Every ~15s tick: find games where status='scheduled' AND starts_at<=now(),
 * and start each one's source — is_replay=false -> StreamManagerService.start
 * (SSE), is_replay=true -> ReplayStarterService.start (replay emitter) — then
 * transition status to 'live' so a second tick never re-dispatches the same
 * game. This is the ONLY place is_replay is read to decide a source (D-02
 * one-scheduler rule spanning both SSE and replay) — everything downstream of
 * start() (normalizer, persistence, state machine) is replay-unaware.
 *
 * This single rule is also what makes the manual DB flip (UPDATE
 * is_replay=true, status='scheduled', starts_at=now()+~3min on an existing
 * past-game row) the working demo control surface (D-06/D-08) — no separate
 * code path exists for "arm via script" vs "arm via manual DB edit".
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameStatus } from '../../../models/game/enums';
import { StreamManagerService } from '../stream/stream-manager.service';
import { ReplayStarterService } from '../replay/replay-starter.service';

@Injectable()
export class SourceSchedulerService {
  private readonly logger = new Logger(SourceSchedulerService.name);

  constructor(
    @InjectRepository(GameEntity) private readonly gameRepo: Repository<GameEntity>,
    private readonly streamManager: StreamManagerService,
    private readonly replayStarter: ReplayStarterService,
  ) {}

  @Cron('*/15 * * * * *') // 6-field cron, seconds granularity (RESEARCH Pattern 5)
  async dispatchDueGames(): Promise<void> {
    const dueGames = await this.gameRepo.find({
      where: {
        status: GameStatus.SCHEDULED,
        startsAt: LessThanOrEqual(new Date()),
      },
    });

    for (const game of dueGames) {
      await this.startGame(game);
    }
  }

  /**
   * Atomically claim `game` (status='scheduled' -> 'live') BEFORE starting
   * its source. The conditional WHERE (id AND status='scheduled') guards
   * against double-start of the same game: if an overlapping tick (or a
   * concurrent claim) already transitioned this row, `affected` is 0 and we
   * never call start() a second time for it. Only a successful claim starts
   * the source, so a claimed-but-failed-to-start game is never silently
   * left in 'live' with no source running — status only advances alongside
   * (or after a caught failure of) the actual start attempt below.
   */
  private async startGame(game: GameEntity): Promise<void> {
    const claim = await this.gameRepo
      .createQueryBuilder()
      .update(GameEntity)
      .set({ status: GameStatus.LIVE })
      .where('id = :id', { id: game.id })
      .andWhere('status = :status', { status: GameStatus.SCHEDULED })
      .execute();

    if (!claim.affected) {
      this.logger.debug(
        `SourceSchedulerService: game ${game.id} already claimed by another tick — skipping (double-start guard)`,
      );
      return;
    }

    try {
      if (game.isReplay) {
        // ReplayStarterService.start() only resolves once the ENTIRE replay
        // has finished emitting (it awaits emitReplay() to completion,
        // potentially the length of a full match at speed=1) — awaiting it
        // here would block this tick, and every OTHER due game still queued
        // in the same dispatchDueGames() loop, for that entire duration.
        // Fire-and-forget instead, mirroring how StreamManagerService.start()
        // is itself a synchronous, non-blocking kickoff (D-02: both source
        // starters return control to the scheduler immediately).
        this.replayStarter.start(game.id).catch((err: unknown) => {
          this.logger.error(
            `SourceSchedulerService: replay start failed for game ${game.id}`,
            err as Error,
          );
        });
      } else {
        this.streamManager.start(game.id);
      }
    } catch (err) {
      this.logger.error(
        `SourceSchedulerService: failed to start source for game ${game.id} (is_replay=${game.isReplay})`,
        err as Error,
      );
    }
  }
}
