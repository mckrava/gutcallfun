import { GameQuestionEntity } from '../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../models/game/game-question-option.entity';
import { QuestionOptionResponseDto } from '../api/games/dto/question-option-response.dto';
import { QuestionResponseDto } from '../api/games/dto/question-response.dto';
import { GameEventMessageDto } from '../realtime/dto/game-event-message.dto';
import { QuestionMessageDto } from '../realtime/dto/question-message.dto';
import { LiveFeedMessage } from './events/live-feed.event';

/**
 * Entity -> frozen wire DTO mapping for the live loop.
 *
 * The wire contract (docs/WS-CONTRACT.md) is FROZEN — a UI is being built
 * against it right now. Every field name, type and nullability below is
 * identical to what the mock fixtures emitted; only the data source changed,
 * and `is_mock` flips to false because the data is real.
 *
 * PG DRIVER NOTE: node-postgres returns `numeric` and `bigint` columns as
 * STRINGS. Nothing on these two payloads is numeric/bigint (`base_gain` and
 * `display_order` are plain `int`, which comes back as a JS number), but any
 * field added here that maps to numeric/bigint must be coerced explicitly or
 * the wire type will silently change from number to string.
 */

function optionToDto(
  option: GameQuestionOptionEntity,
): QuestionOptionResponseDto {
  return {
    id: option.id,
    game_question_id: option.gameQuestionId,
    outcome_key: option.outcomeKey,
    // Read back from the stored row — the value frozen at open time for THIS
    // question instance. Never recomputed from the ladder table.
    base_gain: option.baseGain,
    display_order: option.displayOrder,
  };
}

export function toQuestionResponseDto(
  question: GameQuestionEntity,
  options: GameQuestionOptionEntity[],
): QuestionResponseDto {
  return {
    id: question.id,
    game_id: question.gameId,
    trigger_event_id: question.triggerEventId,
    resolution_event_id: question.resolutionEventId,
    question_type: question.questionType,
    content: question.content,
    participant: question.participant,
    state: question.state,
    resolved_option_id: question.resolvedOptionId,
    answer_window_ttl: question.answerWindowTtl,
    expires_at: question.expiresAt.toISOString(),
    created_at: question.createdAt.toISOString(),
    resolved_at:
      question.resolvedAt === null ? null : question.resolvedAt.toISOString(),
    options: [...options]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(optionToDto),
  };
}

export function toQuestionMessageDto(
  question: GameQuestionEntity,
  options: GameQuestionOptionEntity[],
): QuestionMessageDto {
  return {
    ...toQuestionResponseDto(question, options),
    // Real data now — derived from a live TxLINE attack, not a synthetic timer.
    is_mock: false,
  };
}

/**
 * A real persisted `game_event` row, as pushed to subscribers. Replaces the
 * former 4s synthetic heartbeat: this now fires once per actual feed message.
 * The unbounded raw body is deliberately excluded (fetch it via
 * `GET /games/:game_id/events` if needed) — same as the mock.
 */
export function toGameEventMessageDto(
  message: LiveFeedMessage,
): GameEventMessageDto | null {
  // A null eventId means the insert was an orIgnore no-op: this exact
  // (game_id, Seq) was already in the append-only log. Re-pushing it would
  // duplicate an event the client has already rendered.
  if (message.eventId === null) return null;

  return {
    id: message.eventId,
    game_id: message.gameId,
    type: message.type,
    action_id: message.actionId,
    seq: message.seq,
    confirmed: readConfirmed(message.raw),
    participant: message.participant,
    status_id: message.statusId,
    feed_ts: message.feedTs.toISOString(),
    is_mock: false,
  };
}

/** Defensive inner-field read: `raw.Update ?? raw`, the convention used across possession.ts/goals.ts. */
function readConfirmed(raw: Record<string, unknown>): boolean | null {
  try {
    const inner = (raw.Update ?? raw) as unknown;
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner))
      return null;
    const confirmed = (inner as Record<string, unknown>).Confirmed;
    return typeof confirmed === 'boolean' ? confirmed : null;
  } catch {
    return null;
  }
}
