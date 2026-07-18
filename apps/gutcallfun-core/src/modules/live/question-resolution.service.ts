import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { GameQuestionEntity } from '../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../models/game/game-question-option.entity';
import { UserGameAnswerEntity } from '../../models/game/user-game-answer.entity';
import { QuestionState } from '../../models/game/enums';
import { LiveBroadcastEmitter } from './events/live-broadcast.emitter';
import { LiveWindowRegistry, OpenWindow } from './live-window.registry';
import {
  GOAL_CONFIRM_GRACE_MS,
  GOAL_CONFIRM_POLL_MS,
  RESOLVE_AFTER_MS,
  RESOLVE_TIMER_PREFIX,
  Rung,
  resolveTimerName,
} from './live.constants';

/** Correct pick. DEMO-SHORTCUT: simplifies RESL-01's finalized-at-resolution multiplier to a flat 1. */
const MULTIPLIER_CORRECT = 1;
/** Wrong pick. No adjacency partial credit — the exact value was never decided, so none is invented. */
const MULTIPLIER_WRONG = 0;

/**
 * Resolves a prediction window: picks the winning rung from the accumulated
 * high-water mark, awards points, and pushes the `resolution` event.
 *
 * TWO DIFFERENT DEADLINES (STAT-03), deliberately not the same thing:
 *  - `expires_at` (open + 5s, wall clock) is the ANSWER LOCK — after it, no
 *    further answers are accepted. Owned by the answers module.
 *  - RESOLVE_AFTER_MS (open + 12s, wall clock) is when the window RESOLVES —
 *    late enough to observe how the attack actually finished.
 *
 * DEMO-SHORTCUT: the flat 12s timer stands in for WNDW-03's real close rule
 * (soft terminals stamp `pendingCloseAt`; attacking-team pressure within 12s
 * cancels the stamp; expiry >=12s past the stamp finalises AT the stamp time).
 * The high-water accumulation the timer resolves against is faithful.
 *
 * ONE EXCEPTION to the flat 12s: a window that saw an unconfirmed goal defers
 * past 12s and polls until the goal confirms or is discarded, capped by
 * GOAL_CONFIRM_GRACE_MS. Every other window resolves at 12s exactly as before.
 */
@Injectable()
export class QuestionResolutionService implements OnModuleDestroy {
  private readonly logger = new Logger(QuestionResolutionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly scheduler: SchedulerRegistry,
    private readonly registry: LiveWindowRegistry,
    private readonly broadcast: LiveBroadcastEmitter,
  ) {}

  /**
   * Arms the resolution timer. Called once at window open with the default
   * delay, then re-armed with `GOAL_CONFIRM_POLL_MS` for each deferral poll.
   */
  scheduleResolve(
    gameId: number,
    questionId: string,
    delayMs = RESOLVE_AFTER_MS,
  ): void {
    const name = resolveTimerName(gameId, questionId);
    this.clearTimer(name);

    const timer = setTimeout(() => {
      this.clearTimer(name);
      // The timer callback is sync; the work is async. Attach an explicit
      // rejection handler so a failed resolution logs and stops there rather
      // than surfacing as an unhandled rejection.
      void this.resolve(gameId, questionId, 'timer').catch((err) =>
        this.logger.error(
          `Game ${gameId}: resolution timer failed for ${questionId}`,
          err as Error,
        ),
      );
    }, delayMs);

    // Mandated timer discipline: .unref() so a pending window never holds the
    // process (or a Jest worker) open, plus SchedulerRegistry registration so
    // the timer is named, introspectable, and swept on shutdown.
    timer.unref();
    this.scheduler.addTimeout(name, timer);
  }

