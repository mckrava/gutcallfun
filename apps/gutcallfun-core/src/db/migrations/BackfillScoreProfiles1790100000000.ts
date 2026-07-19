import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills `user_score_profile` / `squad_score_profile` for rows that predate
 * automatic profile creation, and links the owners at them.
 *
 * Until now nothing ever inserted a profile row, so every `score_profile`
 * column in the database is NULL. That is not merely cosmetic: LeaderboardService
 * ranks on `LEFT JOIN user_score_profile ... COALESCE(total_points, 0)`, so with
 * no profile rows the board reports 0 for every user.
 *
 * Ids are derived (`usp_<user uuid>` / `ssp_<squad id>`), matching
 * ScoreProfileService — so this migration and the runtime path converge on the
 * same row instead of racing to create two.
 *
 * Historical points are NOT reconstructed from `user_game_answer` here. Awards
 * accrue forward from the next resolution; see the note in the phase record
 * about whether to replay past awards.
 */
export class BackfillScoreProfiles1790100000000 implements MigrationInterface {
  name = 'BackfillScoreProfiles1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- users ---
    await queryRunner.query(`
      INSERT INTO "public"."user_score_profile" ("id", "total_points", "games_played")
      SELECT 'usp_' || u."id"::text, 0, 0
        FROM "public"."user" u
       WHERE u."score_profile" IS NULL
      ON CONFLICT ("id") DO NOTHING
    `);
    await queryRunner.query(`
      UPDATE "public"."user"
         SET "score_profile" = 'usp_' || "id"::text
       WHERE "score_profile" IS NULL
    `);

    // --- squads: one shared profile per squad ---
    await queryRunner.query(`
      INSERT INTO "public"."squad_score_profile" ("id", "total_points", "games_played")
      SELECT 'ssp_' || s."id"::text, 0, 0
        FROM "public"."squad" s
      ON CONFLICT ("id") DO NOTHING
    `);
    await queryRunner.query(`
      UPDATE "public"."squad_participant"
         SET "score_profile" = 'ssp_' || "squad_id"::text
       WHERE "score_profile" IS NULL
    `);

    // games_played counts games joined. Seed it from the joins that already
    // happened so the counter does not restart from zero for existing players.
    await queryRunner.query(`
      UPDATE "public"."user_score_profile" usp
         SET "games_played" = agg.n, "updated_at" = now()
        FROM (
          SELECT u."score_profile" AS pid, COUNT(*) AS n
            FROM "public"."user_game" ug
            JOIN "public"."user" u ON u."id" = ug."user_id"
           WHERE u."score_profile" IS NOT NULL
           GROUP BY u."score_profile"
        ) agg
       WHERE usp."id" = agg.pid
    `);
    // A squad counts a game once, however many of its members joined it.
    await queryRunner.query(`
      UPDATE "public"."squad_score_profile" ssp
         SET "games_played" = agg.n, "updated_at" = now()
        FROM (
          SELECT 'ssp_' || ug."squad_id"::text AS pid,
                 COUNT(DISTINCT ug."game_id") AS n
            FROM "public"."user_game" ug
           WHERE ug."squad_id" IS NOT NULL
           GROUP BY ug."squad_id"
        ) agg
       WHERE ssp."id" = agg.pid
    `);
  }

  /**
   * Unlinks first, then deletes — the FKs point owner -> profile, so a profile
   * row cannot be dropped while anything still references it. Only the derived
   * `usp_`/`ssp_` ids are touched, so a hand-created profile survives.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "public"."user" SET "score_profile" = NULL
       WHERE "score_profile" = 'usp_' || "id"::text
    `);
    await queryRunner.query(`
      UPDATE "public"."squad_participant" SET "score_profile" = NULL
       WHERE "score_profile" = 'ssp_' || "squad_id"::text
    `);
    await queryRunner.query(
      `DELETE FROM "public"."user_score_profile" WHERE "id" LIKE 'usp\\_%'`,
    );
    await queryRunner.query(
      `DELETE FROM "public"."squad_score_profile" WHERE "id" LIKE 'ssp\\_%'`,
    );
  }
}
