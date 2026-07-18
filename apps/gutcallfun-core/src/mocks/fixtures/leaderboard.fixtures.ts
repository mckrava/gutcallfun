import { LeaderboardEntryDto } from '../../modules/api/leaderboard/dto/leaderboard-entry.dto';

/**
 * Deterministic leaderboard rows (D-04), pre-sorted by `total_points`
 * descending. `rank` is NOT stored here — `LeaderboardService` assigns it
 * from this fixed descending order, so the fixture itself is the single
 * source of truth for both content and ordering.
 *
 * User ids reuse the same illustrative identities defined in
 * `games.fixtures.ts` (USER_A_ID/USER_B_ID) where they overlap; the
 * remaining three are additional fixed literals. This plan does not import
 * `users.fixtures.ts` (owned by a parallel plan in this wave) — full
 * cross-fixture identity alignment is a later-phase concern once real
 * persistence exists (D-05).
 */
export type LeaderboardFixtureEntry = Omit<LeaderboardEntryDto, 'rank'>;

export const LEADERBOARD_FIXTURE: LeaderboardFixtureEntry[] = [
  {
    user_id: '11111111-1111-1111-1111-111111111111',
    handle: 'goal_hunter_42',
    image: 'https://example.com/avatars/42.png',
    total_points: 315,
  },
  {
    user_id: '22222222-2222-2222-2222-222222222222',
    handle: 'danger_zone',
    image: 'https://example.com/avatars/17.png',
    total_points: 280,
  },
  {
    user_id: '33333333-3333-3333-3333-333333333333',
    handle: 'shot_caller',
    image: null,
    total_points: 210,
  },
  {
    user_id: '44444444-4444-4444-4444-444444444444',
    handle: 'fizzle_free',
    image: 'https://example.com/avatars/9.png',
    total_points: 150,
  },
  {
    user_id: '55555555-5555-5555-5555-555555555555',
    handle: 'benched_but_believing',
    image: null,
    total_points: 45,
  },
];
