/**
 * Possession-stage classifier + attack-run segmentation store.
 *
 * Ported near-verbatim from `classifyPossession`/`createAttackStore` in
 * github.com/mckrava/txodds-txline-api-monitor (src/possession.ts), with two
 * deliberate adaptations for GutCall:
 *
 *  1. STAT-03 two-clock discipline: the reference module's attack-run gap
 *     check took a node-stamped `receivedAt` wall-clock parameter on every
 *     `ingest()` call. This plan requires match-time logic (attack-run
 *     segmentation) to compare feed `Ts` deltas only, never wall-clock time —
 *     so the gap check here is routed through `feedElapsedMs()` (clock.ts)
 *     against each signal's own feed `Ts`, and `ingest()` no longer takes a
 *     `receivedAt` argument at all.
 *  2. `AttackTrigger` drops the reference repo's `anchorReceivedAt` /
 *     `confirmedReceivedAt` / `confirmedTs` fields — those existed only to
 *     conform to that repo's own `MeasurableTrigger`/`samples.ts` metrics
 *     interface (a latency-measurement feature), which is not ported into
 *     this codebase.
 *  3. `classifyPossession` is supplemented with `nextPossessionStage()`, a
 *     small stateful fold this plan's task requires: given the current stage
 *     (or none, for the very first event of a game) and a raw message, it
 *     returns the next stage — a bare `possession` marker (or any other
 *     non-staged action) leaves the stage unchanged, and the very first event
 *     for a game resolves to a defined `INITIAL_STAGE` rather than
 *     undefined/crashing (STAT-01 empty edge).
 *
 * classifyPossession: reads the inner SSE payload as `parsed.Update ?? parsed`
 * (defensive inner-field read, tolerates both the flat TxLINE SSE shape and a
 * Fusion-style `{Update: {...}}` envelope). Returns a PossessionSignal only
 * when the inner Action is exactly one of the four staged possession actions.
 * A bare `Action:"possession"` message (ball-holder-change marker, no
 * PossessionType) is intentionally NOT in the lookup table and classifies to
 * null — it must never be treated as a danger stage (RESEARCH Anti-Pattern;
 * txodds-api gotcha 4). Never throws (T-02-02-02 DoS guard).
 *
 * createAttackStore: segments repeated high_danger events into first-of-attack
 * triggers. A new attack run begins only when no active run exists (first
 * high_danger ever, or a prior run has expired). A run expires when the
 * feed-Ts gap from the last danger/high_danger signal exceeds ATTACK_GAP_MS
 * (checked lazily on each ingest call). Stage drops to safe/attack do NOT
 * immediately expire the run — only the feed-Ts gap does.
 *
 * Decision D-01 (ACTION-FIRST, from the reference repo): classify off the
 * inner Action field using an explicit lookup table. NO substring matching.
 *
 * Pure module: no I/O, no NestJS DI, no DB.
 *
 * Security:
 *  - No secrets pass through this module — only numeric IDs, timestamps, and stage strings.
 *  - try/catch returns null on any malformed/hostile input (T-02-02-02).
 */

import { feedElapsedMs } from './clock';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Feed-Ts gap in milliseconds after which an active attack run expires.
 * Ported from the reference repo's ATTACK_GAP_MS (15 000ms / 15s) — covers
 * real-world attack sequences without merging distinct attacks.
 */
export const ATTACK_GAP_MS = 15_000;

// ── Types ────────────────────────────────────────────────────────────────────

/** The four possession danger stages recognised from the inner Action field. */
export type PossessionStage = 'safe' | 'attack' | 'danger' | 'high_danger';

/** Defined initial stage for a game with no prior possession event (STAT-01 empty edge). */
export const INITIAL_STAGE: PossessionStage = 'safe';

/**
 * Classified signal extracted from a single possession SSE event.
 * All numeric fields are null when absent or not a number (defensive read).
 */
export interface PossessionSignal {
  /** The classified stage derived from the inner Action field. */
  stage: PossessionStage;
  /** Feed Ts field (epoch ms); null when absent or not a number. */
  ts: number | null;
  /** Feed Seq field; null when absent or not a number. */
  seq: number | null;
  /** Feed FixtureId field; null when absent or not a number. */
  fixtureId: number | null;
  /** Feed Participant field (possessing team int); null when absent or not a number. */
  participant: number | null;
  /** Feed Id field (event id); null when absent or not a number. */
  id: number | null;
}

// ── Explicit Action -> Stage lookup (D-01: NO substring matching) ─────────────

/**
 * Exact-string lookup from inner Action to PossessionStage.
 *
 * Only the four real staged Action values appear here. The generic
 * Action:"possession" (ball-holder-change marker) is NOT present — it
 * classifies to undefined, which classifyPossession converts to null.
 */
const ACTION_TO_STAGE: Readonly<Record<string, PossessionStage>> = Object.freeze({
  safe_possession: 'safe',
  attack_possession: 'attack',
  danger_possession: 'danger',
  high_danger_possession: 'high_danger',
});

// ── classifyPossession ─────────────────────────────────────────────────────────

/**
 * Classify a parsed SSE payload as a possession-stage event.
 *
 * Classification is ACTION-FIRST (D-01): the stage is determined solely by
 * the inner Action field via the explicit ACTION_TO_STAGE lookup.
 *
 * Returns null for:
 *   - Any Action not in ACTION_TO_STAGE (including the generic "possession" marker)
 *   - Malformed, null, undefined, or non-object input
 *   - Any exception (T-02-02-02 never-throw guard)
 *
 * @param parsed - Already-parsed JSON object (caller must not double-parse).
 * @returns PossessionSignal when the inner Action is a known stage; null otherwise.
 */
