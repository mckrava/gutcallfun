/**
 * Goal Id-keyed reconciliation store + score derivation.
 *
 * The reference repo (github.com/mckrava/txodds-txline-api-monitor,
 * src/goals.ts) implements Id-keyed goal *sighting* aggregation for its own
 * "I SAW IT ON TV" latency-measurement feature — it groups messages sharing a
 * goal's Id and anchors metadata to the earliest sighting, but that repo has
 * no concept of a derived score and does not handle action_amend or
 * action_discarded at all (it only ever measures confirm-lag, never needs a
 * scoreline). GutCall needs an actual reconciled score, so this module ports
 * the reference repo's Id-keyed anchor-to-earliest pattern (RESEARCH Pitfall
 * 3; txodds-api gotcha 3) and adds the score-derivation + discard/amend
 * reconciliation this plan's task explicitly requires on top of it.
 *
 * classifyGoalEvent: reads the inner SSE payload as `parsed.Update ?? parsed`
 * (defensive inner-field read). Recognises three action families that affect
 * goal state:
 *   - 'goal' (own Id; Confirmed:false first, Confirmed:true later — median
 *     ~76s gap empirically, per txodds-api skill / PROJECT.md)
 *   - 'action_amend' (Data.Id = id of the amended action; only relevant here
 *     when Data.Action === 'goal' — amended fields like PlayerId don't impact
 *     the score per the message reference)
 *   - 'action_discarded' (top-level Id = id of the discarded action — Id is
 *     an incident id reused across confirm/amend/discard per PROJECT.md's
 *     verified feed facts, never a fresh id per correction)
 * Never throws (T-02-02-02 DoS guard).
 *
 * createGoalStore: one aggregate per goal Id, anchored to the EARLIEST
 * sighting for that Id and never overwritten afterwards (D-03 anchor
 * discipline, ported from the reference repo). deriveScore() counts a goal
 * exactly once — on the first Confirmed:true sighting for its Id — so
 * confirm-after-unconfirmed churn on the same Id never double-counts. A later
 * action_discarded for a previously-counted Id reverses the count (empirically
 * zero confirmed goals have ever been discarded per the txodds-api skill, but
 * the message schema allows it and this module handles it defensively
 * regardless). All derived score values are integers.
 *
 * Pure module: no I/O, no NestJS DI, no DB.
 *
 * Security:
 *  - No secrets pass through this module — only numeric IDs, timestamps, and participant ints.
 *  - try/catch returns null on any malformed/hostile input (T-02-02-02 DoS guard).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type GoalEventAction = 'goal' | 'action_amend' | 'action_discarded';

/** Classified signal extracted from a single goal-relevant feed message. */
export interface GoalEventSignal {
  action: GoalEventAction;
  /**
   * Id of the goal action this message concerns: the message's own Id for
   * 'goal'; the amended action's Id (Data.Id) for 'action_amend'; the
   * discarded action's Id (top-level Id) for 'action_discarded'.
   */
  id: number;
  /** True when the inner Confirmed field is exactly true; false otherwise (default). Only meaningful for 'goal'. */
  confirmed: boolean;
  /** Scoring team (1 or 2); null when absent/unknown. */
  participant: number | null;
  /** Feed Ts field (epoch ms); null when absent or not a number. */
  ts: number | null;
  /** Feed Seq field; null when absent or not a number. */
  seq: number | null;
  /** Feed FixtureId field; null when absent or not a number. */
  fixtureId: number | null;
}

/**
 * One goal aggregate, grouping all messages sharing the same Id.
 *
 * The anchor fields (anchorTs, anchorSeq) are pinned to the EARLIEST event
 * for this Id and MUST NOT change after the first ingest (D-03) — the
 * confirm-after-unconfirmed gap can be ~76s in the real feed, and overwriting
 * the anchor with the confirmed event would understate that lead.
 */
export interface GoalAggregate {
  id: number;
  fixtureId: number | null;
  participant: number | null;
  /** Feed Ts of the EARLIEST sighting for this Id — the anchor, never overwritten. */
  anchorTs: number | null;
  /** Feed Seq of the earliest sighting for this Id — the anchor, never overwritten. */
  anchorSeq: number | null;
  /** True once a Confirmed:true 'goal' message has been seen for this Id. */
  confirmed: boolean;
  /** True once an action_discarded has been seen for this Id. */
  discarded: boolean;
}

/** Derived score, always integer-valued. */
export interface DerivedScore {
  participant1: number;
  participant2: number;
}

/** Public interface of the goal store. */
export interface GoalStore {
  /** Ingest a classified goal-relevant signal and update/create its aggregate. */
  ingest: (signal: GoalEventSignal) => GoalAggregate;
  /** Derive the current reconciled score from all ingested aggregates so far. */
  deriveScore: () => DerivedScore;
}

