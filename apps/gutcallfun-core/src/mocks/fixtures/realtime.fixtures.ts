import { randomUUID } from 'crypto';
import { feedElapsedMs } from '../../modules/ingest/state/clock';
import { MatchClockDto } from '../../modules/realtime/dto/match-clock.dto';
import { SnapshotDto } from '../../modules/realtime/dto/snapshot.dto';
import { GameEventMessageDto } from '../../modules/realtime/dto/game-event-message.dto';
import { QuestionMessageDto } from '../../modules/realtime/dto/question-message.dto';
import { ResolutionMessageDto } from '../../modules/realtime/dto/resolution-message.dto';
import { QuestionOptionResponseDto } from '../../modules/api/games/dto/question-option-response.dto';

/**
 * Deterministic builders (D-04) for the fake WS cycle: a full `snapshot` on
 * subscribe, a `game_event` heartbeat every ~4s, a `question` every ~30s
 * carrying the four LOCKED options, and its `resolution` ~5s later (D-03).
 *
 * All field values are literal and fixed except the two time-derived fields
 * D-04 explicitly exempts (`expires_at` on a question, `resolved_at` on a
 * resolution) plus the emission-instant `feed_ts` on a heartbeat, which is
 * inherently "now" for a continuously-running push stream rather than a
 * cacheable REST response body. Event/question/option ids are freshly
 * generated per emission via `crypto.randomUUID()` — matching how a real
 * feed mints a fresh id for every new event row, and the project's own
 * stack guidance to prefer the native `crypto.randomUUID()` over a uuid
 * package. This is not the per-request-body randomness D-04 forbids: the
 * *shape* and non-identifier field values never vary.
 *
 * This module lives outside `src/modules/realtime/` and is exempt from that
 * module's zero-ingest-imports isolation rule (the rule's acceptance
 * criteria are scoped to `src/modules/realtime/` specifically) — it reuses
 * `feedElapsedMs`, a pure, dependency-free helper with no NestJS DI and no
 * I/O, exactly as the real ingest code does. No other primitive from
 * `src/modules/ingest` or `src/models` is imported here.
 */

// D-07 flagged assumption: no `period_started_feed_ts` anchor exists yet in
// GameState. Fixed, deterministic period-start/last-feed pair so
// `elapsed_ms` is a stable, reproducible derived value (723000 ms).
const PERIOD_STARTED_FEED_TS = '2026-07-18T15:00:00.000Z';
const LAST_FEED_TS = '2026-07-18T15:12:03.000Z';

function buildMatchClock(): MatchClockDto {
  const periodStartedMs = Date.parse(PERIOD_STARTED_FEED_TS);
  const lastFeedMs = Date.parse(LAST_FEED_TS);
  return {
    current_status_id: 4,
    last_feed_ts: LAST_FEED_TS,
    period_started_feed_ts: PERIOD_STARTED_FEED_TS,
    elapsed_ms: feedElapsedMs(periodStartedMs, lastFeedMs),
  };
}

/**
 * The `snapshot` message emitted immediately on `subscribe`. `active_question`
 * is always `null` here: the gateway emits this synchronously after the room
 * join, before `startCycleForRoom` has had a chance to fire a first
 * `question` — the must_have truth this satisfies is that a snapshot never
 * carries a stale or synthesized in-flight question.
 */
export function buildSnapshot(gameId: number): SnapshotDto {
  return {
    game_id: gameId,
    score_p1: 1,
    score_p2: 0,
    possession_stage: 'AttackPossession',
    clock: buildMatchClock(),
    active_question: null,
    is_mock: true,
  };
}

/** The `game_event` heartbeat message, emitted every ~4s (D-03). */
export function buildGameEvent(gameId: number, seq: number): GameEventMessageDto {
  return {
    id: randomUUID(),
    game_id: gameId,
    type: 'attack_possession',
    action_id: null,
    seq,
    confirmed: null,
    participant: 1,
    status_id: 4,
    feed_ts: new Date().toISOString(),
    is_mock: true,
  };
}

function buildOptions(questionId: string): QuestionOptionResponseDto[] {
  return [
    {
      id: randomUUID(),
      game_question_id: questionId,
      outcome_key: 'fizzles',
      base_gain: 5,
      display_order: 1,
    },
    {
      id: randomUUID(),
      game_question_id: questionId,
      outcome_key: 'danger',
      base_gain: 7,
      display_order: 2,
    },
    {
      id: randomUUID(),
      game_question_id: questionId,
      outcome_key: 'shot',
      base_gain: 15,
      display_order: 3,
    },
    {
      id: randomUUID(),
      game_question_id: questionId,
      outcome_key: 'goal',
      base_gain: 100,
      display_order: 4,
    },
  ];
}

/**
 * The `question` message, emitted every ~30s (D-03), carrying exactly four
 * options whose `base_gain` values are the LOCKED 5/7/15/100 ladder and an
 * `expires_at` ~5s in the future — the deliberate D-04 exception.
 */
export function buildQuestion(gameId: number): QuestionMessageDto {
  const questionId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5_000);

  return {
    id: questionId,
    game_id: gameId,
    trigger_event_id: null,
    resolution_event_id: null,
    question_type: 'attack_outcome',
    content: 'How far will this attack go?',
    participant: 1,
    state: 'open',
    resolved_option_id: null,
    answer_window_ttl: 5,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
    resolved_at: null,
    options: buildOptions(questionId),
    is_mock: true,
  };
}

/**
 * The `resolution` message, emitted ~5s after its correlated `question`
 * (D-03). `resolved_option_id` is always selected from `question.options`,
 * so a resolution can never reference an option belonging to a different
 * question. Deterministically resolves to the `shot` rung.
 */
export function buildResolution(
  gameId: number,
  question: QuestionMessageDto,
): ResolutionMessageDto {
  void gameId; // gameId is carried on the question itself; kept for call-site symmetry with the other builders.
  const resolvedOption =
    question.options.find((option) => option.outcome_key === 'shot') ??
    question.options[question.options.length - 1];

  return {
    game_question_id: question.id,
    resolved_option_id: resolvedOption.id,
    resolved_outcome_key: resolvedOption.outcome_key,
    awarded_points: resolvedOption.base_gain,
    successful_outcome: true,
    resolved_at: new Date().toISOString(),
    is_mock: true,
  };
}
