/**
 * Defensive source-agnostic normalizer (INGST-03, INGST-05).
 *
 * Maps any raw TxLINE feed message — the flat shape delivered by the live
 * SSE stream, or the Fusion-style `{Update:{...}}` envelope (historical
 * fetch / replay source material) — to the exact `game_event` entity column
 * shape. Uses the same defensive `raw.Update ?? raw` inner-field read as
 * possession.ts/goals.ts (Plan 02) so it tolerates both shapes identically.
 *
 * Never throws (T-02-03-01 DoS guard):
 *  - An unknown `Action` (or an open-set `StatusId`, e.g. 100 observed in the
 *    wild) still produces a valid row — `type` is set to the raw, unrecognized
 *    Action string and the full message is stored as `payload`. The
 *    state machine (Task 2) is what "ignores" an unrecognized Action; the log
 *    itself is append-only and unconditional.
 *  - A genuinely malformed message (non-object, or missing/non-numeric
 *    `Seq`/`Ts`) cannot produce an insertable row — `seq` and `feed_ts` are
 *    NOT NULL columns on `game_event` — so it is flagged `ignorable: true`
 *    (do not insert) instead of throwing or inserting a broken row.
 *
 * Also extracts the INGST-05 lazy-fill patch: `jersey`/`status`/
 * `score_adjustment`/`goal` messages carry data that opportunistically fills
 * columns on the `game` row as they arrive over the course of a match.
 */

import { Injectable } from '@nestjs/common';

/**
 * Exact game_event column shape this module produces. Matches
 * GameEventEntity's property names for every column EXCEPT `gameId` (set by
 * the caller, not present on a single raw message) and `receivedAt` (DB
 * default `now()` — never set here).
 */
export interface NormalizedGameEvent {
  type: string;
  payload: Record<string, unknown>;
  actionId: number | null;
  seq: number;
  confirmed: boolean | null;
  participant: number | null;
  statusId: number | null;
  feedTs: Date;
}

export interface NormalizeResult {
  /**
   * True when the raw message could not produce an insertable row (missing
   * or non-numeric Seq/Ts, or non-object input) — never insert, never throw.
   * False for every recognized OR unrecognized Action that has valid Seq/Ts.
   */
  ignorable: boolean;
  /** The normalized row, or null when ignorable is true. */
  event: NormalizedGameEvent | null;
}

/**
 * Partial game-row patch extracted from a single lazy-fill-relevant message
 * (INGST-05). Property names match GameEntity's column property names.
 */
export interface GameLazyFillPatch {
  team1JerseyColor?: string;
  team2JerseyColor?: string;
  currentStatusId?: number;
  scoreP1?: number;
  scoreP2?: number;
}

/**
 * Feed-transit staleness threshold (RESEARCH Pitfall 6): TxLINE's SL=1 tier
 * silently delays delivery by ~60s instead of the expected ~130-140ms. The
 * SERVICE_LEVEL_ID=12 boot assertion (Plan 01) is the primary guard; this is
 * a secondary runtime signal in case the feed silently regrades mid-stream.
 */
export const STALENESS_THRESHOLD_MS = 55_000;

@Injectable()
export class MessageNormalizer {
  /**
   * Normalize a raw feed message into the game_event insert shape.
   * Defensive: never throws. A non-object/null payload, or one missing a
   * numeric Action/Seq/Ts, is flagged ignorable (not inserted) rather than
   * crashing the stream.
   */
  normalize(raw: unknown): NormalizeResult {
    try {
      const inner = this.innerOf(raw);
      if (inner === null) {
        return { ignorable: true, event: null };
      }

      const action = inner.Action;
      const seq = inner.Seq;
      const ts = inner.Ts;

      if (typeof action !== 'string' || typeof seq !== 'number' || typeof ts !== 'number') {
        // Malformed / missing required fields — cannot form an insertable
        // row (seq/feed_ts are NOT NULL). Nothing valid to store-and-ignore.
        return { ignorable: true, event: null };
      }

      const actionId = typeof inner.Id === 'number' ? inner.Id : null;
      const confirmed = typeof inner.Confirmed === 'boolean' ? inner.Confirmed : null;
      const participant = typeof inner.Participant === 'number' ? inner.Participant : null;
      const statusId = typeof inner.StatusId === 'number' ? inner.StatusId : null;

      return {
        ignorable: false,
        event: {
          type: action,
          payload: raw as Record<string, unknown>,
          actionId,
          seq,
          confirmed,
          participant,
          statusId,
          feedTs: new Date(ts),
        },
      };
    } catch {
      // T-02-03-01: never crash the stream on any malformed/hostile input.
      return { ignorable: true, event: null };
    }
  }

