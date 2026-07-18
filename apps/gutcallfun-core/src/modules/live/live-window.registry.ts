import { Injectable } from '@nestjs/common';
import { Rung } from './live.constants';

/** One stored option row, cached at open time. `baseGain` is the FROZEN value written to the DB row. */
export interface WindowOption {
  id: string;
  outcomeKey: Rung;
  baseGain: number;
  displayOrder: number;
}

/**
 * A goal sighting tracked for the duration of an open window.
 *
 * Keyed by the goal ACTION id, which `classifyGoalEvent` resolves for all
 * three action families ('goal' / 'action_amend' / 'action_discarded') — the
 * feed reuses one incident `Id` across confirm/amend/discard rather than
 * minting a fresh one per correction, so the correct match key is
 * (game, action_id, type) and never the bare `Id` in isolation.
 */
interface GoalSighting {
  confirmed: boolean;
  discarded: boolean;
}

export interface OpenWindow {
  questionId: string;
  gameId: number;
  participant: number | null;

  /** SERVER WALL CLOCK (STAT-03) — window bookkeeping, never mixed with feed Ts. */
  openedAtWall: number;
  expiresAt: Date;

  options: WindowOption[];

  /** Highest possession rung reached: 'fizzles' until a danger/high_danger arrives. Monotonic. */
  possessionRung: Extract<Rung, 'fizzles' | 'danger'>;

  /** Shot action ids seen during the window. A later action_discarded removes its id, lowering the rung. */
  shotActionIds: Set<number>;

  /** Goal action id -> sighting. Only confirmed && !discarded contributes the `goal` rung. */
  goalSightings: Map<number, GoalSighting>;

  /** `game_event` row id of the message that resolved the window, when known. */
  resolutionEventId: string | null;

  /** Guards against a timer firing concurrently with an immediate goal resolve. */
  resolving: boolean;
}

/**
 * In-memory per-game live-loop bookkeeping: the currently open prediction
 * window and its high-water accumulation, plus the possession-stage edge
 * detector and the match clock reading.
 *
 * WHY THIS TRACKS ITS OWN HIGH-WATER MARK: `GameState.attackRunHighWaterStage`
 * is NOT a high-water mark despite its name — `game-state.machine.ts` assigns
 * it the literal 'HighDangerPossession' unconditionally whenever the attack
 * store emits a trigger, so it never reflects what actually happened during a
 * run. Reading it for resolution would award the top rung on every window.
 * This registry accumulates the real rung from the events that arrive while
 * the window is open, and nothing here reads that field.
 */
@Injectable()
export class LiveWindowRegistry {
  private readonly windows = new Map<number, OpenWindow>();

  /**
   * Wall-clock ms of the last actual window OPEN per game. Drives the cooldown
   * ONLY. Absent until a window has genuinely opened, so the first attack of a
   * match is never suppressed.
   */
  private readonly lastOpenedAt = new Map<number, number>();

  /**
   * Wall-clock ms of the first message seen for a game. Baseline for the
   * optional fallback timer, kept SEPARATE from `lastOpenedAt`: folding the two
   * together would make first contact look like a recent open and silently
   * suppress the match's first genuine attack trigger for a whole cooldown.
   */
  private readonly firstSeenAt = new Map<number, number>();

  /**
   * The possession stage as of the previous message, per game. Needed because
   * `GameState.possessionStage` has already been advanced to the CURRENT stage
   * by the state machine before the live engine's hook runs — so the "first
   * entry into attack_possession" edge is only detectable against this
   * separately-held prior value.
   */
  private readonly priorStage = new Map<number, string>();

  /** Latest feed `Clock.Seconds` reading per game — the real match clock (see LiveStateService). */
  private readonly clockSeconds = new Map<number, number>();

  // ── Open window lifecycle ──────────────────────────────────────────────

  get(gameId: number): OpenWindow | undefined {
    return this.windows.get(gameId);
  }

  hasOpen(gameId: number): boolean {
    return this.windows.has(gameId);
  }

  open(window: OpenWindow): void {
    this.windows.set(window.gameId, window);
    this.lastOpenedAt.set(window.gameId, window.openedAtWall);
  }