  /**
   * The timer is the SINGLE resolution path. There is deliberately no
   * resolve-early-on-confirmed-goal shortcut: closing the window the instant a
   * goal confirms would race any `action_discarded` for that same goal and lock
   * in a retracted rung (observed paying out 100 points for a discarded goal in
   * an end-to-end run). Deriving the rung on demand at timer expiry keeps
   * discards authoritative for the window's full lifetime.
   *
   * Re-entrant: while a goal is awaiting confirmation this method defers and
   * re-arms itself every GOAL_CONFIRM_POLL_MS instead of resolving. See the
   * deferral block comment in the body.
   */
  private async resolve(
    gameId: number,
    questionId: string,
    reason: string,
  ): Promise<void> {
    const window = this.registry.get(gameId);
    if (window === undefined || window.questionId !== questionId) {
      // Already closed and evicted — nothing to do.
      return;
    }
    if (window.resolving) return;

    // ── Deferred resolution on an unconfirmed goal ───────────────────────
    //
    // WHY THIS EXISTS: the feed sends a goal as `Confirmed:false` first and
    // confirms it later — a ~76s median lag. The window resolves at a flat 12s,
    // so without deferral every goal-ending attack resolves as `shot` and the
    // 100-point rung, the headline of the whole game economy, could never fire.
    //
    // WHY NOT JUST PAY OUT THE UNCONFIRMED GOAL: because ~17.5% of goal
    // incidents are subsequently discarded. Paying optimistically would award
    // 100 points on roughly one in six goals that never happened, and clawing
    // those back is exactly the optimistic/instant-payout model REQUIREMENTS.md
    // lists under Out of Scope. Waiting is the only correct option: we defer
    // until the feed tells us the truth, then pay once.
    //
    // WHAT THIS IS: a deliberate PARTIAL step toward the locked RESL-02, not a
    // replacement for it.
    //
    // DEMO-SHORTCUT — how this still differs from RESL-02:
    //   1. There is no ~5-minute timeout adjudication that reconciles against
    //      the `Score` field of the latest events. This uses a flat
    //      GOAL_CONFIRM_GRACE_MS cap and then falls back to the non-goal rung,
    //      so a goal confirming after the cap is simply missed.
    //   2. The question's DB `state` does move to `pending_confirmation` (the
    //      enum value exists), but nothing else in the system treats that state
    //      as meaningful yet — no separate answer handling, no void path.
    //
    // NOTE ON THE DB BACKSTOP: `uq_gq_one_open_per_game` is a PARTIAL unique
    // index over `WHERE state = 'open'`, so stamping `pending_confirmation`
    // releases that row from the index. While deferred, the sole guard against a
    // second window opening for this game is the in-memory
    // `LiveWindowRegistry` entry, which stays present for the whole deferral —
    // the engine checks it before every open. Do not remove that check.
    const elapsedSinceOpen = Date.now() - window.openedAtWall;
    const pendingGoal = this.registry.hasPendingGoal(window);
    const capExceeded = elapsedSinceOpen >= GOAL_CONFIRM_GRACE_MS;

    if (pendingGoal && !capExceeded) {
      // Keep the window open and look again shortly. A confirm promotes the
      // rung to `goal`; a discard drops `hasPendingGoal` to false and the next
      // poll resolves to the highest remaining non-goal rung — both handled by
      // simply re-entering this method, since the rung is derived on demand.
      await this.markPendingConfirmation(window);
      this.scheduleResolve(gameId, questionId, GOAL_CONFIRM_POLL_MS);
      this.logger.debug(
        `Game ${gameId}: deferring ${questionId} — unconfirmed goal, ${Math.round(elapsedSinceOpen / 1000)}s since open`,
      );
      return;
    }

    window.resolving = true;

    // Past the cap with a goal STILL unresolved: never pay it out on hope.
    // Resolve to what is actually established and move on — a window that hangs
    // open forever would block every future question for this game.
    //
    // Both conditions are required. Gating on `capExceeded` alone would discard
    // a goal that confirmed legitimately near the cap boundary (`pendingGoal`
    // false, elapsed >= cap) and wrongly pay the non-goal rung.
    const forceNonGoal = pendingGoal && capExceeded;
    if (forceNonGoal) {
      this.logger.warn(
        `Game ${gameId}: goal on ${questionId} neither confirmed nor discarded within ${GOAL_CONFIRM_GRACE_MS}ms — resolving to highest non-goal rung`,
      );
    }

    const rung = forceNonGoal
      ? this.registry.currentRungExcludingGoal(window)
      : this.registry.currentRung(window);

    try {
      const result = await this.awardInTransaction(window, rung);
      if (result === null) {
        // The row was not in `open` state: another path already resolved it.
        // Idempotent no-op — never double-award, never double-push.
        this.logger.debug(
          `Game ${gameId}: question ${questionId} was already resolved — skipping`,
        );
        return;
      }

      this.broadcast.emit({
        event: 'resolution',
        gameId,
        payload: {
          game_question_id: questionId,
          resolved_option_id: result.winner.id,
          resolved_outcome_key: result.winner.outcomeKey,
          // The winning option's own frozen base_gain — the points a correct
          // pick earned. DEMO-SHORTCUT: this is a room-wide broadcast, so it
          // carries the correct-pick award rather than any one user's outcome
          // (matching the shape the mock cycle published). Per-user results
          // are on `user_game_answer`.
          awarded_points: result.winner.awardedPoints,
          successful_outcome: true,
          resolved_at: result.resolvedAt.toISOString(),
          is_mock: false,
        },
      });

      this.logger.log(
        `Game ${gameId}: resolved window ${questionId} -> ${rung} (${result.winner.awardedPoints} pts, ${result.correctCount} correct / ${result.wrongCount} wrong, via ${reason})`,
      );
    } catch (err) {
      this.logger.error(
        `Game ${gameId}: failed to resolve window ${questionId}`,
        err as Error,
      );
    } finally {
      this.registry.close(gameId);
    }
  }

