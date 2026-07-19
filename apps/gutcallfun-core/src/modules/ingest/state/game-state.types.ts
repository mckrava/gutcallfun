// Shared, source-agnostic per-game in-memory state shape (STAT-01).
// Populated identically whether the feed is live SSE or a replay emitter
// (D-02: downstream code is replay-unaware). Mutated by the Phase-3 state
// machine (ported possession.ts/goals.ts); this phase only defines the
// shape + the initial-state factory.

// Danger ladder possession stage — mirrors the four staged `PossessionType`
// values on the wire (txodds-api skill, message-reference.md). `null` means
// no possession stage has been observed yet for this game.
export type PossessionStage =
  | 'SafePossession'
  | 'AttackPossession'
  | 'DangerPossession'
  | 'HighDangerPossession'
  | null;

export interface GameState {
  gameId: number;

  // Denormalized score, mirrors game.score_p1/score_p2 (score_adjustment is
  // the authoritative resync source per INGST-05).
  score1: number;
  score2: number;

  // Current TxLINE StatusId — open set (100+ observed values), never a
  // closed enum (RESEARCH.md). null until the first status message arrives.
  currentStatusId: number | null;

  // Current possession danger stage.
  possessionStage: PossessionStage;

  // Attack-run bookkeeping placeholders (12s attack debounce, high-water
  // mark tracking) — filled in by the Phase-3 state machine (possession.ts
  // port). Kept here now so the shape is frozen for downstream plans.
  attackRunActive: boolean;
  attackRunHighWaterStage: PossessionStage;
  lastDangerFeedTs: number | null;

  // Two-clock discipline (STAT-03): lastFeedTs is the event Ts (match-time
  // clock, ms epoch) of the most recently processed message for this game.
  lastFeedTs: number | null;

  // Last persisted Seq for this game's current connection (gap detection,
  // D-13/RCVR-02). Seq is per-ConnectionId monotonic, not globally
  // monotonic — connectionId must be tracked alongside it (Pitfall 7).
  lastSeq: number | null;
  connectionId: string | null;
}

export function createInitialGameState(gameId: number): GameState {
  return {
    gameId,
    score1: 0,
    score2: 0,
    currentStatusId: null,
    possessionStage: null,
    attackRunActive: false,
    attackRunHighWaterStage: null,
    lastDangerFeedTs: null,
    lastFeedTs: null,
    lastSeq: null,
    connectionId: null,
  };
}
