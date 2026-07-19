// Client-side mirror of the gutcallfun-core wire contract (Phase 02.1 DTOs).
// Field names are snake_case, exactly as they arrive on the wire — no camelCase
// remapping here, so these types can never silently drift from the backend.
// Any UI-friendly reshaping happens later in dedicated adapters, not here.

// ---------------------------------------------------------------------------
// Enums (string unions matching the wire values)
// ---------------------------------------------------------------------------

export type GameStatus = "scheduled" | "live" | "finished" | "cancelled";
export type QuestionState = "open" | "pending_confirmation" | "resolved" | "voided";
export type QuestionType = "attack_outcome" | "static";
export type PossessionStage =
  | "SafePossession"
  | "AttackPossession"
  | "DangerPossession"
  | "HighDangerPossession";
/** Backend outcome ladder keys (NOT the mock's fizzle/chance/big/goal). */
export type OutcomeKey = "fizzles" | "danger" | "shot" | "goal";

// ---------------------------------------------------------------------------
// Pagination envelope: { items, total, limit, offset }
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// The game-event log is an append-only stream ordered by a per-game monotonic
// `seq`, so it pages by a seq cursor, not offset — `next_seq` is the seq of the
// last item, or null when the log has no further events past this page.
export interface SeqPage<T> {
  items: T[];
  next_seq: number | null;
}

// ---------------------------------------------------------------------------
// REST response DTOs
// ---------------------------------------------------------------------------