  close(gameId: number): void {
    this.windows.delete(gameId);
  }

  /**
   * Wall-clock ms since the last genuine window open for this game; Infinity
   * when none has ever opened (so the cooldown never blocks the first window).
   */
  msSinceLastOpen(gameId: number, now: number): number {
    const last = this.lastOpenedAt.get(gameId);
    return last === undefined ? Number.POSITIVE_INFINITY : now - last;
  }

  /**
   * Records first contact with a game, so the optional fallback timer measures
   * from there rather than from the epoch (which would fire it instantly on the
   * very first message).
   */
  markSeen(gameId: number, now: number): void {
    if (!this.firstSeenAt.has(gameId)) {
      this.firstSeenAt.set(gameId, now);
    }
  }

  /**
   * Wall-clock ms since the last window open, or since first contact if none
   * has opened yet. This — not `msSinceLastOpen` — is what the fallback timer
   * measures against.
   */
  msSinceLastOpenOrFirstSeen(gameId: number, now: number): number {
    const reference =
      this.lastOpenedAt.get(gameId) ?? this.firstSeenAt.get(gameId);
    return reference === undefined ? 0 : now - reference;
  }

  // ── Possession edge detection ──────────────────────────────────────────

  /** Returns the prior stage and records the new one. Returns null on first contact. */
  advanceStage(gameId: number, stage: string): string | null {
    const prior = this.priorStage.get(gameId) ?? null;
    this.priorStage.set(gameId, stage);
    return prior;
  }

  // ── Match clock ────────────────────────────────────────────────────────

  setClockSeconds(gameId: number, seconds: number): void {
    this.clockSeconds.set(gameId, seconds);
  }

  getClockSeconds(gameId: number): number | null {
    return this.clockSeconds.get(gameId) ?? null;
  }

  // ── High-water accumulation ────────────────────────────────────────────

  /** Raise the possession rung to `danger` (monotonic — never lowers). */
  recordDangerPossession(window: OpenWindow): void {
    window.possessionRung = 'danger';
  }

  recordShot(window: OpenWindow, actionId: number | null): void {
    // A shot with no usable action id still counts toward the rung, but cannot
    // be retracted by a later discard — record it under a sentinel key.
    window.shotActionIds.add(actionId ?? Number.NaN);
  }

  recordGoalSighting(
    window: OpenWindow,
    goalActionId: number,
    confirmed: boolean,
  ): void {
    const existing = window.goalSightings.get(goalActionId);
    if (existing === undefined) {
      window.goalSightings.set(goalActionId, { confirmed, discarded: false });
      return;
    }
    // Confirmed:false -> Confirmed:true is a one-way transition, and is
    // idempotent under duplicate re-delivery (Last-Event-ID resume).
    if (confirmed) existing.confirmed = true;
  }

  /**
   * A discard retroactively removes an incident from the window. This is the
   * one path that can LOWER the effective rung, which is exactly why the rung
   * is derived on demand by `currentRung()` rather than stored as a running
   * maximum: a discarded goal must not leave a stale `goal` high-water behind.
   */
  recordDiscard(window: OpenWindow, discardedActionId: number): void {
    const goal = window.goalSightings.get(discardedActionId);
    if (goal !== undefined) goal.discarded = true;
    window.shotActionIds.delete(discardedActionId);
  }

  /**
   * Derive the window's current rung from everything accumulated so far.
   * Evaluated top-down: a confirmed, undiscarded goal outranks a shot, which
   * outranks danger possession, which outranks the fizzles floor.
   */
  currentRung(window: OpenWindow): Rung {
    for (const sighting of window.goalSightings.values()) {
      if (sighting.confirmed && !sighting.discarded) return 'goal';
    }
    if (window.shotActionIds.size > 0) return 'shot';
    return window.possessionRung;
  }

  // ── Eviction ───────────────────────────────────────────────────────────

  /** Bounds Map growth for finished/cancelled games (mirrors GameStateRegistry.remove). */
  remove(gameId: number): void {
    this.windows.delete(gameId);
    this.lastOpenedAt.delete(gameId);
    this.firstSeenAt.delete(gameId);
    this.priorStage.delete(gameId);
    this.clockSeconds.delete(gameId);
  }
}
