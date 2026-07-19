/**
 * Pure WNDW-01 trigger decision + resolution floor seed (quick task 260719-m7e).
 *
 * Broadens the window-open edge from strictly `safe -> attack` to any
 * ASCENDING transition into an attacking stage (`attack`, `danger`, or
 * `high_danger`) — LD-1 — and derives the resolution high-water floor from
 * that same triggering stage — LD-2 — so a window opened at `danger`/
 * `high_danger` resolves to the `danger` rung instead of understating to
 * `fizzles`.
 *
 * Pure module: no NestJS DI, no I/O. The explicit stage ordering lives ONLY
 * here — callers must go through these two functions rather than
 * reimplementing the ranking, so there is exactly one place that can get the
 * ordering wrong.
 */

import { PossessionStage } from '../ingest/state/possession';
import { Rung } from './live.constants';

/**
 * Explicit ascending order of possession stages, LD-1. NOT exported — callers
 * must go through isAscendingAttackEdge/seedRungForStage rather than
 * reimplementing the ranking themselves.
 */
const STAGE_RANK: Readonly<Record<PossessionStage, number>> = Object.freeze({
  safe: 0,
  attack: 1,
  danger: 2,
  high_danger: 3,
});

/** Rank of `attack`, the lowest rank that counts as "attacking". */
const ATTACK_RANK = STAGE_RANK.attack;

/**
 * True iff `current` is an attacking stage (attack/danger/high_danger) AND
 * its rank is strictly greater than `prior`'s rank — i.e. an ASCENDING edge
 * into an attacking stage, never a flat repeat or a descent.
 *
 * `prior` is `null` on first contact for a game (STAT-01 empty edge) or any
 * unrecognised string (defensive — T-m7e-01): both are treated as rank -1,
 * below `safe`, so the very first attacking message for a game always fires
 * (LD-1) and a corrupt/garbage prior can never spuriously suppress a real
 * ascending edge.
 *
 * `current` always comes from `classifyPossession`, so it is always one of
 * the four real `PossessionStage` values — `STAGE_RANK[current]` is always
 * defined.
 */
export function isAscendingAttackEdge(
  prior: string | null,
  current: PossessionStage,
): boolean {
  const currentRank = STAGE_RANK[current];
  if (currentRank < ATTACK_RANK) return false;

  const priorRank =
    prior !== null && Object.prototype.hasOwnProperty.call(STAGE_RANK, prior)
      ? STAGE_RANK[prior as PossessionStage]
      : -1;

  return currentRank > priorRank;
}

/**
 * Derives the resolution high-water floor (LD-2) from the stage that
 * triggered a window's open. `danger`/`high_danger` seed `'danger'`; every
 * other attacking stage (`attack`) seeds `'fizzles'`. Never returns
 * `'shot'`/`'goal'` — those require a real shot/goal event, not a possession
 * reading — which is exactly what keeps `OpenWindow.possessionRung`'s
 * `Extract<Rung, 'fizzles' | 'danger'>` type honest with no cast needed.
 */
export function seedRungForStage(
  stage: PossessionStage,
): Extract<Rung, 'fizzles' | 'danger'> {
  return stage === 'danger' || stage === 'high_danger' ? 'danger' : 'fizzles';
}
