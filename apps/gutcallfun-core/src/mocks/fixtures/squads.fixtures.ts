/**
 * Deterministic `squad` + `squad_participant` + `squad_score_profile` fixture
 * constants (D-04: no per-request randomness). Field names are literal
 * snake_case matching the `squad`, `squad_participant`, and
 * `squad_score_profile` tables in initial-db-structure.sql 1:1.
 *
 * All identities are obviously synthetic — squad names/invite codes are
 * prefixed `Mock`/`GCSQ-` and reference the synthetic users declared in
 * `users.fixtures.ts`.
 *
 * Phase 5 note: `squad.id` is declared `@PrimaryColumn` in
 * `src/models/squad/squad.entity.ts` with NO database default (unlike
 * `game.id`, which is `GENERATED ALWAYS AS IDENTITY`). Real squad creation
 * needs an app-level id-assignment strategy — a Postgres sequence added by
 * migration, or a `MAX(id)+1` query guarded by a unique-violation retry loop
 * — the database will not assign this id for you. `nextSquadId()` below is
 * the deterministic, fixture-only stand-in for that strategy this phase.
 */

export interface SquadFixture {
  id: number;
  name: string;
  image: string | null;
  invite_code: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface SquadParticipantFixture {
  squad_id: number;
  user_id: string;
  active: boolean;
  score_profile: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface SquadScoreProfileFixture {
  id: string;
  total_points: number;
  games_played: number;
  updated_at: string | null;
}

export const SQUADS_FIXTURE: readonly SquadFixture[] = Object.freeze([
  Object.freeze({
    id: 1001,
    name: 'Mock Squad Alpha',
    image: 'seed:mock-squad-alpha',
    invite_code: 'GCSQ-ALPHA1',
    active: true,
    created_at: '2026-07-05T10:00:00.000Z',
    updated_at: '2026-07-11T10:00:00.000Z',
    deleted_at: null,
  }),
  // Deliberately zero participants (see SQUAD_PARTICIPANTS_FIXTURE below) so
  // the empty-participants-list path is exercisable.
  Object.freeze({
    id: 1002,
    name: 'Mock Squad Beta (Empty)',
    image: null,
    invite_code: 'GCSQ-BETA02',
    active: true,
    created_at: '2026-07-06T10:00:00.000Z',
    updated_at: null,
    deleted_at: null,
  }),
]);

// squad 1001 has two participants (users 1 and 2 from users.fixtures.ts);
// squad 1002 intentionally has none.
export const SQUAD_PARTICIPANTS_FIXTURE: readonly SquadParticipantFixture[] = Object.freeze([
  Object.freeze({
    squad_id: 1001,
    user_id: '00000000-0000-4000-8000-000000000001',
    active: true,
    score_profile: 'ssp_mock_0001',
    created_at: '2026-07-05T10:05:00.000Z',
    deleted_at: null,
  }),
  Object.freeze({
    squad_id: 1001,
    user_id: '00000000-0000-4000-8000-000000000002',
    active: true,
    score_profile: null,
    created_at: '2026-07-06T11:00:00.000Z',
    deleted_at: null,
  }),
]);

// `squad_score_profile.id` is the varchar PK that
// `squad_participant.score_profile` points AT — the FK points from the
// participant row at the profile, not the other way round.
export const SQUAD_SCORE_PROFILES_FIXTURE: readonly SquadScoreProfileFixture[] = Object.freeze([
  Object.freeze({
    id: 'ssp_mock_0001',
    total_points: 400,
    games_played: 6,
    updated_at: '2026-07-11T10:00:00.000Z',
  }),
]);

/**
 * Deterministic next-id helper for mock `POST /squads`. `squad.id` has no
 * database default (see file-head note), so squad creation must supply an
 * id explicitly; deriving it from the fixed fixture set keeps it
 * deterministic (D-04) for this mock phase.
 */
export function nextSquadId(): number {
  return Math.max(...SQUADS_FIXTURE.map((s) => s.id)) + 1;
}