  /**
   * ONE transaction: stamp the question, then award every answer for it.
   *
   * Idempotency is enforced twice, both at the SQL level so concurrent callers
   * cannot interleave past them:
   *  - the question update is guarded by `state = 'open'`; zero affected rows
   *    means somebody else got there first and this call aborts.
   *  - the answer updates are guarded by `awarded_points IS NULL`, so an
   *    already-awarded answer can never be paid twice.
   */
  private async awardInTransaction(
    window: OpenWindow,
    rung: Rung,
  ): Promise<{
    winner: { id: string; outcomeKey: Rung; awardedPoints: number };
    resolvedAt: Date;
    correctCount: number;
    wrongCount: number;
  } | null> {
    return this.dataSource.transaction(async (manager) => {
      const resolvedAt = new Date();

      // Read the winning option back from its STORED row: `base_gain` is
      // frozen per question instance and is never recomputed from the ladder.
      const winnerRow = await manager.findOneBy(GameQuestionOptionEntity, {
        gameQuestionId: window.questionId,
        outcomeKey: rung,
      });
      if (winnerRow === null) {
        throw new Error(
          `No stored option row for rung '${rung}' on question ${window.questionId}`,
        );
      }

      const questionUpdate = await manager
        .createQueryBuilder()
        .update(GameQuestionEntity)
        .set({
          state: QuestionState.RESOLVED,
          resolvedOptionId: winnerRow.id,
          resolvedAt,
          resolutionEventId: window.resolutionEventId,
        })
        // Accepts `pending_confirmation` as well as `open`: a deferred window
        // has already been stamped pending, and guarding on `open` alone would
        // make it permanently unresolvable. Still excludes `resolved`/`voided`,
        // so this remains the idempotency guard — a second caller finds zero
        // affected rows and aborts without double-awarding.
        .where('id = :id AND state IN (:...resolvable)', {
          id: window.questionId,
          resolvable: [QuestionState.OPEN, QuestionState.PENDING_CONFIRMATION],
        })
        .execute();

      if ((questionUpdate.affected ?? 0) === 0) return null;

      // RESL-01: awarded_points = round(base_gain * reward_multiplier).
      // A correct pick's selected option IS the winning option, so its own
      // frozen base_gain is winnerRow.baseGain. A wrong pick multiplies by 0,
      // making its own base_gain irrelevant to the product.
      const correctPoints = Math.round(winnerRow.baseGain * MULTIPLIER_CORRECT);
      const wrongPoints = Math.round(winnerRow.baseGain * MULTIPLIER_WRONG);

      const correctUpdate = await manager
        .createQueryBuilder()
        .update(UserGameAnswerEntity)
        .set({
          successfulOutcome: true,
          // numeric(6,3) — node-postgres round-trips numeric as a STRING, and
          // the entity types it as string accordingly. Never assign a number.
          rewardMultiplier: MULTIPLIER_CORRECT.toFixed(3),
          awardedPoints: correctPoints,
          resolvedAt,
        })
        .where(
          'game_question_id = :questionId AND selected_option_id = :winnerId AND awarded_points IS NULL',
          { questionId: window.questionId, winnerId: winnerRow.id },
        )
        .execute();

      const wrongUpdate = await manager
        .createQueryBuilder()
        .update(UserGameAnswerEntity)
        .set({
          successfulOutcome: false,
          rewardMultiplier: MULTIPLIER_WRONG.toFixed(3),
          awardedPoints: wrongPoints,
          resolvedAt,
        })
        .where(
          'game_question_id = :questionId AND selected_option_id != :winnerId AND awarded_points IS NULL',
          { questionId: window.questionId, winnerId: winnerRow.id },
        )
        .execute();

      // Deliberately NOT written here: `user_score_profile`. The leaderboard
      // (LDRB-01) is computed as SUM(awarded_points) grouped by user directly
      // from `user_game_answer`, so no denormalized total is required, and no
      // decision defines what those profile rows should contain.

      return {
        winner: {
          id: winnerRow.id,
          outcomeKey: winnerRow.outcomeKey as Rung,
          awardedPoints: correctPoints,
        },
        resolvedAt,
        correctCount: correctUpdate.affected ?? 0,
        wrongCount: wrongUpdate.affected ?? 0,
      };
    });
  }

