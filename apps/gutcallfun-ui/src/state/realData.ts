"use client";

import type { FixtureCard, LiveGoalVM, LiveHeroVM, LiveMatchVM, LiveWindowVM, MatchSquadPanelVM, RankRow } from "./types";

// A tiny module-level observable holding real, backend-sourced view-model rows
// that OVERRIDE the mock constants when present. The bridge (a hook-driven
// client component, src/components/shell/RealDataBridge) writes here from
// react-query data; MatchController reads it in renderVals() and re-renders on
// change. Kept out of AppState so the simulation reducer stays untouched, and
// out of React context so renderVals() (which runs inside a class render, with
// no hooks) can read it synchronously.
//
// Every slot is optional: undefined means "no real data yet — use the mock".
// This is what keeps SSR and the first client render identical (empty store →
// mock rows on both) so there's no hydration mismatch; the bridge fills it in a
// post-hydration effect and the controller re-renders with real rows.
export interface RealData {
  laterMatches?: FixtureCard[];
  pastMatches?: FixtureCard[];
  // undefined = games not loaded yet; null = loaded, no live game. Both hide the
  // hero — there is no mock fallback for it, so it only ever shows a real game.
  liveHero?: LiveHeroVM | null;
  // The live Match Details view-model (WS-driven). undefined/null = no real live
  // game active → the LiveScreen falls back to the mock simulation fields.
  liveMatch?: LiveMatchVM | null;
  // Open prediction window (WS `question`) and transient goal celebration (WS
  // `game_event` type=goal). null = nothing showing → mock overlay fields.
  liveWindow?: LiveWindowVM | null;
  liveGoal?: LiveGoalVM | null;
  // "YOUR POINTS" for the live match — sum of my answers' awarded points.
  liveDispPts?: string;
  // The currently-live game's id, published by RealDataBridge so other bridges
  // can scope their queries to it without re-deriving "which game is live".
  liveGameId?: number | null;
  // The squad the user picked to duel this match (real squad id) + its panel.
  matchSquadId?: number | null;
  matchSquadPanel?: MatchSquadPanelVM | null;
  rankTop3?: RankRow[];
  rankAround?: RankRow[];
}

let current: RealData = {};
const subscribers = new Set<() => void>();

export function getRealData(): RealData {
  return current;
}

// Shallow-merge a patch and notify subscribers. Pass a slot as undefined-free:
// only the keys present in `patch` are replaced.
export function setRealData(patch: RealData): void {
  current = { ...current, ...patch };
  for (const fn of subscribers) fn();
}

export function subscribeRealData(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