export interface Game {
  id: number;
  fixture_id: number;
  status: GameStatus;
  starts_at: string | null;
  participant1_id: number | null;
  participant2_id: number | null;
  participant1_is_home: boolean;
  team1_name: string | null;
  team2_name: string | null;
  competition: string | null;
  fixture_group_id: number | null;
  team1_jersey_color: string | null;
  team2_jersey_color: string | null;
  current_status_id: number | null;
  score_p1: number;
  score_p2: number;
  is_replay: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface QuestionOption {
  id: string;
  game_question_id: string;
  outcome_key: OutcomeKey;
  /** LOCKED calibrated ladder value: 5 | 7 | 15 | 100. */
  base_gain: number;
  /** Stable display ordering 1-4. */
  display_order: number;
}

export interface Question {
  id: string;
  game_id: number;
  trigger_event_id: string | null;
  resolution_event_id: string | null;
  question_type: QuestionType;
  content: string;
  /** Attacking team (1 | 2 | null). */
  participant: number | null;
  state: QuestionState;
  resolved_option_id: string | null;
  /** Answer window length in seconds. */
  answer_window_ttl: number;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
  /** Always exactly four options. */
  options: QuestionOption[];
}

export interface GameParticipant {
  user_id: string;
  handle: string | null;
  emoji: string | null;
  image: string | null;
  joined_at: string;
}
export interface UserGame {
  game_id: number;
  user_id: string;
  squad_id: number | null;
  joined_at: string;
}

export interface GameEvent {
  id: string;
  game_id: number;
  type: string;
  payload: Record<string, unknown>;
  action_id: number | null;
  seq: number;
  confirmed: boolean | null;
  participant: number | null;
  status_id: number | null;
  feed_ts: string;
  received_at: string;
}

export interface Answer {
  id: string;
  user_id: string;
  game_id: number;
  game_question_id: string;
  selected_option_id: string;
  reward_multiplier: number;
  /** Null until the question resolves. */
  awarded_points: number | null;
  successful_outcome: boolean | null;
  created_at: string;
  resolved_at: string | null;
}

export interface User {
  id: string;
  wallet_address: string;
  share_code: string;
  handle: string;
  image: string | null;
  emoji: string | null;
  /** FK -> user_score_profile.id (points AT the profile row). */
  score_profile: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface UserScoreProfile {
  id: string;
  total_points: number;
  games_played: number;
  updated_at: string | null;
}

export interface Squad {
  id: number;
  name: string;
  image: string | null;
  emoji: string | null;
  member_count: number;
  invite_code: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface SquadParticipant {
  squad_id: number;
  user_id: string;
  active: boolean;
  // Denormalised member profile (from the backend join).
  handle: string | null;
  emoji: string | null;
  image: string | null;
  total_points: number;
  score_profile: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface SquadScoreProfile {
  id: string;
  total_points: number;
  games_played: number;
  updated_at: string | null;
}

export interface LeaderboardEntry {
  user_id: string;
  handle: string;
  image: string | null;
  emoji: string | null;
  total_points: number;
  rank: number;
}

export interface QuestionOutcome {
  key: string;
  content: string;
  ladder_position: number;
}

// ---------------------------------------------------------------------------
// REST request DTOs
// ---------------------------------------------------------------------------

// The answering/joining user comes from the session (@CurrentUser on the
// backend), so no user_id is sent — matches CreateAnswerDto / JoinGameDto.
export interface CreateAnswerBody {
  game_question_id: string;
  selected_option_id: string;
}

export interface JoinGameBody {
  squad_id?: number;
}

// No POST /users — registration is /auth/register. Profile edits go through
// PATCH /users/me (handle/avatar only), so the body carries no identity.
export interface UpdateUserBody {
  handle?: string;
  image?: string;
}

export interface CreateSquadBody {
  name: string;
  emoji?: string;
  image?: string;
  invite_code?: string;
}
export interface JoinSquadBody {
  invite_code: string;
}
export interface ListSquadsQuery extends PaginationQuery {
  participant_id?: string;
}
export interface ListUsersQuery extends PaginationQuery {
  handle?: string;
}

export interface CreateSquadParticipantBody {
  user_id: string;
}

export interface PaginationQuery {
  limit?: number;
  offset?: number;
}

// GET /answers is always "my answers" (session-scoped); no user_id filter.
export interface ListAnswersQuery extends PaginationQuery {
  game_id?: number;
}

// GET /games/:id/events — seq-cursor paging (NOT offset). Omit after_seq to
// start from the beginning; limit defaults to 20 on the backend.
export interface ListGameEventsQuery {
  after_seq?: number;
  limit?: number;
}

// GET /games/:id/questions — returns a bare array, optionally filtered by state.
export interface ListQuestionsQuery {
  state?: QuestionState;
}

// ---------------------------------------------------------------------------
// Auth (BFF). Tokens never reach the browser — these are the sanitized shapes
// the Next server returns after capturing the JWT server-side.
// ---------------------------------------------------------------------------

/** POST /auth/challenge response — the SIWS message the wallet must sign. */
export interface ChallengeResponse {
  message: string;
  nonce: string;
  expires_at: string;
}

/** POST /auth/verify request body. */
export interface VerifyBody {
  wallet_address: string;
  nonce: string;
  signature: string;
}

/** BFF-sanitized verify result: an existing user is signed in; a new wallet
 *  must pick a handle. No tokens here — they stay on the server. */
export type VerifyResult =
  | { status: "authenticated"; user: User }
  | { status: "registration_required" };

// ---------------------------------------------------------------------------
// WebSocket message DTOs (server -> client) + subscribe payload
// ---------------------------------------------------------------------------

export interface MatchClock {
  current_status_id: number | null;
  last_feed_ts: string | null;
  period_started_feed_ts: string | null;
  /** Integer milliseconds — never a float, never a preformatted string. */
  elapsed_ms: number | null;
}

export interface Snapshot {
  game_id: number;
  score_p1: number;
  score_p2: number;
  possession_stage: PossessionStage | null;
  clock: MatchClock;
  active_question: Question | null;
  is_mock: boolean;
}

export interface GameEventMessage {
  id: string;
  game_id: number;
  type: string;
  action_id: number | null;
  seq: number;
  confirmed: boolean | null;
  participant: number | null;
  status_id: number | null;
  feed_ts: string;
  is_mock: boolean;
}

/** `question` event = QuestionResponseDto + is_mock. */
export type QuestionMessage = Question & { is_mock: boolean };

export interface ResolutionMessage {
  game_question_id: string;
  resolved_option_id: string;
  resolved_outcome_key: OutcomeKey;
  /** The resolved option's own base_gain (5 | 7 | 15 | 100). */
  awarded_points: number;
  successful_outcome: boolean;
  resolved_at: string;
  is_mock: boolean;
}

export interface VoidMessage {
  game_question_id: string;
  voided_at: string;
  reason: string;
  is_mock: boolean;
}

/** Client -> server payload for both `subscribe` and `unsubscribe`. */
export interface SubscribePayload {
  game_id: number;
}

// ---------------------------------------------------------------------------
// Typed socket.io event maps
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  snapshot: (payload: Snapshot) => void;
  game_event: (payload: GameEventMessage) => void;
  question: (payload: QuestionMessage) => void;
  resolution: (payload: ResolutionMessage) => void;
  void: (payload: VoidMessage) => void;
}

export interface ClientToServerEvents {
  subscribe: (payload: SubscribePayload) => void;
  unsubscribe: (payload: SubscribePayload) => void;
}