  /**
   * Extract the INGST-05 lazy-fill patch for jersey/status/score_adjustment/
   * goal messages. Returns null for any other Action or malformed input.
   *
   * - jersey: `Data.Color` -> team1/2_jersey_color, selected by `Participant`.
   * - status: `Data.StatusId` -> current_status_id.
   * - score_adjustment: top-level `Score.Participant{1,2}.Total.Goals` ->
   *   score_p1/p2 — authoritative resync, always applied (score_adjustment
   *   is confirmed automatically, per message-reference.md, so there is no
   *   pending-confirmation gate to honor here).
   * - goal: top-level `Score.Participant{1,2}.Total.Goals` -> score_p1/p2 —
   *   ONLY applied once `Confirmed:true`, mirroring goals.ts's
   *   deriveScore() count-on-first-confirm discipline (an unconfirmed
   *   goal's Score must not prematurely denormalize onto the game row).
   */
  lazyFillPatch(raw: unknown): GameLazyFillPatch | null {
    try {
      const inner = this.innerOf(raw);
      if (inner === null) return null;

      const action = inner.Action;
      if (typeof action !== 'string') return null;

      if (action === 'jersey') {
        return this.jerseyPatch(inner);
      }
      if (action === 'status') {
        return this.statusPatch(inner);
      }
      if (action === 'score_adjustment') {
        return this.extractScorePatch(inner);
      }
      if (action === 'goal') {
        if (inner.Confirmed !== true) return null;
        return this.extractScorePatch(inner);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Runtime SL=1 staleness check (RESEARCH Pitfall 6): true when feed
   * transit (receivedAt - Ts) exceeds STALENESS_THRESHOLD_MS.
   */
  isStale(feedTs: number, receivedAt: number): boolean {
    return receivedAt - feedTs > STALENESS_THRESHOLD_MS;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Defensive inner-field read: `raw.Update ?? raw`, same convention as possession.ts/goals.ts. */
  private innerOf(raw: unknown): Record<string, unknown> | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const asObj = raw as Record<string, unknown>;
    const inner = (asObj.Update ?? asObj) as unknown;
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return null;
    return inner as Record<string, unknown>;
  }

  private jerseyPatch(inner: Record<string, unknown>): GameLazyFillPatch | null {
    const data = inner.Data as Record<string, unknown> | undefined;
    const color = data?.Color;
    const participant = inner.Participant;
    if (typeof color !== 'string' || typeof participant !== 'number') return null;
    if (participant === 1) return { team1JerseyColor: color };
    if (participant === 2) return { team2JerseyColor: color };
    return null;
  }

  private statusPatch(inner: Record<string, unknown>): GameLazyFillPatch | null {
    const data = inner.Data as Record<string, unknown> | undefined;
    const statusId = data?.StatusId;
    if (typeof statusId !== 'number') return null;
    return { currentStatusId: statusId };
  }

  private extractScorePatch(inner: Record<string, unknown>): GameLazyFillPatch | null {
    const score = inner.Score;
    if (score === null || typeof score !== 'object' || Array.isArray(score)) return null;
    const scoreObj = score as Record<string, unknown>;
    const p1 = this.extractTotalGoals(scoreObj.Participant1);
    const p2 = this.extractTotalGoals(scoreObj.Participant2);
    const patch: GameLazyFillPatch = {};
    if (p1 !== null) patch.scoreP1 = p1;
    if (p2 !== null) patch.scoreP2 = p2;
    return Object.keys(patch).length > 0 ? patch : null;
  }

  private extractTotalGoals(participant: unknown): number | null {
    if (participant === null || typeof participant !== 'object' || Array.isArray(participant)) {
      return null;
    }
    const total = (participant as Record<string, unknown>).Total;
    if (total === null || typeof total !== 'object' || Array.isArray(total)) return null;
    const goals = (total as Record<string, unknown>).Goals;
    return typeof goals === 'number' ? goals : null;
  }
}
