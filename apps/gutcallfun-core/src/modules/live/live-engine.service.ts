import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { classifyPossession } from '../ingest/state/possession';
import { classifyGoalEvent } from '../ingest/state/goals';
import { LiveBroadcastEmitter } from './events/live-broadcast.emitter';
import { LiveFeedEmitter } from './events/live-feed.emitter';
import { LiveFeedMessage } from './events/live-feed.event';
import { LiveWindowRegistry, OpenWindow } from './live-window.registry';
import { QuestionWindowService } from './question-window.service';
import { toGameEventMessageDto } from './live-payload.mapper';
import { isAscendingAttackEdge, seedRungForStage } from './live-trigger';
import {
  IN_PLAY_STATUS_IDS,
  OPEN_COOLDOWN_MS,
  SET_PIECE_RESTART_TYPES,
} from './live.constants';

/**
 * The live prediction loop's brain. Consumes every persisted feed message and
 * decides three things:
 *   1. push it to subscribers as a real `game_event`;
 *   2. if a window is open, fold the message into that window's high-water rung;
 *   3. if no window is open, decide whether this message should open one.
 *
 * RESILIENCE CONTRACT: ingest must never stall or fail because of anything in
 * here. The emitter handler returns immediately (it only enqueues), all work
 * runs on a detached per-game promise chain, and every stage is wrapped so a
 * throw is logged and swallowed rather than propagated.
 */
@Injectable()
export class LiveEngineService implements OnModuleInit {
  private readonly logger = new Logger(LiveEngineService.name);

  /**
   * Per-game serial promise chain. The feed emitter fires synchronously but
   * the work is async, so without this a burst of messages would interleave
   * and could, for example, run two window-opens concurrently for one game.
   * Chaining per game preserves feed order within a game while leaving
   * different games fully parallel.
   */
  private readonly chains = new Map<number, Promise<void>>();

  /** Optional; unset/0 disables. See LIVE_QUESTION_FALLBACK_TIMER_MS. */
  private readonly fallbackMs: number;

  constructor(
    private readonly feed: LiveFeedEmitter,
    private readonly broadcast: LiveBroadcastEmitter,
    private readonly registry: LiveWindowRegistry,
    private readonly windows: QuestionWindowService,
    config: ConfigService,
  ) {
    const configured = config.get<number>('LIVE_QUESTION_FALLBACK_TIMER_MS');
    this.fallbackMs =
      typeof configured === 'number' && configured > 0 ? configured : 0;
  }

  onModuleInit(): void {
    this.feed.on((message) => this.enqueue(message));
    if (this.fallbackMs > 0) {
      this.logger.log(
        `Fallback question timer ENABLED at ${this.fallbackMs}ms`,
      );
    }
  }

  private enqueue(message: LiveFeedMessage): void {
    try {
      const prior = this.chains.get(message.gameId) ?? Promise.resolve();
      const next = prior
        .then(() => this.handle(message))
        .catch((err) =>
          this.logger.error(
            `Game ${message.gameId}: live engine failed on seq ${message.seq}`,
            err as Error,
          ),
        );
      this.chains.set(message.gameId, next);
    } catch (err) {
      // Nothing above should throw synchronously, but this handler runs on the
      // ingest call stack — a throw here would reach processEvent().
      this.logger.error(
        `Game ${message.gameId}: failed to enqueue live work`,
        err as Error,
      );
    }
  }

  private async handle(message: LiveFeedMessage): Promise<void> {
    this.pushGameEvent(message);
    this.trackClock(message);

    const window = this.registry.get(message.gameId);
    if (window !== undefined) {
      this.accumulate(window, message);
      return;
    }

    await this.maybeOpen(message);
  }

  // ── 1. Real game_event push ────────────────────────────────────────────

  private pushGameEvent(message: LiveFeedMessage): void {
    const payload = toGameEventMessageDto(message);
    if (payload === null) return; // duplicate (game_id, Seq) — already pushed
    this.broadcast.emit({
      event: 'game_event',
      gameId: message.gameId,
      payload,
    });
  }