export function classifyPossession(parsed: Record<string, unknown>): PossessionSignal | null {
  try {
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const inner = (parsed.Update ?? parsed) as Record<string, unknown>;

    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
      return null;
    }

    const action = inner.Action;
    if (typeof action !== 'string') return null;

    const stage = ACTION_TO_STAGE[action];
    if (stage === undefined) return null;

    const ts = typeof inner.Ts === 'number' ? inner.Ts : null;
    const seq = typeof inner.Seq === 'number' ? inner.Seq : null;
    const fixtureId = typeof inner.FixtureId === 'number' ? inner.FixtureId : null;
    const participant = typeof inner.Participant === 'number' ? inner.Participant : null;
    const id = typeof inner.Id === 'number' ? inner.Id : null;

    return { stage, ts, seq, fixtureId, participant, id };
  } catch {
    // T-02-02-02: never crash the stream on any malformed/hostile input
    return null;
  }
}

/**
 * Fold a single feed message into the next possession stage, given the
 * current stage (or null, on the very first event ever seen for a game).
 *
 * - One of the four staged actions -> that stage.
 * - A bare 'possession' marker (or any other non-staged/malformed message) ->
 *   unchanged prior stage (STAT-01 must_have: marker only, never advances the
 *   ladder).
 * - No prior stage -> INITIAL_STAGE (STAT-01 empty edge: a defined stage,
 *   never undefined/crash).
 *
 * Because each staged message fully determines the next stage from itself
 * alone (no history required beyond "what was the last known stage"), state
 * self-heals from any single post-gap message without needing the missed
 * messages in between.
 */
export function nextPossessionStage(
  priorStage: PossessionStage | null,
  parsed: Record<string, unknown>,
): PossessionStage {
  const signal = classifyPossession(parsed);
  if (signal !== null) return signal.stage;
  return priorStage ?? INITIAL_STAGE;
}

// ── AttackTrigger ─────────────────────────────────────────────────────────────

/** A first-of-attack trigger produced by createAttackStore(). */
export interface AttackTrigger {
  /** Feed Id of the first high_danger event (from PossessionSignal.id). May be null if absent. */
  id: number | null;
  /** Feed Ts of the first high_danger event of this attack run; null if absent in the signal. */
  anchorTs: number | null;
  /** Possessing team int from the first high_danger signal; null if absent. */
  participant: number | null;
  /** Always 'high_danger' — only high_danger events produce triggers. */
  possessionStage: 'high_danger';
}

// ── AttackStore ───────────────────────────────────────────────────────────────

/** Public interface of the attack segmentation store. */
export interface AttackStore {
  /**
   * Ingest a classified possession signal.
   *
   * - high_danger with no active run -> start run, return first-of-attack trigger.
   * - high_danger with active run (within ATTACK_GAP_MS of last danger/high_danger,
   *   compared via feed Ts) -> collapse, return null.
   * - Any other stage -> no trigger; lazily check run expiry.
   *
   * @param signal - Classified possession signal from classifyPossession().
   * @returns AttackTrigger for the first-of-attack; null for collapses or non-high-danger.
   */
  ingest: (signal: PossessionSignal) => AttackTrigger | null;

  /**
   * Returns the most recent first-of-attack trigger, or null before any
   * attack run or after the run has been lazily expired by a later ingest()
   * call.
   */
  mostRecentTrigger: () => AttackTrigger | null;
}

// ── createAttackStore ─────────────────────────────────────────────────────────

/**
 * Create an attack segmentation store.
 *
 * Segments repeated high_danger_possession events into first-of-attack
 * triggers. The run is active from the first high_danger until the feed-Ts
 * gap from the last danger/high_danger event exceeds ATTACK_GAP_MS (checked
 * lazily on each ingest). Stage drops to safe/attack do NOT immediately reset
 * the run — only the feed-Ts gap does.
 */
export function createAttackStore(): AttackStore {
  // The current first-of-attack trigger, or null if no run is active.
  let activeTrigger: AttackTrigger | null = null;

  // Feed Ts of the last danger or high_danger signal — used for gap expiry.
  // Not updated by safe/attack stages (time gap is measured from the last
  // high-pressure event only).
  let lastDangerTs: number | null = null;

  function ingest(signal: PossessionSignal): AttackTrigger | null {
    // Lazily expire the active run if the feed-Ts gap since the last
    // danger/high_danger exceeds ATTACK_GAP_MS.
    if (activeTrigger !== null && lastDangerTs !== null && signal.ts !== null) {
      if (feedElapsedMs(lastDangerTs, signal.ts) > ATTACK_GAP_MS) {
        activeTrigger = null; // run expired — next high_danger starts a fresh run
      }
    }

    // Update the last-danger feed Ts for danger and high_danger stages.
    if ((signal.stage === 'danger' || signal.stage === 'high_danger') && signal.ts !== null) {
      lastDangerTs = signal.ts;
    }

    // Only high_danger events can start a new run or collapse.
    if (signal.stage !== 'high_danger') return null;

    // Collapse: a run is still active (not yet expired).
    if (activeTrigger !== null) return null;

    // First-of-attack: no active run -> start one and emit the trigger.
    const trigger: AttackTrigger = {
      id: signal.id,
      anchorTs: signal.ts,
      participant: signal.participant,
      possessionStage: 'high_danger',
    };
    activeTrigger = trigger;
    return trigger;
  }

  function mostRecentTrigger(): AttackTrigger | null {
    return activeTrigger;
  }

  return { ingest, mostRecentTrigger };
}
