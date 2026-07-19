import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Read side of scoring. Every number here is DERIVED from `user_game_answer`
 * rather than read from the `*_score_profile` counters — see the design
 * tradeoff documented at the top of `leaderboard.service.ts`, which this
 * service shares. The two must stay consistent: if a total is derived on the
 * leaderboard but cached on the profile endpoint, the same player shows two
 * different scores on two different screens.
 *
 * `ScoreProfileService` remains the WRITE side (row lifecycle + the counters).
 * The split is deliberate: reads never touch the counters, writes never
 * aggregate.
 */
@Injectable()
export class ScoreAggregateService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lifetime totals for one user, across every squad they have ever played
   * for and every game they joined solo.
   */
  async userTotals(
    userId: string,
  ): Promise<{ totalPoints: number; gamesPlayed: number }> {
    const [row] = await this.dataSource.query<
      { total_points: string; games_played: string }[]
    >(
      `SELECT
         (SELECT COALESCE(SUM(uga.awarded_points), 0)
            FROM user_game_answer uga
           WHERE uga.user_id = $1
             AND uga.awarded_points IS NOT NULL) AS total_points,
         (SELECT COUNT(*)
            FROM user_game ug
           WHERE ug.user_id = $1) AS games_played`,
      [userId],
    );

    return {
      // SUM over int returns bigint; node-postgres returns bigint as a string.
      totalPoints: Number(row?.total_points ?? 0),
      gamesPlayed: Number(row?.games_played ?? 0),
    };
  }

  /**
   * A squad's standing is the AVERAGE of its members' points, counting only
   * points earned while REPRESENTING this squad (`user_game.squad_id`).
   *
   * DENOMINATOR = members who have played at least one game for this squad
   * ("players-only"), NOT the full roster. Chosen so squad score cannot be
   * diluted by recruiting members who never play — a 20-person squad where 5
   * play is not punished 4x against a 5-person squad.
   *
   * The cost of that choice: a one-member squad that got lucky can out-average
   * a deep one. Acceptable while nothing ranks squads AGAINST each other; if a
   * squad-vs-squad board is ever added, it needs a minimum-players floor.
   *
   * A member who joined a game for this squad but never answered counts as a
   * zero in the average — they showed up, so they are a player.
   */
  async squadTotals(squadId: number): Promise<{
    totalPoints: number;
    avgPoints: number;
    playersCount: number;
    gamesPlayed: number;
  }> {
    const [row] = await this.dataSource.query<
      {
        total_points: string;
        avg_points: string;
        players_count: string;
        games_played: string;
      }[]
    >(
      `WITH per_member AS (
         SELECT ug.user_id,
                COALESCE(SUM(uga.awarded_points), 0) AS pts
           FROM user_game ug
           LEFT JOIN user_game_answer uga
                  ON uga.game_id = ug.game_id
                 AND uga.user_id = ug.user_id
                 AND uga.awarded_points IS NOT NULL
          WHERE ug.squad_id = $1
          GROUP BY ug.user_id
       )
       SELECT COALESCE(SUM(pts), 0)                       AS total_points,
              COALESCE(ROUND(AVG(pts)), 0)                AS avg_points,
              COUNT(*)                                    AS players_count,
              (SELECT COUNT(DISTINCT ug.game_id)
                 FROM user_game ug
                WHERE ug.squad_id = $1)                   AS games_played
         FROM per_member`,
      [squadId],
    );

    return {
      totalPoints: Number(row?.total_points ?? 0),
      avgPoints: Number(row?.avg_points ?? 0),
      playersCount: Number(row?.players_count ?? 0),
      gamesPlayed: Number(row?.games_played ?? 0),
    };
  }
}
