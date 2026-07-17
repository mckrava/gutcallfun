import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Near-literal transcription of `initial-request-src/initial-db-structure.sql`
 * (the LOCKED, authoritative schema — see CLAUDE.md). Statement order matches
 * the SQL file's own order: enums -> tables -> game_question_outcome seed ->
 * foreign keys -> uniques/partial indexes -> plain indexes.
 *
 * Do NOT let `migration:generate` re-author this migration from entities —
 * entities describe this schema, they do not drive it (see 01-PATTERNS.md).
 */
export class InitialSchema1784298500212 implements MigrationInterface {
  name = 'InitialSchema1784298500212';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------------
    // Enums
    // ---------------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "game_status" AS ENUM ('scheduled', 'live', 'finished', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "question_state" AS ENUM ('open', 'pending_confirmation', 'resolved', 'voided')`,
    );
    await queryRunner.query(
      `CREATE TYPE "question_type" AS ENUM ('attack_outcome', 'static')`,
    );

    // ---------------------------------------------------------------------
    // Users & squads
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "public"."user" (
        "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
        "wallet_address" varchar NOT NULL,
        "share_code"     varchar(12) NOT NULL,
        "handle"         varchar NOT NULL,
        "image"          varchar,
        "score_profile"  varchar,
        "created_at"     timestamptz NOT NULL DEFAULT now(),
        "updated_at"     timestamptz,
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."user_score_profile" (
        "id"           varchar NOT NULL,
        "total_points" bigint  NOT NULL DEFAULT 0,
        "games_played" int     NOT NULL DEFAULT 0,
        "updated_at"   timestamptz,
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."squad" (
        "id"          int NOT NULL,
        "name"        varchar NOT NULL,
        "image"       varchar,
        "invite_code" varchar,
        "active"      boolean NOT NULL DEFAULT true,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz,
        "deleted_at"  timestamptz,
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."squad_participant" (
        "squad_id"      int     NOT NULL,
        "user_id"       uuid NOT NULL,
        "active"        boolean NOT NULL DEFAULT true,
        "score_profile" varchar,
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "deleted_at"    timestamptz,
        PRIMARY KEY ("squad_id", "user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."squad_score_profile" (
        "id"           varchar NOT NULL,
        "total_points" bigint NOT NULL DEFAULT 0,
        "games_played" int    NOT NULL DEFAULT 0,
        "updated_at"   timestamptz,
        PRIMARY KEY ("id")
      )
    `);

    // ---------------------------------------------------------------------
    // Games & the event log (replay source — sacred)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "public"."game" (
        "id"                   int NOT NULL GENERATED ALWAYS AS IDENTITY,
        "fixture_id"           int NOT NULL,
        "status"               game_status NOT NULL DEFAULT 'scheduled',
        "starts_at"            timestamptz,
        "participant1_id"      int,
        "participant2_id"      int,
        "participant1_is_home" boolean NOT NULL DEFAULT true,
        "team1_name"           varchar,
        "team2_name"           varchar,
        "competition"          varchar,
        "fixture_group_id"     int,
        "team1_jersey_color"   varchar,
        "team2_jersey_color"   varchar,
        "current_status_id"    smallint,
        "score_p1"             smallint NOT NULL DEFAULT 0,
        "score_p2"             smallint NOT NULL DEFAULT 0,
        "is_replay"            boolean NOT NULL DEFAULT false,
        "stream_cursor"        varchar,
        "stream_cursor_at"     timestamptz,
        "created_at"           timestamptz NOT NULL DEFAULT now(),
        "updated_at"           timestamptz,
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."game_event" (
        "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_id"     int     NOT NULL,
        "type"        varchar NOT NULL,
        "payload"     jsonb   NOT NULL,
        "action_id"   int,
        "seq"         int     NOT NULL,
        "confirmed"   boolean,
        "participant" smallint,
        "status_id"   smallint,
        "feed_ts"     timestamptz NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      )
    `);

    // ---------------------------------------------------------------------
    // Questions (prediction windows)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "public"."game_question_outcome" (
        "key"             varchar NOT NULL,
        "content"         varchar NOT NULL,
        "ladder_position" smallint NOT NULL,
        PRIMARY KEY ("key")
      )
    `);

    // Seed immediately after the table it belongs to — game_question_option's
    // FK to this table (added below) requires these rows to already exist.
    // LOCKED economy contract (n=1,708 calibration) — do not alter keys or
    // ladder positions.
    await queryRunner.query(`
      INSERT INTO "public"."game_question_outcome" ("key", "content", "ladder_position") VALUES
        ('fizzles', 'Fizzles out', 1),
        ('danger',  'Creates danger', 2),
        ('shot',    'Shot taken', 3),
        ('goal',    'GOAL!', 4)
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."game_question" (
        "id"                  uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_id"             int     NOT NULL,
        "trigger_event_id"    uuid,
        "resolution_event_id" uuid,
        "question_type"       question_type NOT NULL DEFAULT 'attack_outcome',
        "content"             varchar NOT NULL,
        "participant"         smallint,
        "state"               question_state NOT NULL DEFAULT 'open',
        "resolved_option_id"  uuid,
        "answer_window_ttl"   int NOT NULL DEFAULT 5,
        "expires_at"          timestamptz NOT NULL,
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "resolved_at"         timestamptz,
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."game_question_option" (
        "id"               uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_question_id" uuid NOT NULL,
        "outcome_key"      varchar NOT NULL,
        "base_gain"        int NOT NULL,
        "display_order"    int NOT NULL,
        PRIMARY KEY ("id")
      )
    `);

    // ---------------------------------------------------------------------
    // Participation & answers
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "public"."user_game" (
        "game_id"   int     NOT NULL,
        "user_id"   uuid NOT NULL,
        "squad_id"  int,
        "joined_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("game_id", "user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."user_game_answer" (
        "id"                 uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id"            uuid NOT NULL,
        "game_id"            int     NOT NULL,
        "game_question_id"   uuid NOT NULL,
        "selected_option_id" uuid NOT NULL,
        "reward_multiplier"  numeric(6,3) NOT NULL DEFAULT 1,
        "awarded_points"     int,
        "successful_outcome" boolean,
        "created_at"         timestamptz NOT NULL DEFAULT now(),
        "resolved_at"        timestamptz,
        PRIMARY KEY ("id")
      )
    `);

    // ---------------------------------------------------------------------
    // Foreign keys
    // ---------------------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "public"."user"                 ADD CONSTRAINT "fk_user_score_profile"            FOREIGN KEY ("score_profile")      REFERENCES "public"."user_score_profile"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."squad_participant"    ADD CONSTRAINT "fk_sp_squad"                      FOREIGN KEY ("squad_id")           REFERENCES "public"."squad"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."squad_participant"    ADD CONSTRAINT "fk_sp_user"                       FOREIGN KEY ("user_id")            REFERENCES "public"."user"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."squad_participant"    ADD CONSTRAINT "fk_sp_score_profile"              FOREIGN KEY ("score_profile")      REFERENCES "public"."squad_score_profile"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_event"           ADD CONSTRAINT "fk_ge_game"                       FOREIGN KEY ("game_id")            REFERENCES "public"."game"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question"        ADD CONSTRAINT "fk_gq_game"                       FOREIGN KEY ("game_id")            REFERENCES "public"."game"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question"        ADD CONSTRAINT "fk_gq_trigger_event"              FOREIGN KEY ("trigger_event_id")   REFERENCES "public"."game_event"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question"        ADD CONSTRAINT "fk_gq_resolution_event"           FOREIGN KEY ("resolution_event_id") REFERENCES "public"."game_event"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question"        ADD CONSTRAINT "fk_gq_resolved_option"            FOREIGN KEY ("resolved_option_id") REFERENCES "public"."game_question_option"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_option" ADD CONSTRAINT "fk_gqo_question"                  FOREIGN KEY ("game_question_id")   REFERENCES "public"."game_question"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_option" ADD CONSTRAINT "fk_gqo_outcome"                   FOREIGN KEY ("outcome_key")        REFERENCES "public"."game_question_outcome"("key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game"            ADD CONSTRAINT "fk_ug_game"                       FOREIGN KEY ("game_id")            REFERENCES "public"."game"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game"            ADD CONSTRAINT "fk_ug_user"                       FOREIGN KEY ("user_id")            REFERENCES "public"."user"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game"            ADD CONSTRAINT "fk_ug_squad"                      FOREIGN KEY ("squad_id")           REFERENCES "public"."squad"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer"     ADD CONSTRAINT "fk_uga_user"                      FOREIGN KEY ("user_id")            REFERENCES "public"."user"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer"     ADD CONSTRAINT "fk_uga_game"                      FOREIGN KEY ("game_id")            REFERENCES "public"."game"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer"     ADD CONSTRAINT "fk_uga_question"                  FOREIGN KEY ("game_question_id")   REFERENCES "public"."game_question"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer"     ADD CONSTRAINT "fk_uga_option"                    FOREIGN KEY ("selected_option_id") REFERENCES "public"."game_question_option"("id")`,
    );

    // ---------------------------------------------------------------------
    // Uniques & indexes (correctness constraints, not just performance)
    // ---------------------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "public"."user"  ADD CONSTRAINT "uq_user_wallet" UNIQUE ("wallet_address")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user"  ADD CONSTRAINT "uq_user_handle" UNIQUE ("handle")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user"  ADD CONSTRAINT "uq_user_share_code" UNIQUE ("share_code")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."squad" ADD CONSTRAINT "uq_squad_invite_code" UNIQUE ("invite_code")`,
    );

    // Live games unique per fixture; replay games unlimited (demo takes, testing)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_game_fixture_live" ON "public"."game" ("fixture_id") WHERE NOT "is_replay"`,
    );

    // Idempotent ingest: safe re-delivery on SSE Last-Event-ID resume / replay overlap
    await queryRunner.query(
      `ALTER TABLE "public"."game_event" ADD CONSTRAINT "uq_game_event_seq" UNIQUE ("game_id", "seq")`,
    );

    // One answer per user per question (no double betting)
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer" ADD CONSTRAINT "uq_uga_user_question" UNIQUE ("user_id", "game_question_id")`,
    );

    // One option per outcome per question; stable option ordering
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_option" ADD CONSTRAINT "uq_gqo_outcome" UNIQUE ("game_question_id", "outcome_key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_outcome" ADD CONSTRAINT "uq_gqoc_ladder" UNIQUE ("ladder_position")`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_option" ADD CONSTRAINT "uq_gqo_order"   UNIQUE ("game_question_id", "display_order")`,
    );

    // DB-level guarantee of the one-active-window rule
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_gq_one_open_per_game" ON "public"."game_question" ("game_id") WHERE "state" = 'open'`,
    );

    // Amend/discard lookup by feed action Id
    await queryRunner.query(
      `CREATE INDEX "idx_ge_action_id" ON "public"."game_event" ("game_id", "action_id")`,
    );
    // Event-type scans (e.g. rebuild possession state)
    await queryRunner.query(
      `CREATE INDEX "idx_ge_type"      ON "public"."game_event" ("game_id", "type")`,
    );
    // Leaderboard: SELECT user_id, SUM(awarded_points) ... GROUP BY user_id
    await queryRunner.query(
      `CREATE INDEX "idx_uga_leaderboard" ON "public"."user_game_answer" ("game_id", "user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse dependency order: plain indexes -> uniques/partial indexes ->
    // FKs -> tables -> types.
    await queryRunner.query(`DROP INDEX "public"."idx_uga_leaderboard"`);
    await queryRunner.query(`DROP INDEX "public"."idx_ge_type"`);
    await queryRunner.query(`DROP INDEX "public"."idx_ge_action_id"`);

    await queryRunner.query(`DROP INDEX "public"."uq_gq_one_open_per_game"`);
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_option" DROP CONSTRAINT "uq_gqo_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_outcome" DROP CONSTRAINT "uq_gqoc_ladder"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_option" DROP CONSTRAINT "uq_gqo_outcome"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer" DROP CONSTRAINT "uq_uga_user_question"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_event" DROP CONSTRAINT "uq_game_event_seq"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_game_fixture_live"`);
    await queryRunner.query(
      `ALTER TABLE "public"."squad" DROP CONSTRAINT "uq_squad_invite_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user" DROP CONSTRAINT "uq_user_share_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user" DROP CONSTRAINT "uq_user_handle"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user" DROP CONSTRAINT "uq_user_wallet"`,
    );

    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer" DROP CONSTRAINT "fk_uga_option"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer" DROP CONSTRAINT "fk_uga_question"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer" DROP CONSTRAINT "fk_uga_game"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game_answer" DROP CONSTRAINT "fk_uga_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game" DROP CONSTRAINT "fk_ug_squad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game" DROP CONSTRAINT "fk_ug_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user_game" DROP CONSTRAINT "fk_ug_game"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_option" DROP CONSTRAINT "fk_gqo_outcome"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question_option" DROP CONSTRAINT "fk_gqo_question"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question" DROP CONSTRAINT "fk_gq_resolved_option"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question" DROP CONSTRAINT "fk_gq_resolution_event"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question" DROP CONSTRAINT "fk_gq_trigger_event"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_question" DROP CONSTRAINT "fk_gq_game"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."game_event" DROP CONSTRAINT "fk_ge_game"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."squad_participant" DROP CONSTRAINT "fk_sp_score_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."squad_participant" DROP CONSTRAINT "fk_sp_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."squad_participant" DROP CONSTRAINT "fk_sp_squad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."user" DROP CONSTRAINT "fk_user_score_profile"`,
    );

    await queryRunner.query(`DROP TABLE "public"."user_game_answer"`);
    await queryRunner.query(`DROP TABLE "public"."user_game"`);
    await queryRunner.query(`DROP TABLE "public"."game_question_option"`);
    await queryRunner.query(`DROP TABLE "public"."game_question"`);
    await queryRunner.query(`DROP TABLE "public"."game_question_outcome"`);
    await queryRunner.query(`DROP TABLE "public"."game_event"`);
    await queryRunner.query(`DROP TABLE "public"."game"`);
    await queryRunner.query(`DROP TABLE "public"."squad_score_profile"`);
    await queryRunner.query(`DROP TABLE "public"."squad_participant"`);
    await queryRunner.query(`DROP TABLE "public"."squad"`);
    await queryRunner.query(`DROP TABLE "public"."user_score_profile"`);
    await queryRunner.query(`DROP TABLE "public"."user"`);

    await queryRunner.query(`DROP TYPE "question_type"`);
    await queryRunner.query(`DROP TYPE "question_state"`);
    await queryRunner.query(`DROP TYPE "game_status"`);
  }
}
