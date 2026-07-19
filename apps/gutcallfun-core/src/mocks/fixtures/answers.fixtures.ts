import { AnswerResponseDto } from '../../modules/api/answers/dto/answer-response.dto';
import { USER_A_ID, USER_B_ID } from './games.fixtures';

/**
 * Deterministic `user_game_answer` rows (D-04). One row (the second) is
 * still unresolved (`awarded_points`/`successful_outcome`/`resolved_at` all
 * null) so the UI can build the pending state.
 *
 * `reward_multiplier` is `numeric(6,3)` in Postgres and the `pg` driver
 * returns numerics as strings — represented here as a JSON number; Phase 5
 * must coerce explicitly at the mapper boundary or the wire type will
 * silently change from number to string once real persistence lands.
 */
export const ANSWERS_FIXTURE: AnswerResponseDto[] = [
  {
    id: '00000000-0000-4000-9000-000000000001',
    user_id: USER_A_ID,
    game_id: 4,
    game_question_id: '00000000-0000-4000-8000-0000000000f2',
    selected_option_id: '00000000-0000-4000-8000-000000000204',
    reward_multiplier: 1,
    awarded_points: 100,
    successful_outcome: true,
    created_at: '2026-07-17T12:41:02.000Z',
    resolved_at: '2026-07-17T12:41:40.000Z',
  },
  {
    id: '00000000-0000-4000-9000-000000000002',
    user_id: USER_A_ID,
    game_id: 3,
    game_question_id: '00000000-0000-4000-8000-0000000000f1',
    selected_option_id: '00000000-0000-4000-8000-000000000103',
    reward_multiplier: 1,
    awarded_points: null,
    successful_outcome: null,
    created_at: '2026-07-18T15:01:07.000Z',
    resolved_at: null,
  },
  {
    id: '00000000-0000-4000-9000-000000000003',
    user_id: USER_B_ID,
    game_id: 5,
    game_question_id: '00000000-0000-4000-8000-0000000000f3',
    selected_option_id: '00000000-0000-4000-8000-000000000302',
    reward_multiplier: 1,
    awarded_points: 0,
    successful_outcome: false,
    created_at: '2026-07-16T12:23:02.000Z',
    resolved_at: '2026-07-16T12:24:00.000Z',
  },
];
