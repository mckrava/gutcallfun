/**
 * Deterministic `user` + `user_score_profile` fixture constants (D-04: no
 * per-request randomness — two requests a week apart return identical
 * bytes). Field names are literal snake_case matching the `user` and
 * `user_score_profile` tables in initial-db-structure.sql 1:1.
 *
 * All identities are obviously synthetic: wallet addresses use the
 * `GCMOCKWALLET...` prefix (not a valid base58 Solana pubkey), handles are
 * prefixed `mock_`, and avatar values are deterministic seed strings rather
 * than URLs pointing at anyone's real hosted image. Nothing here belongs to
 * an actual person — this file is world-readable, unauthenticated, and
 * served from any deployed demo.
 *
 * Phase 5 note: `user_score_profile.total_points` is a Postgres `bigint`.
 * The `pg` driver returns `bigint` columns as JS strings by default, so the
 * real (non-mock) implementation MUST coerce that string into a number
 * before it reaches `UserScoreProfileResponseDto` — otherwise the wire type
 * silently flips from a JSON integer (as declared here and in the DTO) to a
 * JSON string, breaking the frozen contract (D-05).
 */

export interface UserFixture {
  id: string;
  wallet_address: string;
  share_code: string;
  handle: string;
  image: string | null;
  score_profile: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface UserScoreProfileFixture {
  id: string;
  total_points: number;
  games_played: number;
  updated_at: string | null;
}

export const USERS_FIXTURE: readonly UserFixture[] = Object.freeze([
  Object.freeze({
    id: '00000000-0000-4000-8000-000000000001',
    wallet_address: 'GCMOCKWALLET0000000000000000000000000001',
    share_code: 'GC-A1B2-C3D4',
    handle: 'mock_striker_09',
    image: 'seed:mock-avatar-striker-09',
    score_profile: 'usp_mock_0001',
    created_at: '2026-07-01T09:00:00.000Z',
    updated_at: '2026-07-10T12:30:00.000Z',
  }),
  Object.freeze({
    id: '00000000-0000-4000-8000-000000000002',
    wallet_address: 'GCMOCKWALLET0000000000000000000000000002',
    share_code: 'GC-E5F6-G7H8',
    handle: 'mock_keeper_22',
    image: 'seed:mock-avatar-keeper-22',
    score_profile: 'usp_mock_0002',
    created_at: '2026-07-02T09:00:00.000Z',
    updated_at: null,
  }),
  // Deliberately null score_profile: `user.score_profile` is nullable, and
  // the UI must be able to render a profile screen for a brand-new user who
  // has not played a game yet.
  Object.freeze({
    id: '00000000-0000-4000-8000-000000000003',
    wallet_address: 'GCMOCKWALLET0000000000000000000000000003',
    share_code: 'GC-J9K0-L1M2',
    handle: 'mock_winger_15',
    image: null,
    score_profile: null,
    created_at: '2026-07-03T09:00:00.000Z',
    updated_at: null,
  }),
  Object.freeze({
    id: '00000000-0000-4000-8000-000000000004',
    wallet_address: 'GCMOCKWALLET0000000000000000000000000004',
    share_code: 'GC-N3P4-Q5R6',
    handle: 'mock_captain_01',
    image: 'seed:mock-avatar-captain-01',
    score_profile: 'usp_mock_0004',
    created_at: '2026-07-04T09:00:00.000Z',
    updated_at: '2026-07-12T08:15:00.000Z',
  }),
]);

// `user_score_profile.id` is the varchar PK that `user.score_profile` points
// AT — reversed FK direction vs. the intuitive reading. Only three profiles
// exist even though there are four users, because user 3 above deliberately
// has no profile yet.
export const USER_SCORE_PROFILES_FIXTURE: readonly UserScoreProfileFixture[] = Object.freeze([
  Object.freeze({
    id: 'usp_mock_0001',
    total_points: 245,
    games_played: 5,
    updated_at: '2026-07-10T12:30:00.000Z',
  }),
  Object.freeze({
    id: 'usp_mock_0002',
    total_points: 180,
    games_played: 3,
    updated_at: '2026-07-09T18:00:00.000Z',
  }),
  Object.freeze({
    id: 'usp_mock_0004',
    total_points: 12,
    games_played: 1,
    updated_at: '2026-07-12T08:15:00.000Z',
  }),
]);
