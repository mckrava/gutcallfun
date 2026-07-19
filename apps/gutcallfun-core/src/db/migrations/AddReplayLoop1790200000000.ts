import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `replay_loop` — the ENTIRE runtime control surface for the
 * post-World-Cup infinite replay loop (RPLY-LOOP-01/02/03).
 *
 * WHY THIS TABLE EXISTS AS THE ONLY CONTROL SURFACE: once the World Cup
 * ends, `FixturesCronService` discovers no new fixtures and the product
 * looks dead to a judge browsing after submission. The operator CANNOT ship
 * a code change or an env var change after submission (no container
 * restart), so every operational knob for the loop — enable/disable,
 * target fixture, delay between iterations, stall detection window,
 * iteration cap, and even the last error — must be readable/writable with a
 * plain SQL UPDATE/SELECT against this one row-per-loop table. No REST
 * controller, DTO, or WS payload exposes it (deliberate scope limit) — it
 * is operated exclusively via psql.
 *
 * Usage example (see `ReplayLoopService` for the cron that reads this):
 *
 *   -- enable a loop against fixture 12345, cloning from game 900, delayed
 *   -- restart 60s after each finish, force-finish a stalled game after 5
 *   -- minutes of silence, capped at 2 iterations:
 *   INSERT INTO replay_loop
 *     (fixture_id, template_game_id, restart_delay_seconds,
 *      stall_timeout_seconds, max_iterations, enabled)
 *   VALUES (12345, 900, 60, 300, 2, true);
 *
 *   -- pause without losing progress:
 *   UPDATE replay_loop SET enabled = false WHERE id = 1;
 *
 *   -- raise/remove the cap:
 *   UPDATE replay_loop SET max_iterations = NULL WHERE id = 1;
 *
 *   -- check health:
 *   SELECT enabled, iterations_run, current_game_id, last_restart_at,
 *          last_error FROM replay_loop WHERE id = 1;
 *
 * DELIBERATELY NO FOREIGN KEYS on `template_game_id` / `current_game_id`,
 * even though every other FK in this schema (initial-db-structure.sql) is
 * declared:
 *   (a) this is an operator control table driven by hand over psql — an FK
 *       would make a stale `current_game_id` block routine cleanup, and
 *       with no ON DELETE CASCADE anywhere in this schema (verified across
 *       InitialSchema.ts) that friction has no upside;
 *   (b) the repo has a known drift hazard where `migration:generate`
 *       proposes dropping any FK that lacks a matching entity relation
 *       (recorded in STATE.md) — declaring neither the constraint nor the
 *       relation keeps this migration and `ReplayLoopEntity` in sync by
 *       construction.
 *
 * Ships DISABLED: this migration inserts NO rows. Nothing loops until an
 * operator explicitly INSERTs/UPDATEs a row with `enabled = true`.
 */
export class AddReplayLoop1790200000000 implements MigrationInterface {
  name = 'AddReplayLoop1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "public"."replay_loop" (
        "id"                    int NOT NULL GENERATED ALWAYS AS IDENTITY,
        "enabled"                boolean NOT NULL DEFAULT false,
        "fixture_id"             int NOT NULL,
        "template_game_id"       int,
        "restart_delay_seconds"  int NOT NULL DEFAULT 60,
        "stall_timeout_seconds"  int NOT NULL DEFAULT 300,
        "max_iterations"         int,
        "iterations_run"         int NOT NULL DEFAULT 0,
        "current_game_id"        int,
        "last_restart_at"        timestamptz,
        "last_error"             text,
        "updated_at"             timestamptz,
        PRIMARY KEY ("id")
      )
    `);

    // Partial index so the off-state tick (no loop enabled) is a near-free
    // indexed read — `WHERE enabled` keeps the index tiny (0 rows most of
    // the time) regardless of how many disabled/historical loop rows pile
    // up.
    await queryRunner.query(`
      CREATE INDEX "idx_replay_loop_enabled" ON "public"."replay_loop" ("id") WHERE "enabled"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_replay_loop_enabled"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "public"."replay_loop"`);
  }
}