  /**
   * Stamp the question `pending_confirmation` while it waits on a goal. Done at
   * most once per window, best-effort: if it fails the window simply stays
   * `open` and deferral still works, since deferral state itself lives in the
   * in-memory registry, not in this column.
   */
  private async markPendingConfirmation(window: OpenWindow): Promise<void> {
    if (window.deferred) return;
    window.deferred = true;

    try {
      await this.dataSource
        .createQueryBuilder()
        .update(GameQuestionEntity)
        .set({ state: QuestionState.PENDING_CONFIRMATION })
        .where('id = :id AND state = :open', {
          id: window.questionId,
          open: QuestionState.OPEN,
        })
        .execute();
    } catch (err) {
      this.logger.error(
        `Game ${window.gameId}: failed to stamp pending_confirmation on ${window.questionId} — deferral continues`,
        err as Error,
      );
    }
  }

  private clearTimer(name: string): void {
    // deleteTimeout throws on an unknown name — always probe first.
    if (this.scheduler.doesExist('timeout', name)) {
      this.scheduler.deleteTimeout(name);
    }
  }

  /**
   * Sweeps only THIS module's timers, matched by the `live-resolve:` name
   * prefix. Deliberately not a blanket sweep of every registered timeout:
   * other providers register their own, and tearing theirs down here would be
   * an invisible cross-module side effect.
   */
  onModuleDestroy(): void {
    for (const name of this.scheduler.getTimeouts()) {
      if (name.startsWith(`${RESOLVE_TIMER_PREFIX}:`)) {
        this.scheduler.deleteTimeout(name);
      }
    }
  }
}
