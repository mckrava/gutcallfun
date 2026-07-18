import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GameQuestionEntity } from '../../models/game/game-question.entity';
import { UserGameAnswerEntity } from '../../models/game/user-game-answer.entity';
import { QuestionState } from '../../models/game/enums';
import { LiveBroadcastEmitter } from './events/live-broadcast.emitter';

/**
 * Boot-time sweep of windows orphaned by a process restart (RESL-04).
 *
 * WHY THIS EXISTS — the failure it fixes was observed live during the
 * 2026-07-18 France–England match:
 *
 * A window's resolve timer lives only in memory, via `SchedulerRegistry` in
 * `QuestionResolutionService`. The `game_question` row, however, is durable.
 * Kill the process between open and resolve and the timer dies while the row
 * survives in `state='open'` forever. `GOAL_CONFIRM_GRACE_MS`, the hard cap
 * that protects against a window hanging open, is itself an in-process timer
 * and dies with everything else — it cannot help here.
 *
 * That single orphan then silently stops the ENTIRE question loop for its
 * game: `uq_gq_one_open_per_game` is a partial unique index on
 * `game_question(game_id) WHERE state='open'`, so no new window can ever be
 * inserted. Observed impact: 11 minutes with a healthy feed (383 events, 2s
 * fresh) and zero new questions. This is the worst failure mode in the live
 * loop precisely because nothing looks broken — ingest, WS and REST all stay
 * green while the product silently stops working.
 *
 * WHY VOID RATHER THAN RESOLVE — RESL-04's locked void policy names
 * "server restart with unrecovered hole" as a void condition explicitly. The
 * in-memory high-water accumulation for an orphaned window is gone, so the
 * rung it had reached is genuinely unknown; resolving it would mean inventing
 * an outcome and awarding points on fabricated information. Refunding is the
 * locked behavior AND the honest one.
 *
 * A restart therefore costs one in-flight window per live game. That is the
 * correct trade: RESL-04 requires refunding on incomplete information.
 *
 * SCOPE — this covers the restart arm of RESL-04 only. The other arms (seq
 * gap, reconnect, `suspend`/`disconnected`) still have no implementation; the
 * 02/D-13 `GameStreamGapDetected` seam and its log-only listener remain the
 * place they belong. See
 * `.planning/todos/pending/phase-04-live-loop-shipped-ahead-of-plan.md`.
 */
@Injectable()
export class OrphanedWindowSweeper implements OnModuleInit {
  private readonly logger = new Logger(OrphanedWindowSweeper.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly broadcast: LiveBroadcastEmitter,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.sweep();
    } catch (err) {
      // Never block boot on this. A failed sweep leaves the orphan in place —
      // degraded, but the operator can clear it by hand; a thrown error here
      // would take the whole app down and stop ingest too.
      this.logger.error('Orphaned-window sweep failed; continuing boot', err as Error);
    }
  }

  private async sweep(): Promise<void> {
    const voidedAt = new Date();

    const swept = await this.dataSource.transaction(async (manager) => {
      // Lock the orphans so a concurrently-booting second process (or a
      // resolve racing in) cannot double-void or resurrect them.
      const orphans = await manager
        .createQueryBuilder(GameQuestionEntity, 'q')
        .setLock('pessimistic_write')
        .where('q.state IN (:...states)', {
          states: [QuestionState.OPEN, QuestionState.PENDING_CONFIRMATION],
        })
        .getMany();

      if (orphans.length === 0) return [];

      const ids = orphans.map((q) => q.id);

      // Refund, do not grade: `successful_outcome` stays NULL because no
      // resolution happened. `awarded_points` becomes 0 rather than NULL so
      // the answer is terminal and never shows as perpetually pending.
      await manager
        .createQueryBuilder()
        .update(UserGameAnswerEntity)
        .set({ awardedPoints: 0, resolvedAt: voidedAt })
        .where('game_question_id IN (:...ids)', { ids })
        .andWhere('awarded_points IS NULL')
        .execute();

      await manager
        .createQueryBuilder()
        .update(GameQuestionEntity)
        .set({ state: QuestionState.VOIDED, resolvedAt: voidedAt })
        .where('id IN (:...ids)', { ids })
        .execute();

      return orphans;
    });

    if (swept.length === 0) {
      this.logger.log('Orphaned-window sweep: none found');
      return;
    }

    for (const q of swept) {
      this.logger.warn(
        `Voided orphaned window ${q.id} (game ${q.gameId}, was '${q.state}', opened ${q.createdAt.toISOString()}) — ` +
          'no in-memory timer survived the restart. Answers refunded.',
      );

      // Emitted for correctness and for any client that reconnects fast enough
      // to still be in the room. At boot there is normally no subscriber, so
      // this is usually a no-op — that is fine and intentional.
      this.broadcast.emit({
        event: 'void',
        gameId: q.gameId,
        payload: {
          game_question_id: q.id,
          voided_at: voidedAt.toISOString(),
          reason: 'server_restart',
          is_mock: false,
        },
      });
    }

    this.logger.warn(
      `Orphaned-window sweep voided ${swept.length} window(s). Their games can open new windows again.`,
    );
  }
}
