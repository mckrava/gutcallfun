import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ListLeaderboardQueryDto } from './dto/list-leaderboard-query.dto';
import { PaginatedLeaderboardResponseDto } from './dto/leaderboard-entry.dto';

/**
 * ============================================================================
 * DESIGN TRADEOFF — READ BEFORE CHANGING THIS FILE
 * ============================================================================
 *
 * Every leaderboard here is DERIVED at query time from `user_game_answer`,
 * the append-only record of what was actually awarded. Nothing is ranked on
 * the incrementally-maintained counters in `user_score_profile` /
 * `squad_score_profile`.
 *
 * WHY:
 *   - One source of truth. A cached counter and a derived board WILL disagree
 *     eventually (a missed increment, a replayed resolution, a void), and when
 *     they do the demo shows two different numbers for the same player.
 *   - Four boards, one query. Squad- and game-scoped totals have no counter to
 *     read anyway; caching them would mean a `user_squad_score_profile` table,
 *     a second write path, and a second backfill.
 *   - Self-healing. Points awarded before the counters existed (the whole
 *     France-England match) appear immediately, with no backfill migration.
 *
 * WHAT IT COSTS:
 *   - Full aggregate scan of `user_game_answer` per request. Accepted
 *     deliberately: hackathon scale is one match, ~68 questions, tens of users,
 *     and `idx_uga_leaderboard (game_id, user_id)` covers the game-scoped case.
 *     At real scale this becomes a materialized view or a rollup table
 *     refreshed at resolution — do NOT reach for that now.
 *   - `user_score_profile.total_points` is now a cache that nothing ranks on.
 *     It is still written at resolution and still served by
 *     `GET /users/:id/score-profile`, which derives its own number, so the
 *     column is effectively decorative. See the phase record before deleting
 *     the write path.
 *
 * SOLO PARTICIPANTS:
 *   `user_game.squad_id` is nullable — a user may join a game with no squad.
 *   Those users appear on both unscoped boards and are absent from every
 *   squad-scoped board. That is intended, not a gap: they earned points for
 *   themselves, so there is no squad to credit.
 * ============================================================================
 */
@Injectable()
export class LeaderboardService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    query: ListLeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const gameId = query.game_id ?? null;
    const squadId = query.squad_id ?? null;

    const rows = await this.dataSource.query<LeaderboardRawRow[]>(
      buildLeaderboardSql(gameId, squadId),
      [gameId, squadId, limit, offset].filter((p) => p !== null),
    );

    return {
      items: rows.map((r) => ({
        user_id: r.user_id,
        handle: r.handle,
        emoji: r.emoji,
        image: r.image,
        // SUM() over an int column returns bigint, which node-postgres hands
        // back as a string. Coerce, or the wire type silently flips.
        total_points: Number(r.total_points),
        // RANK(), not array position: with a 5/7/15/100 ladder ties are
        // common, and tied players must share a rank.
        rank: Number(r.rank),
      })),
      total: rows.length > 0 ? Number(rows[0].total_rows) : 0,
      limit,
      offset,
    };
  }
}

interface LeaderboardRawRow {
  user_id: string;
  handle: string;
  emoji: string | null;
  image: string | null;
  total_points: string;
  rank: string;
  total_rows: string;
}

/**
 * Built as a string rather than via QueryBuilder because the participant set
 * changes shape (not just its predicates) between the global and game-scoped
 * boards, and the squad predicate has to sit inside a LEFT JOIN's ON clause.
 *
 * Parameters are positional and assigned in the same order the service filters
 * them, so a null scope consumes no placeholder.
 */
function buildLeaderboardSql(
  gameId: number | null,
  squadId: number | null,
): string {
  let next = 1;
  const gameParam = gameId !== null ? `$${next++}` : null;
  const squadParam = squadId !== null ? `$${next++}` : null;
  const limitParam = `$${next++}`;
  const offsetParam = `$${next++}`;

  // WHO APPEARS on the board — deliberately not "whoever has answers". A
  // player who joined but has not scored yet must still be visible (at zero),
  // otherwise they cannot find themselves on the live in-game board.
  const participants =
    gameParam !== null
      ? // Game-scoped: the people who joined THIS game, as the squad they
        // joined it with. This is the whole reason squad membership is read
        // from user_game and not squad_participant.
        `SELECT ug.user_id
           FROM user_game ug
          WHERE ug.game_id = ${gameParam}
            ${squadParam !== null ? `AND ug.squad_id = ${squadParam}` : ''}`
      : // Global: every user, or every active member of one squad.
        `SELECT u.id AS user_id
           FROM "user" u
          ${
            squadParam !== null
              ? `WHERE EXISTS (
                   SELECT 1 FROM squad_participant sp
                    WHERE sp.user_id = u.id
                      AND sp.squad_id = ${squadParam}
                      AND sp.active)`
              : ''
          }`;

  // Squad attribution lives in the JOIN's ON clause, never in WHERE: moving it
  // to WHERE would drop participants who have no qualifying answer instead of
  // scoring them zero.
  const squadAttribution =
    squadParam !== null
      ? `AND EXISTS (
           SELECT 1 FROM user_game ug
            WHERE ug.game_id = uga.game_id
              AND ug.user_id = uga.user_id
              AND ug.squad_id = ${squadParam})`
      : '';

  return `
    WITH participants AS (
      ${participants}
    ),
    scored AS (
      SELECT p.user_id,
             COALESCE(SUM(uga.awarded_points), 0) AS total_points
        FROM participants p
        LEFT JOIN user_game_answer uga
               ON uga.user_id = p.user_id
              AND uga.awarded_points IS NOT NULL
              ${gameParam !== null ? `AND uga.game_id = ${gameParam}` : ''}
              ${squadAttribution}
       GROUP BY p.user_id
    )
    SELECT s.user_id,
           u.handle,
           u.emoji,
           u.image,
           s.total_points,
           RANK() OVER (ORDER BY s.total_points DESC) AS rank,
           COUNT(*) OVER () AS total_rows
      FROM scored s
      JOIN "user" u ON u.id = s.user_id
     ORDER BY s.total_points DESC, u.created_at ASC
     LIMIT ${limitParam} OFFSET ${offsetParam}
  `;
}
