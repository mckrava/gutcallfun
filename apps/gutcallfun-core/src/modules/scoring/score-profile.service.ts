import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserEntity } from '../../models/account/user.entity';
import { UserScoreProfileEntity } from '../../models/account/user-score-profile.entity';
import { SquadParticipantEntity } from '../../models/squad/squad-participant.entity';
import { SquadScoreProfileEntity } from '../../models/squad/squad-score-profile.entity';

/**
 * Owns the denormalized score profiles: `user_score_profile` (one per user) and
 * `squad_score_profile` (one per squad, SHARED by every member of that squad).
 *
 * ## Why this service exists
 *
 * The FK direction is reversed from what the names suggest: `user.score_profile`
 * points AT `user_score_profile.id`, and `squad_participant.score_profile`
 * points AT `squad_score_profile.id`. Neither profile table carries a back-
 * reference, and neither `id` has a DB default — so a profile row can only ever
 * come into existence from application code, in two steps (insert the profile,
 * then point the owner at it). Centralizing that here keeps the two-step dance
 * in one place and out of every caller.
 *
 * ## Squad profile shape (decided 2026-07-19)
 *
 * ONE `squad_score_profile` row per squad, id `ssp_<squadId>`, with every
 * `squad_participant.score_profile` in that squad pointing at the same row.
 * `GET /squads/:id/score-profile` is therefore a real row read, and the squad
 * total is the sum of what its members earned while representing it.
 *
 * The schema would also permit one profile per (squad, user) membership — that
 * is what the column placement literally allows — but that reading makes the
 * squad-level endpoint a computed aggregate with no row of its own, and
 * duplicates `user_score_profile` for anyone in exactly one squad.
 *
 * ## Ids are derived, not random
 *
 * `usp_<userId>` / `ssp_<squadId>`. Derivable means every operation here is
 * idempotent without a lookup: re-running `ensure*` on an existing profile is
 * an `ON CONFLICT DO NOTHING` no-op rather than a second row. It also means a
 * profile can be repaired for a legacy row at read time (see the `ensure*`
 * calls in UsersService/SquadsService) with no migration state to track.
 */
@Injectable()
export class ScoreProfileService {
  private readonly logger = new Logger(ScoreProfileService.name);

  constructor(private readonly dataSource: DataSource) {}

  static userProfileId(userId: string): string {
    return `usp_${userId}`;
  }

  static squadProfileId(squadId: number): string {
    return `ssp_${squadId}`;
  }

