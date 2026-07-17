/**
 * Per-game in-memory state machine (STAT-01/STAT-02/STAT-03).
 *
 * Bridges the pure, source-agnostic functional modules ported in Plan 02
 * (possession.ts, goals.ts, clock.ts) onto the frozen GameState shape
 * defined by Plan 01 (game-state.types.ts). `applyEvent()` is called once
 * per successfully persisted event (Task 2 / EventIngestService); it never
 * touches the database.
 *
 * `possession.ts` classifies stages as the lowercase set
 * ('safe'|'attack'|'danger'|'high_danger') derived from the exact Action
 * match; GameState (Plan 01) stores the wire-matching PascalCase
 * PossessionType strings ('SafePossession'|...). STAGE_MAP bridges the two —
 * this is Task 2's own integration responsibility, not a discrepancy in
 * either ported module.
 *
 * `createAttackStore()`/`createGoalStore()` (Plan 02) are stateful closures
 * (attack-run + Id-anchored goal aggregation) that must persist across many
 * events for the same game — they are NOT part of the frozen GameState
 * shape (Plan 01 kept GameState to plain scalars only), so this class holds
 * its own per-game `Map<gameId, AttackStore | GoalStore>` registries,
 * following the same per-key singleton pattern as GameMutexRegistry/
 * GameStateRegistry (RESEARCH Pattern 2 / Shared Patterns).
 */

import { Injectable } from '@nestjs/common';
import {
  AttackStore,
  classifyPossession,
  createAttackStore,
  PossessionStage as PossessionLadderStage,
} from './possession';
import { classifyGoalEvent, createGoalStore, GoalStore } from './goals';
import { GameState, PossessionStage } from './game-state.types';

/** Maps possession.ts's lowercase stage set onto GameState's PascalCase PossessionType strings. */
const STAGE_MAP: Readonly<Record<PossessionLadderStage, Exclude<PossessionStage, null>>> =
  Object.freeze({
    safe: 'SafePossession',
    attack: 'AttackPossession',
    danger: 'DangerPossession',
    high_danger: 'HighDangerPossession',
  });

export interface GapCheckResult {
  /**
   * True when `seq` is a genuine discontinuity for the SAME ConnectionId
   * (`seq > lastSeq + 1`). A Seq reset caused by a ConnectionId change is
   * NEVER a gap (RCVR-02; RESEARCH Pitfall 7 — Seq is per-ConnectionId
   * monotonic, not globally monotonic).
   */
  isGap: boolean;
  /** `lastSeq + 1` for the prior ConnectionId, or null when there was no prior state to compare against. */
  expectedSeq: number | null;
}

@Injectable()
export class GameStateMachine {
  private readonly attackStores = new Map<number, AttackStore>();
  private readonly goalStores = new Map<number, GoalStore>();

  /**
   * Detect a Seq discontinuity BEFORE persisting a new event, comparing
   * against the state's currently recorded lastSeq/connectionId (i.e. as of
   * the previously applied event — call this before applyEvent() for the
   * same message).
   */
  detectGap(state: GameState, seq: number, connectionId: string | null): GapCheckResult {
    if (state.connectionId !== null && connectionId !== null && state.connectionId !== connectionId) {
      // ConnectionId changed since the last message — a Seq reset here is
      // expected, not a gap (Pitfall 7).
      return { isGap: false, expectedSeq: null };
    }

    if (state.lastSeq === null) {
      // No prior Seq recorded for this game/connection — first message ever
      // seen, or state was just created (e.g. post-restart). Not a gap.
      return { isGap: false, expectedSeq: null };
    }

    const expectedSeq = state.lastSeq + 1;
    return { isGap: seq > expectedSeq, expectedSeq };
  }

  /**
   * Apply a single already-persisted raw feed message to the in-memory
   * state: possession stage + attack run (possession.ts), score
   * (goals.ts), StatusId, feed-Ts clock, and lastSeq/connectionId
   * bookkeeping for the next detectGap() call. Mutates `state` in place —
   * `state` MUST be the same object reference held by GameStateRegistry.
   *
   * Defensive: reads are best-effort (missing/malformed fields simply leave
   * the corresponding state field unchanged); classifyPossession/
   * classifyGoalEvent never throw (T-02-03-01), so this method never throws
   * either.
   */
  applyEvent(state: GameState, raw: Record<string, unknown>): void {
    const inner = this.innerOf(raw);

    // Possession ladder + attack-run segmentation (STAT-01).
    const possessionSignal = classifyPossession(raw);
    if (possessionSignal !== null) {
      state.possessionStage = STAGE_MAP[possessionSignal.stage];

      if (possessionSignal.stage === 'danger' || possessionSignal.stage === 'high_danger') {
        state.lastDangerFeedTs = possessionSignal.ts ?? state.lastDangerFeedTs;
      }

      const trigger = this.attackStoreFor(state.gameId).ingest(possessionSignal);
      const activeTrigger = this.attackStoreFor(state.gameId).mostRecentTrigger();
      state.attackRunActive = activeTrigger !== null;
      if (trigger !== null) {
        state.attackRunHighWaterStage = 'HighDangerPossession';
      }
    }

    // Goal reconciliation -> denormalized score (STAT-01, INGST-05).
    const goalSignal = classifyGoalEvent(raw);
    if (goalSignal !== null) {
      this.goalStoreFor(state.gameId).ingest(goalSignal);
      const derived = this.goalStoreFor(state.gameId).deriveScore();
      state.score1 = derived.participant1;
      state.score2 = derived.participant2;
    }

    if (inner !== null) {
      // StatusId (open set — never a closed enum, RESEARCH.md).
      if (typeof inner.StatusId === 'number') {
        state.currentStatusId = inner.StatusId;
      }

      // Two-clock discipline (STAT-03): track the most recent feed Ts
      // (match-time clock) — never Date.now() here.
      if (typeof inner.Ts === 'number') {
        state.lastFeedTs = inner.Ts;
      }

      // lastSeq/connectionId bookkeeping for the NEXT detectGap() call.
      if (typeof inner.Seq === 'number') {
        state.lastSeq = inner.Seq;
      }
      if (typeof inner.ConnectionId === 'number' || typeof inner.ConnectionId === 'string') {
        state.connectionId = String(inner.ConnectionId);
      }
    }
  }

  /** Eviction hook — bounds Map growth for finished/cancelled games (mirrors GameMutexRegistry/GameStateRegistry). */
  remove(gameId: number): void {
    this.attackStores.delete(gameId);
    this.goalStores.delete(gameId);
  }

  private attackStoreFor(gameId: number): AttackStore {
    let store = this.attackStores.get(gameId);
    if (!store) {
      store = createAttackStore();
      this.attackStores.set(gameId, store);
    }
    return store;
  }

  private goalStoreFor(gameId: number): GoalStore {
    let store = this.goalStores.get(gameId);
    if (!store) {
      store = createGoalStore();
      this.goalStores.set(gameId, store);
    }
    return store;
  }

  /** Defensive inner-field read: `raw.Update ?? raw`, same convention as possession.ts/goals.ts/message-normalizer.ts. */
  private innerOf(raw: Record<string, unknown>): Record<string, unknown> | null {
    try {
      const inner = (raw.Update ?? raw) as unknown;
      if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return null;
      return inner as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