  // ── Match clock ────────────────────────────────────────────────────────

  /**
   * The feed carries a real `Clock: { Running, Seconds }` on its messages.
   * `GameState` has no period anchor (the documented D-07 gap), so the live
   * clock is reconstructed from this reading instead of being faked.
   */
  private trackClock(message: LiveFeedMessage): void {
    const inner = this.innerOf(message.raw);
    if (inner === null) return;
    const clock = inner.Clock;
    if (clock === null || typeof clock !== 'object' || Array.isArray(clock))
      return;
    const seconds = (clock as Record<string, unknown>).Seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      this.registry.setClockSeconds(message.gameId, seconds);
    }
  }

  // ── 2. High-water accumulation while a window is open ──────────────────

  // Synchronous: accumulation is pure in-memory bookkeeping. The only DB work
  // in the window's lifetime happens at open and at resolution.
  private accumulate(window: OpenWindow, message: LiveFeedMessage): void {
    const inner = this.innerOf(message.raw);
    let raised = false;

    // Possession: danger / high_danger lift the floor to the `danger` rung.
    const possession = classifyPossession(message.raw);
    if (possession !== null) {
      this.registry.advanceStage(message.gameId, possession.stage);
      if (possession.stage === 'danger' || possession.stage === 'high_danger') {
        this.registry.recordDangerPossession(window);
        raised = true;
      }
    }

    // Shot: matched on the exact inner Action (never a substring match), and
    // recorded under its action id so a later discard can retract it.
    if (inner !== null && inner.Action === 'shot') {
      this.registry.recordShot(window, message.actionId);
      raised = true;
    }

    // Goal family. classifyGoalEvent owns confirm/amend/discard semantics —
    // goal logic is never hand-rolled here, so a DISCARDED goal cannot count.
    const goal = classifyGoalEvent(message.raw);
    if (goal !== null) {
      if (goal.action === 'goal') {
        // Participant is carried so resolution can tell an unconfirmed goal by
        // the ATTACKING team (defer for it) from one by the other team on a
        // counter-attack (not this window's outcome).
        this.registry.recordGoalSighting(
          window,
          goal.id,
          goal.confirmed,
          goal.participant,
        );
        raised = true;
      } else if (goal.action === 'action_discarded') {
        // Retracts a goal AND/OR a shot recorded earlier in this window: the
        // feed reuses one incident Id across confirm/amend/discard, so the
        // discard's Id is the original action's Id.
        this.registry.recordDiscard(window, goal.id);
      }
    }

    if (raised && message.eventId !== null) {
      window.resolutionEventId = message.eventId;
    }

    // NOTE: a confirmed goal deliberately does NOT resolve the window early,
    // even though it is the top of the ladder. Resolving on the spot would
    // close the window before any `action_discarded` for that same goal could
    // arrive, permanently locking in a rung the feed later retracts — verified
    // in an end-to-end run, where a discarded goal still paid out 100 points.
    // Because the rung is derived on demand, letting the flat timer resolve
    // keeps discards authoritative for the whole window at the cost of a few
    // seconds' latency. The RESL-02 pending_confirmation state is still
    // skipped: the timer resolves against whatever is confirmed by then.
  }

  // ── 3. Window trigger (WNDW-01) ────────────────────────────────────────

  private async maybeOpen(message: LiveFeedMessage): Promise<void> {
    const now = Date.now();
    this.registry.markSeen(message.gameId, now);

    // Gate: only while the ball is in play (H1/H2/ET1/ET2). No windows during
    // half-time, breaks, suspensions or terminal statuses. StatusId is an open
    // set — this is a membership test, not an exhaustive enum mapping.
    const statusId = message.statusId ?? message.state.currentStatusId;
    if (statusId === null || !IN_PLAY_STATUS_IDS.has(statusId)) return;

    // A set piece restarts play, so the run that preceded it is over. Reset the
    // tracked stage to `safe` — otherwise it stays frozen at the high_danger
    // that earned the free kick, and the genuinely-new attack that follows the
    // restart is misread as a descent and suppressed. See
    // SET_PIECE_RESTART_TYPES for the measured impact.
    if (SET_PIECE_RESTART_TYPES.has(message.type)) {
      this.registry.advanceStage(message.gameId, 'safe');
    }

    const possession = classifyPossession(message.raw);
    if (possession !== null) {
      const prior = this.registry.advanceStage(
        message.gameId,
        possession.stage,
      );

      // The trigger is the EDGE into an attacking stage, not the level. Note
      // that GameState.possessionStage has already been advanced to the
      // current stage by the state machine before this hook runs, which is why
      // the prior stage is tracked separately in the registry.
      //
      // ASCENDING EDGES INTO ANY ATTACKING STAGE (attack/danger/high_danger) —
      // broadened WNDW-01 gate (quick task 260719-m7e, LD-1). Originally
      // narrowed to strictly `safe -> attack` from live data during the
      // 2026-07-18 France–England match: WNDW-01 says a window opens when
      // possession "first enters attack_possession", which reads naturally as
      // an attack building UP out of safe play, but the feed also produces the
      // opposite — an attack winding DOWN passes back through
      // attack_possession on its way to safe (measured 9 fading-attack windows
      // in the first half, 16/22 outcomes `fizzles`). That narrowing also had a
      // side effect: a sustained attacking passage that oscillates
      // attack<->danger<->high_danger WITHOUT dropping back to `safe`
      // self-suppressed after its first window, because every later escalation
      // read as a same-or-lower step relative to a prior stage that was never
      // `safe`. `isAscendingAttackEdge` fixes both at once by comparing ranks
      // (safe < attack < danger < high_danger) rather than testing for the
      // single `safe`/`null` prior: it fires on any ascending step into an
      // attacking stage — including attack->danger and danger->high_danger —
      // and still never fires on a flat repeat or a descent. Density during a
      // sustained escalation is capped by the unchanged cooldown/one-open-per-
      // game guards below (LD-4), not by the trigger condition itself.
      //
      // `prior === null` (first contact, at match start) is folded into the
      // rank comparison as rank -1, so the very first attack of a match still
      // triggers.
      if (isAscendingAttackEdge(prior, possession.stage)) {
        if (
          this.registry.msSinceLastOpen(message.gameId, now) < OPEN_COOLDOWN_MS
        ) {
          this.logger.debug(
            `Game ${message.gameId}: attack trigger suppressed by cooldown`,
          );
          return;
        }
        await this.windows.open(
          message.gameId,
          message.eventId,
          possession.participant,
          seedRungForStage(possession.stage),
        );
        return;
      }
    }

    await this.maybeOpenFallback(message, now);
  }

  /**
   * OPTIONAL, DISABLED BY DEFAULT (LIVE_QUESTION_FALLBACK_TIMER_MS unset).
   * When enabled, guarantees a game never goes longer than the configured
   * interval without a window, even if the feed never produces a clean
   * attack_possession edge. Message-driven rather than timer-driven, so it
   * costs nothing when idle and cannot fire while the ball is out of play.
   */
  private async maybeOpenFallback(
    message: LiveFeedMessage,
    now: number,
  ): Promise<void> {
    if (this.fallbackMs === 0) return;
    if (
      this.registry.msSinceLastOpenOrFirstSeen(message.gameId, now) <
      this.fallbackMs
    )
      return;

    this.logger.warn(
      `Game ${message.gameId}: no window opened in ${this.fallbackMs}ms — opening via fallback timer`,
    );
    await this.windows.open(
      message.gameId,
      message.eventId,
      message.participant,
    );
  }

  /** Defensive inner-field read: `raw.Update ?? raw`, the convention used across the ingest state modules. */
  private innerOf(
    raw: Record<string, unknown>,
  ): Record<string, unknown> | null {
    try {
      const inner = (raw.Update ?? raw) as unknown;
      if (inner === null || typeof inner !== 'object' || Array.isArray(inner))
        return null;
      return inner as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
