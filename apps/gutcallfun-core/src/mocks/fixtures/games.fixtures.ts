import { GameResponseDto } from '../../modules/api/games/dto/game-response.dto';
import { UserGameResponseDto } from '../../modules/api/games/dto/user-game-response.dto';

/**
 * Deterministic `game` rows (D-04): every value is a literal constant — no
 * non-deterministic random-number, wall-clock-read, or random-id generation
 * anywhere in this file.
 *
 * Covers `scheduled`, `live` and `finished`. Deliberately does NOT include a
 * `cancelled` row: the frozen contract (see PLAN.md must_haves) requires
 * `GET /games?status=cancelled` to demonstrate the "filter matches nothing"
 * edge case — HTTP 200, empty `items`, `total` 0, never a 404/null. That
 * specific assertion is only true if no `cancelled` fixture exists, so this
 * file intentionally omits one rather than adding a row that would make the
 * test misleading.
 *
 * Game 1 and Game 2 deliberately share an identical `starts_at` so the
 * stable-sort adjacency case (starts_at ascending, then id ascending) is
 * exercisable. Game 2's `team2_name` ("Côte d'Ivoire") deliberately contains
 * non-ASCII characters so the UTF-8 encoding path is real, not theoretical.
 */
export const GAMES_FIXTURE: GameResponseDto[] = [
  {
    id: 1,
    fixture_id: 5001,
    status: 'scheduled',
    starts_at: '2026-07-20T18:00:00.000Z',
    participant1_id: 101,
    participant2_id: 102,
    participant1_is_home: true,
    team1_name: 'Brazil',
    team2_name: 'Argentina',
    competition: 'World Cup 2026',
    fixture_group_id: 1,
    team1_jersey_color: '#FFD700',
    team2_jersey_color: '#75AADB',
    current_status_id: 0,
    score_p1: 0,
    score_p2: 0,
    is_replay: false,
    created_at: '2026-07-10T09:00:00.000Z',
    updated_at: null,
  },
  {
    id: 2,
    fixture_id: 5002,
    status: 'scheduled',
    starts_at: '2026-07-20T18:00:00.000Z',
    participant1_id: 103,
    participant2_id: 104,
    participant1_is_home: true,
    team1_name: 'France',
    team2_name: "Côte d'Ivoire",
    competition: 'World Cup 2026',
    fixture_group_id: 1,
    team1_jersey_color: '#0055A4',
    team2_jersey_color: '#F77F00',
    current_status_id: 0,
    score_p1: 0,
    score_p2: 0,
    is_replay: false,
    created_at: '2026-07-10T09:00:00.000Z',
    updated_at: null,
  },
  {
    id: 3,
    fixture_id: 5003,
    status: 'live',
    starts_at: '2026-07-18T15:00:00.000Z',
    participant1_id: 105,
    participant2_id: 106,
    participant1_is_home: true,
    team1_name: 'Germany',
    team2_name: 'Spain',
    competition: 'World Cup 2026',
    fixture_group_id: 2,
    team1_jersey_color: '#FFFFFF',
    team2_jersey_color: '#C60B1E',
    current_status_id: 4,
    score_p1: 1,
    score_p2: 0,
    is_replay: false,
    created_at: '2026-07-09T09:00:00.000Z',
    updated_at: '2026-07-18T15:32:00.000Z',
  },
  {
    id: 4,
    fixture_id: 5004,
    status: 'finished',
    starts_at: '2026-07-17T12:00:00.000Z',
    participant1_id: 107,
    participant2_id: 108,
    participant1_is_home: true,
    team1_name: 'Portugal',
    team2_name: 'Morocco',
    competition: 'World Cup 2026',
    fixture_group_id: 3,
    team1_jersey_color: '#006600',
    team2_jersey_color: '#C1272D',
    current_status_id: 100,
    score_p1: 2,
    score_p2: 1,
    is_replay: false,
    created_at: '2026-07-08T09:00:00.000Z',
    updated_at: '2026-07-17T13:55:00.000Z',
  },
  {
    id: 5,
    fixture_id: 5005,
    status: 'finished',
    starts_at: '2026-07-16T12:00:00.000Z',
    participant1_id: 109,
    participant2_id: 110,
    participant1_is_home: true,
    team1_name: 'USA',
    team2_name: 'Mexico',
    competition: 'World Cup 2026',
    fixture_group_id: 3,
    team1_jersey_color: '#3C3B6E',
    team2_jersey_color: '#006847',
    current_status_id: 100,
    score_p1: 1,
    score_p2: 1,
    is_replay: false,
    created_at: '2026-07-07T09:00:00.000Z',
    updated_at: '2026-07-16T13:50:00.000Z',
  },
];

/** Fixed, illustrative user ids reused across this plan's fixture files. */
export const USER_A_ID = '11111111-1111-1111-1111-111111111111';
export const USER_B_ID = '22222222-2222-2222-2222-222222222222';

/**
 * Deterministic `user_game` rows — not a client-facing DTO, this is the
 * lookup `GamesService.findAll({ user_id })` resolves through to answer
 * "games this user joined" without persistence (D-05).
 */
export const USER_GAMES_FIXTURE: UserGameResponseDto[] = [
  {
    game_id: 1,
    user_id: USER_A_ID,
    squad_id: null,
    joined_at: '2026-07-11T10:00:00.000Z',
  },
  {
    game_id: 3,
    user_id: USER_A_ID,
    squad_id: 10,
    joined_at: '2026-07-18T14:55:00.000Z',
  },
  {
    game_id: 3,
    user_id: USER_B_ID,
    squad_id: null,
    joined_at: '2026-07-18T14:56:00.000Z',
  },
];