// ── classifyGoalEvent ────────────────────────────────────────────────────────

/**
 * Classify a parsed SSE payload as a goal-relevant event.
 *
 * @param parsed - Already-parsed JSON object (caller must not double-parse).
 * @returns GoalEventSignal for 'goal'/'action_amend' (targeting a goal)/
 *   'action_discarded' messages; null otherwise or on any malformed input.
 */
export function classifyGoalEvent(parsed: Record<string, unknown>): GoalEventSignal | null {
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

    const ts = typeof inner.Ts === 'number' ? inner.Ts : null;
    const seq = typeof inner.Seq === 'number' ? inner.Seq : null;
    const fixtureId = typeof inner.FixtureId === 'number' ? inner.FixtureId : null;

    if (action === 'goal') {
      const id = inner.Id;
      if (typeof id !== 'number') return null;
      const confirmed = inner.Confirmed === true;
      const participant = typeof inner.Participant === 'number' ? inner.Participant : null;
      return { action: 'goal', id, confirmed, participant, ts, seq, fixtureId };
    }

    if (action === 'action_amend') {
      const data = inner.Data;
      if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
      const dataObj = data as Record<string, unknown>;
      // Only amends targeting a previously-sent goal action are relevant here.
      if (dataObj.Action !== 'goal') return null;
      const id = dataObj.Id;
      if (typeof id !== 'number') return null;
      const participant = typeof inner.Participant === 'number' ? inner.Participant : null;
      return { action: 'action_amend', id, confirmed: false, participant, ts, seq, fixtureId };
    }

    if (action === 'action_discarded') {
      // Top-level Id is the id of the discarded action (Id is reused, never fresh).
      const id = inner.Id;
      if (typeof id !== 'number') return null;
      return {
        action: 'action_discarded',
        id,
        confirmed: false,
        participant: null,
        ts,
        seq,
        fixtureId,
      };
    }

    return null;
  } catch {
    // T-02-02-02: never crash the stream on any malformed/hostile input
    return null;
  }
}

// ── createGoalStore ──────────────────────────────────────────────────────────

/**
 * Create a goal store that groups all messages for one goal Id into one
 * aggregate and derives the reconciled score from it.
 *
 * D-03 (ported anchor discipline): the anchor (anchorTs, anchorSeq) is locked
 * to the FIRST sighting for an Id and never updated afterwards.
 *
 * Score derivation: a goal counts exactly once, on the FIRST Confirmed:true
 * 'goal' message for its Id (an already-confirmed first sighting also
 * counts immediately). A later action_discarded for a counted Id reverses the
 * count; a discard for a never-confirmed Id simply prevents it from ever
 * counting.
 */
export function createGoalStore(): GoalStore {
  // goalId -> GoalAggregate (preserved for the store's lifetime)
  const goals = new Map<number, GoalAggregate>();

  function ingest(signal: GoalEventSignal): GoalAggregate {
    let record = goals.get(signal.id);

    if (record === undefined) {
      // First sighting for this Id anchors the goal (D-03: never overwritten later).
      record = {
        id: signal.id,
        fixtureId: signal.fixtureId,
        participant: signal.participant,
        anchorTs: signal.ts,
        anchorSeq: signal.seq,
        confirmed: signal.action === 'goal' && signal.confirmed,
        discarded: false,
      };
      goals.set(signal.id, record);
    }

    switch (signal.action) {
      case 'goal':
        // Confirmed:false -> Confirmed:true on one Id is a single transition,
        // never re-applied (idempotent under duplicate re-delivery / Last-Event-ID resume).
        if (signal.confirmed && !record.confirmed) {
          record.confirmed = true;
        }
        if (record.participant === null && signal.participant !== null) {
          record.participant = signal.participant;
        }
        break;

      case 'action_amend':
        // Amended fields (PlayerId, timestamp, ...) don't impact game state
        // per the message reference — no confirmed/discarded/score change.
        if (record.participant === null && signal.participant !== null) {
          record.participant = signal.participant;
        }
        break;

      case 'action_discarded':
        // Reverses a previously-counted goal; a never-confirmed sighting that
        // gets discarded simply never contributes to the score.
        record.discarded = true;
        break;
    }

    return record;
  }

  function deriveScore(): DerivedScore {
    let participant1 = 0;
    let participant2 = 0;

    for (const record of goals.values()) {
      if (record.confirmed && !record.discarded) {
        if (record.participant === 1) participant1 += 1;
        else if (record.participant === 2) participant2 += 1;
      }
    }

    return { participant1, participant2 };
  }

  return { ingest, deriveScore };
}
