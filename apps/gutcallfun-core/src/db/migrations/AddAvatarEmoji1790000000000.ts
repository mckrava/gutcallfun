import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a persisted avatar/crest `emoji` to `user` and `squad`. The prototype
 * rendered emoji avatars but the backend had no field for them (they were
 * derived client-side); persisting the emoji makes it real, server-owned data
 * returned by the user/squad/participant read paths.
 */
export class AddAvatarEmoji1790000000000 implements MigrationInterface {
  name = 'AddAvatarEmoji1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."user" ADD COLUMN IF NOT EXISTS "emoji" varchar`);
    await queryRunner.query(`ALTER TABLE "public"."squad" ADD COLUMN IF NOT EXISTS "emoji" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."squad" DROP COLUMN IF EXISTS "emoji"`);
    await queryRunner.query(`ALTER TABLE "public"."user" DROP COLUMN IF EXISTS "emoji"`);
  }
}
