import { QuestionOptionResponseDto } from '../../modules/api/games/dto/question-option-response.dto';
import { QuestionResponseDto } from '../../modules/api/games/dto/question-response.dto';

/**
 * Deterministic `game_question` rows (D-04), across the `open`, `resolved`
 * and `voided` states, each embedding exactly four options. The four option
 * `base_gain` values (5, 7, 15, 100) mapped to outcome_key fizzles/danger/
 * shot/goal are calibrated on a 1,708-sample corpus and LOCKED
 * project-wide (CLAUDE.md "Game economy") — copied here exactly, never
 * recomputed or adjusted. No non-deterministic random-number,
 * wall-clock-read, or random-id generation anywhere in this file.
 */
function buildOptions(
  questionId: string,
  idPrefix: string,
): QuestionOptionResponseDto[] {
  return [
    {
      id: `${idPrefix}1`,
      game_question_id: questionId,
      outcome_key: 'fizzles',
      base_gain: 5,
      display_order: 1,
    },
    {
      id: `${idPrefix}2`,
      game_question_id: questionId,
      outcome_key: 'danger',
      base_gain: 7,
      display_order: 2,
    },
    {
      id: `${idPrefix}3`,
      game_question_id: questionId,
      outcome_key: 'shot',
      base_gain: 15,
      display_order: 3,
    },
    {
      id: `${idPrefix}4`,
      game_question_id: questionId,
      outcome_key: 'goal',
      base_gain: 100,
      display_order: 4,
    },
  ];
}

const Q1_ID = '00000000-0000-4000-8000-0000000000f1';
const Q2_ID = '00000000-0000-4000-8000-0000000000f2';
const Q3_ID = '00000000-0000-4000-8000-0000000000f3';

const Q1_OPTIONS = buildOptions(Q1_ID, '00000000-0000-4000-8000-00000000010');
const Q2_OPTIONS = buildOptions(Q2_ID, '00000000-0000-4000-8000-00000000020');
const Q3_OPTIONS = buildOptions(Q3_ID, '00000000-0000-4000-8000-00000000030');

export const GAME_QUESTIONS_FIXTURE: QuestionResponseDto[] = [
  {
    id: Q1_ID,
    game_id: 3,
    trigger_event_id: '00000000-0000-4000-8000-000000000003',
    resolution_event_id: null,
    question_type: 'attack_outcome',
    content: 'How far will this attack go?',
    participant: 1,
    state: 'open',
    resolved_option_id: null,
    answer_window_ttl: 5,
    expires_at: '2026-07-18T15:01:10.000Z',
    created_at: '2026-07-18T15:01:05.000Z',
    resolved_at: null,
    options: Q1_OPTIONS,
  },
  {
    id: Q2_ID,
    game_id: 4,
    trigger_event_id: '00000000-0000-4000-8000-000000000201',
    resolution_event_id: '00000000-0000-4000-8000-000000000202',
    question_type: 'attack_outcome',
    content: 'How far will this attack go?',
    participant: 1,
    state: 'resolved',
    resolved_option_id: Q2_OPTIONS[3].id,
    answer_window_ttl: 5,
    expires_at: '2026-07-17T12:41:05.000Z',
    created_at: '2026-07-17T12:41:00.000Z',
    resolved_at: '2026-07-17T12:41:40.000Z',
    options: Q2_OPTIONS,
  },
  {
    id: Q3_ID,
    game_id: 5,
    trigger_event_id: '00000000-0000-4000-8000-000000000301',
    resolution_event_id: null,
    question_type: 'attack_outcome',
    content: 'How far will this attack go?',
    participant: 2,
    state: 'voided',
    resolved_option_id: null,
    answer_window_ttl: 5,
    expires_at: '2026-07-16T12:23:05.000Z',
    created_at: '2026-07-16T12:23:00.000Z',
    resolved_at: null,
    options: Q3_OPTIONS,
  },
];