  /**
   * Creates `user_score_profile` for a user and links `user.score_profile` at
   * it. Safe to call repeatedly and concurrently. Returns the profile id.
   *
   * The link update is guarded by `score_profile IS NULL` so it never clobbers
   * a profile someone deliberately repointed.
   */
  async ensureUserProfile(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string> {
    const profileId = ScoreProfileService.userProfileId(userId);

    await manager
      .createQueryBuilder()
      .insert()
      .into(UserScoreProfileEntity)
      .values({ id: profileId, totalPoints: '0', gamesPlayed: 0 })
      .orIgnore()
      .execute();

    await manager
      .createQueryBuilder()
      .update(UserEntity)
      .set({ scoreProfile: profileId })
      .where('id = :userId AND score_profile IS NULL', { userId })
      .execute();

    return profileId;
  }

  /**
   * Creates the squad's single `squad_score_profile`. Does NOT link
   * participants — a squad can exist before anyone joins it, and each join
   * links itself via {@link linkParticipantProfile}.
   */
  async ensureSquadProfile(
    squadId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string> {
    const profileId = ScoreProfileService.squadProfileId(squadId);

    await manager
      .createQueryBuilder()
      .insert()
      .into(SquadScoreProfileEntity)
      .values({ id: profileId, totalPoints: '0', gamesPlayed: 0 })
      .orIgnore()
      .execute();

    return profileId;
  }

  /**
   * Points one membership row at its squad's shared profile, creating that
   * profile first if the squad predates this code. Call after the
   * `squad_participant` row exists.
   */
  async linkParticipantProfile(
    squadId: number,
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string> {
    const profileId = await this.ensureSquadProfile(squadId, manager);

    await manager
      .createQueryBuilder()
      .update(SquadParticipantEntity)
      .set({ scoreProfile: profileId })
      .where(
        'squad_id = :squadId AND user_id = :userId AND score_profile IS NULL',
        { squadId, userId },
      )
      .execute();

    return profileId;
  }

  /**
   * `games_played += 1` for a user who has just joined a game, and for the
   * squad they joined as — if this is that squad's FIRST member in the game.
   *
   * games_played counts games JOINED, not games answered in (decided
   * 2026-07-19). Call this ONLY on a genuinely new `user_game` row: join is
   * idempotent by design, and counting a repeat join would inflate the total
   * every time the UI re-joins on page load.
   *
   * Best-effort: a failure here must not fail the join itself, so this logs and
   * swallows. The counter is cosmetic; the join is not.
   */
  async recordGameJoin(
    userId: string,
    gameId: number,
    squadId: number | null,
  ): Promise<void> {
    try {
      const profileId = await this.ensureUserProfile(userId);
      await this.dataSource
        .createQueryBuilder()
        .update(UserScoreProfileEntity)
        .set({
          gamesPlayed: () => '"games_played" + 1',
          updatedAt: () => 'now()',
        })
        .where('id = :profileId', { profileId })
        .execute();

      if (squadId == null) return;

      // The squad counts this game once, no matter how many members join it.
      // The joiner's own user_game row is already committed by now, so exclude
      // it explicitly — otherwise the squad never looks "first".
      const others = await this.dataSource.query<Array<{ exists: number }>>(
        `SELECT 1 AS exists FROM "user_game"
          WHERE game_id = $1 AND squad_id = $2 AND user_id <> $3 LIMIT 1`,
        [gameId, squadId, userId],
      );
      if (others.length > 0) return;

      const squadProfileId = await this.linkParticipantProfile(squadId, userId);
      await this.dataSource
        .createQueryBuilder()
        .update(SquadScoreProfileEntity)
        .set({
          gamesPlayed: () => '"games_played" + 1',
          updatedAt: () => 'now()',
        })
        .where('id = :profileId', { profileId: squadProfileId })
        .execute();
    } catch (err) {
      this.logger.error(
        `Failed to record game join for user ${userId} on game ${gameId}`,
        err as Error,
      );
    }
  }

  /**
   * Folds the points just awarded for one resolved question into the answering
   * users' profiles, and into the profile of whichever squad each user is
   * representing in THAT game (`user_game.squad_id`) — not every squad they
   * happen to belong to.
   *
   * MUST run inside the resolution transaction, against the same manager that
   * wrote `user_game_answer.awarded_points` — otherwise it reads either stale
   * or uncommitted awards, and a partial commit leaves points on the answer but
   * missing from the profile with nothing to detect the drift.
   *
   * NOT idempotent on its own: it sums every awarded answer on the question, so
   * calling it twice credits twice. Safety comes from its ONLY caller, which
   * reaches it after winning the `game_question.state` transition that RESL-03
   * uses as the resolution guard — a second resolution aborts before this runs.
   * Do not call it from anywhere that lacks that guard.
   *
   * Aggregated in SQL rather than per-answer so a window with N answers costs
   * two statements, not 2N.
   */
  async applyResolutionPoints(
    manager: EntityManager,
    questionId: string,
    gameId: number,
  ): Promise<void> {
    // Users. Sums this question's awards per profile, skipping unresolved
    // answers and users who somehow have no profile row.
    await manager.query(
      `UPDATE "user_score_profile" usp
          SET total_points = usp.total_points + agg.pts,
              updated_at   = now()
         FROM (
           SELECT u.score_profile AS pid, SUM(uga.awarded_points) AS pts
             FROM "user_game_answer" uga
             JOIN "user" u ON u.id = uga.user_id
            WHERE uga.game_question_id = $1
              AND uga.awarded_points IS NOT NULL
              AND u.score_profile IS NOT NULL
            GROUP BY u.score_profile
         ) agg
        WHERE usp.id = agg.pid AND agg.pts <> 0`,
      [questionId],
    );

    // Squads. `user_game` decides which squad a user played for in this game;
    // a user with no squad on their join row contributes to no squad total.
    await manager.query(
      `UPDATE "squad_score_profile" ssp
          SET total_points = ssp.total_points + agg.pts,
              updated_at   = now()
         FROM (
           SELECT sp.score_profile AS pid, SUM(uga.awarded_points) AS pts
             FROM "user_game_answer" uga
             JOIN "user_game" ug
               ON ug.user_id = uga.user_id AND ug.game_id = $2
             JOIN "squad_participant" sp
               ON sp.squad_id = ug.squad_id AND sp.user_id = uga.user_id
            WHERE uga.game_question_id = $1
              AND uga.awarded_points IS NOT NULL
              AND ug.squad_id IS NOT NULL
              AND sp.score_profile IS NOT NULL
            GROUP BY sp.score_profile
         ) agg
        WHERE ssp.id = agg.pid AND agg.pts <> 0`,
      [questionId, gameId],
    );
  }
}
