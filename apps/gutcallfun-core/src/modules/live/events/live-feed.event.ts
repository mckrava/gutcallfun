import { GameState } from '../../ingest/state/game-state.types';

/**
 * Post-commit notification fired once per successfully persisted feed message
 * (INGST-03 seam). Emitted by EventIngestService AFTER its transaction has
 * committed and AFTER the state machine has applied the message, from inside
 * the per-game mutex — so consumers see events for one game strictly in feed
 * order.
 *
 * `state` is the LIVE GameState object reference held by GameStateRegistry,
 * not a copy. Consumers must treat it as read-only; mutating it would corrupt
 * the ingest pipeline's own view of the game.
 */
export interface LiveFeedMessage {
  gameId: number;

  /** The raw feed message, exactly as persisted into `game_event.payload`. */
  raw: Record<string, unknown>;

  /**
   * The `game_event` row id this message produced, or null when the insert was
   * a no-op (duplicate `(game_id, Seq)` — the append-only log already had it).
   * A null id means "already seen", and consumers should not re-emit or
   * re-trigger on it.
   */
  eventId: string | null;

  seq: number;
  type: string;
  actionId: number | null;
  participant: number | null;
  statusId: number | null;
  feedTs: Date;

  /** Live registry reference — READ ONLY. */
  state: GameState;
}
