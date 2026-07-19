# Phase 1: Foundation & Data Layer - Pattern Map

**Mapped:** 2026-07-17
**Files analyzed:** 11 (new) + 3 (modified)
**Analogs found:** 0 exact in-repo / 14 total — this phase is greenfield; no prior NestJS+TypeORM modules exist in `apps/gutcallfun-core` yet. All patterns below are sourced from RESEARCH.md's verified code examples (cross-checked against NestJS/TypeORM official doc patterns) and from the two existing boilerplate files that DO exist (`app.module.ts`, `main.ts`), which are the closest thing to an "analog" — they establish the current baseline these new files extend.

## Context

`apps/gutcallfun-core` is a fresh `nest new` boilerplate: `app.module.ts` has empty `imports: []`, `main.ts` is the stock `NestFactory.create` + `app.listen`, and `src/models/{account,game,squad}` + `src/modules/{core,user,game,squad}` exist as **empty directories** (no files) establishing the intended folder convention only. There is no existing config module, no DataSource file, no entity, no migration, and no docker-compose healthcheck fix anywhere in the repo to copy from. Therefore every "Analog" below is either (a) the RESEARCH.md verified code example — treat it as the canonical pattern to type in directly, or (b) the existing empty-boilerplate file being modified in place.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/config/app-config.schema.ts` | config | request-response (boot-time validation) | RESEARCH.md Pattern 1 (no in-repo analog) | no-analog (research-sourced) |
| `src/config/config.module.ts` | provider/config | request-response | RESEARCH.md Pattern 1 (no in-repo analog) | no-analog (research-sourced) |
| `src/db/data-source.ts` | config | CRUD (DB connection) | RESEARCH.md Pattern 2 (no in-repo analog) | no-analog (research-sourced) |
| `src/modules/core/database.module.ts` | module/provider | CRUD | RESEARCH.md Pattern 2, app-side factory (no in-repo analog) | no-analog (research-sourced) |
| `src/db/migrations/<timestamp>-InitialSchema.ts` | migration | batch (DDL + seed) | RESEARCH.md Pattern 3 + `initial-request-src/initial-db-structure.sql` (authoritative source) | no-analog (SQL-file-sourced) |
| `src/models/account/user.entity.ts` | model | CRUD | RESEARCH.md Pattern 4 + SQL `"public"."user"` table (lines 25-35) | no-analog (SQL-file-sourced) |
| `src/models/account/user-score-profile.entity.ts` | model | CRUD | SQL `"public"."user_score_profile"` table (lines 37-43) | no-analog (SQL-file-sourced) |
| `src/models/game/game.entity.ts` | model | CRUD | RESEARCH.md Pattern 4 (partial-index example is literally this entity) + SQL `"public"."game"` table (lines 78-104) | no-analog (SQL-file-sourced) |
| `src/models/game/game-event.entity.ts` | model | CRUD / event-driven (append-only log) | SQL `"public"."game_event"` table (lines 106-120) | no-analog (SQL-file-sourced) |
| `src/models/game/game-question.entity.ts` | model | CRUD | RESEARCH.md Pattern 4 (partial-index example) + SQL `"public"."game_question"` table (lines 133-149) | no-analog (SQL-file-sourced) |
| `src/models/game/game-question-option.entity.ts` | model | CRUD | SQL `"public"."game_question_option"` table (lines 151-160) | no-analog (SQL-file-sourced) |
| `src/models/game/game-question-outcome.entity.ts` | model | CRUD (reference/lookup table) | SQL `"public"."game_question_outcome"` table (lines 125-131) | no-analog (SQL-file-sourced) |
| `src/models/game/user-game.entity.ts` | model | CRUD (join table) | SQL `"public"."user_game"` table (lines 165-171) | no-analog (SQL-file-sourced) |
| `src/models/game/user-game-answer.entity.ts` | model | CRUD | SQL `"public"."user_game_answer"` table (lines 173-187) | no-analog (SQL-file-sourced) |
| `src/models/squad/squad.entity.ts` | model | CRUD | SQL `"public"."squad"` table (lines 45-55) | no-analog (SQL-file-sourced) |
| `src/models/squad/squad-participant.entity.ts` | model | CRUD (composite-PK join table) | SQL `"public"."squad_participant"` table (lines 57-65) | no-analog (SQL-file-sourced) |
| `src/models/squad/squad-score-profile.entity.ts` | model | CRUD | SQL `"public"."squad_score_profile"` table (lines 67-73) | no-analog (SQL-file-sourced) |
| `src/app.module.ts` (MODIFY) | module | request-response | itself — current empty-import baseline | existing-file (modify in place) |
| `src/main.ts` (MODIFY) | config/bootstrap | request-response | itself — current stock bootstrap | existing-file (modify in place) |
| `docker-compose.yml` (MODIFY) | config | — | itself — stale `pmmarkets` healthcheck | existing-file (modify in place) |
| `package.json` (MODIFY) | config | — | itself — add migration scripts + deps | existing-file (modify in place) |

## Pattern Assignments

### `src/config/app-config.schema.ts` + `src/config/config.module.ts` (config, boot-time validation)

**Analog:** None in-repo. Use RESEARCH.md Pattern 1 verbatim as the starting shape (already reconciled against Open Question 2: standardize on a single `DATABASE_URL` env var, not discrete `DB_HOST`/`DB_PORT`/etc).

**Schema pattern:**
```typescript
// src/config/app-config.schema.ts
import { plainToInstance } from 'class-transformer';
import { IsInt, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsInt() @Min(0) @Max(65535)
  PORT: number;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  DATABASE_URL: string;

  @IsString()
  NODE_ENV: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
```

**Module pattern:**
```typescript
// src/config/config.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './app-config.schema';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate })],
  exports: [ConfigModule],
})
export class AppConfigModule {}
```

**Rationale for `DATABASE_URL` single-var shape:** matches the docker-compose file's actual target once fixed — `postgresql://gutcallfun:changeme-local-only@127.0.0.1:5488/gutcallfun` — simpler single `@IsUrl` validation vs 5 discrete vars.

---

### `src/db/data-source.ts` + `src/modules/core/database.module.ts` (config, CRUD/connection)

**Analog:** None in-repo. Use RESEARCH.md Pattern 2 verbatim — this is the CLI-side and app-side halves of one shared connection-options shape.

**CLI-side DataSource (`src/db/data-source.ts`):**
```typescript
import 'dotenv/config'; // CLI has no Nest bootstrap — load .env directly for this entry point
import { DataSource, DataSourceOptions } from 'typeorm';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['dist/models/**/*.entity.js'],
  migrations: ['dist/db/migrations/*.js'],
  synchronize: false, // NEVER true — DATA-03 lock
  logging: process.env.NODE_ENV !== 'production',
};

export const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
```

**App-side factory (`src/modules/core/database.module.ts`):**
```typescript
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    url: config.get<string>('DATABASE_URL'),
    entities: [__dirname + '/../../models/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../../db/migrations/*{.ts,.js}'],
    synchronize: false,
    autoLoadEntities: true,
  }),
})
```

**Critical ordering constraint (Pitfall 3):** `AppConfigModule` must be imported before `DatabaseModule`/`TypeOrmModule` in `app.module.ts`'s `imports` array, and `validate()` inside the config schema must stay synchronous (`validateSync`, not async) — this forces config validation to complete before the TypeOrm factory (which injects `ConfigService`) ever runs, so bad env produces a clear class-validator error instead of a raw `ECONNREFUSED`.

---

### `src/db/migrations/<timestamp>-InitialSchema.ts` (migration, batch DDL + seed)

**Analog:** None in-repo (no prior migrations exist). Source of truth is `initial-request-src/initial-db-structure.sql` (244 lines, read in full) — transcribe near-literally as `queryRunner.query(...)` calls, in the SQL file's own statement order. Do NOT run `migration:generate` cold from entities for this one migration.

**Structure (RESEARCH.md Pattern 3), transcription order must match the SQL file exactly:**
1. 3 `CREATE TYPE` enum statements (lines 13, 14, 19 of the SQL file: `game_status`, `question_state`, `question_type`)
2. `CREATE TABLE` for all 12 tables in the SQL file's order: `user`, `user_score_profile`, `squad`, `squad_participant`, `squad_score_profile`, `game`, `game_event`, `game_question_outcome`, `game_question`, `game_question_option`, `user_game`, `user_game_answer`
3. Seed `game_question_outcome`'s 4 rows (lines 131 comment + values) **immediately after its `CREATE TABLE`, before `game_question_option`'s FK to it** — this is an explicit ordering requirement, not stylistic
4. All 17 `ALTER TABLE ... ADD CONSTRAINT` FK statements (lines 192-213), in the SQL file's order
5. All UNIQUE constraints (lines 218-234) including the 2 partial `CREATE UNIQUE INDEX ... WHERE ...` statements (`uq_game_fixture_live` line 223, `uq_gq_one_open_per_game` line 237)
6. 3 plain `CREATE INDEX` statements (lines 240-244): `idx_ge_action_id`, `idx_ge_type`, `idx_uga_leaderboard`

**Example shape:**
```typescript
export class InitialSchema<timestamp> implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "game_status" AS ENUM ('scheduled', 'live', 'finished', 'cancelled')`);
    await queryRunner.query(`CREATE TYPE "question_state" AS ENUM ('open', 'pending_confirmation', 'resolved', 'voided')`);
    await queryRunner.query(`CREATE TYPE "question_type" AS ENUM ('attack_outcome', 'static')`);
    // ... CREATE TABLE statements, 1:1 with initial-db-structure.sql, in file order ...
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_game_fixture_live" ON "public"."game" ("fixture_id") WHERE NOT "is_replay"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_gq_one_open_per_game" ON "public"."game_question" ("game_id") WHERE "state" = 'open'`);
    await queryRunner.query(`
      INSERT INTO "public"."game_question_outcome" ("key", "content", "ladder_position") VALUES
        ('fizzles', 'Fizzles out', 1),
        ('danger',  'Creates danger', 2),
        ('shot',    'Shot taken', 3),
        ('goal',    'GOAL!', 4)
    `);
  }
  public async down(queryRunner: QueryRunner): Promise<void> { /* DROP in reverse order */ }
}
```

**Verification gate (mandatory per DATA-01):** after running this migration, run `migration:generate` against the freshly-migrated DB and confirm empty diff. If a spurious diff appears for either partial index, fall back per Pitfall 1 (match TypeORM's own emitted WHERE-clause text form in the entity's `@Index` metadata).

---

### Entities in `src/models/{account,game,squad}/*.entity.ts` (model, CRUD)

**Analog:** None in-repo. Each entity is a typed 1:1 description of its corresponding `CREATE TABLE` block in `initial-request-src/initial-db-structure.sql`. Column names, types, defaults, and nullability must match exactly — entities describe the migration, they do not drive it.

**Enum column pattern — required on `game.status`, `game_question.state`, `game_question.question_type`** (RESEARCH.md Pattern 4, cross-checked against typeorm.io):
```typescript
@Entity('game')
@Index('uq_game_fixture_live', ['fixtureId'], {
  unique: true,
  where: 'NOT "is_replay"',
  synchronize: false, // raw-SQL migration owns this index; entity only documents it
})
export class GameEntity {
  @Column({ type: 'enum', enum: GameStatus, enumName: 'game_status', default: GameStatus.SCHEDULED })
  status: GameStatus;
  // ... remaining columns per SQL lines 78-104
}

@Entity('game_question')
@Index('uq_gq_one_open_per_game', ['gameId'], {
  unique: true,
  where: `"state" = 'open'`,
  synchronize: false,
})
export class GameQuestionEntity {
  @Column({ type: 'enum', enum: QuestionState, enumName: 'question_state', default: QuestionState.OPEN })
  state: QuestionState;

  @Column({ type: 'enum', enum: QuestionType, enumName: 'question_type', default: QuestionType.ATTACK_OUTCOME })
  questionType: QuestionType;
  // ... remaining columns per SQL lines 133-149
}
```

**Non-enum entities** (`UserEntity`, `UserScoreProfileEntity`, `SquadEntity`, `SquadParticipantEntity`, `SquadScoreProfileEntity`, `GameEventEntity`, `GameQuestionOutcomeEntity`, `GameQuestionOptionEntity`, `UserGameEntity`, `UserGameAnswerEntity`) follow the same "describe, don't generate" shape without `enumName`/partial-index concerns — straightforward `@Column()` decorators matching each SQL table's column list 1:1, `@PrimaryColumn`/`@PrimaryGeneratedColumn` per PK shape:
- `id uuid DEFAULT gen_random_uuid()` → `@PrimaryGeneratedColumn('uuid')`
- `id int GENERATED ALWAYS AS IDENTITY` (only `game.id`) → `@PrimaryGeneratedColumn()`
- Composite PKs (`squad_participant.(squad_id,user_id)`, `user_game.(game_id,user_id)`) → two `@PrimaryColumn()` decorators, no auto-generation
- FK columns → `@Column()` for the raw FK column plus `@ManyToOne`/`@JoinColumn` relations as needed for query ergonomics (optional; raw FK column is the SQL-authoritative part)

**Do not add:** any column, default, or index not present in `initial-db-structure.sql` — the schema is locked per CLAUDE.md.

---

### `src/app.module.ts` (MODIFY — module wiring)

**Current state (baseline to modify):**
```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**Required change:** add `AppConfigModule` (first, so `validate()` resolves before anything else) and `DatabaseModule` to `imports`:
```typescript
imports: [AppConfigModule, DatabaseModule],
```
Import order matters (Pitfall 3) — `AppConfigModule` before `DatabaseModule`.

---

### `src/main.ts` (MODIFY — bootstrap + shutdown hooks)

**Current state (baseline to modify):**
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

**Required change (RESEARCH.md Code Example, DATA-04 lock):** insert `app.enableShutdownHooks()` immediately after `NestFactory.create(...)`, before `app.listen(...)`:
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // opt-in — required by DATA-04
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
```

---

### `docker-compose.yml` (MODIFY — healthcheck fix)

**Analog:** itself. RESEARCH.md Pitfall 5 confirms the file currently references stale `pmmarkets` values in the healthcheck `test:` while `environment:` already correctly defines `POSTGRES_DB=gutcallfun`/`POSTGRES_USER=gutcallfun`.

**Required change:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U gutcallfun -d gutcallfun"]
```
(Not read directly in this pass due to no direct file-content access — confirm exact current `test:` array syntax before editing; RESEARCH.md already confirms the specific stale values `pmmarkets`/`pmmarkets` are present and the port binding is `127.0.0.1:5488:5432`, loopback-only, which must be preserved.)

---

### `package.json` (MODIFY — deps + migration scripts)

**Current state (baseline, read in full):** stock Nest 11 boilerplate deps (`@nestjs/common@^11.0.1`, etc.), no `typeorm`/`@nestjs/typeorm`/`@nestjs/config`/`class-validator`/`class-transformer`/`tsx` present yet; `scripts` block has no `migration:*` entries.

**Required additions to `dependencies`:**
```json
"@nestjs/typeorm": "11.0.3",
"typeorm": "0.3.31",
"pg": "8.22.0",
"@nestjs/config": "4.0.4",
"class-validator": "0.15.1",
"class-transformer": "0.5.1"
```

**Required addition to `devDependencies`:**
```json
"tsx": "4.23.1"
```

**Required additions to `scripts`** (RESEARCH.md Code Example):
```json
"migration:generate": "tsx ./node_modules/typeorm/cli.js migration:generate -d src/db/data-source.ts src/db/migrations/Migration",
"migration:run": "tsx ./node_modules/typeorm/cli.js migration:run -d src/db/data-source.ts",
"migration:revert": "tsx ./node_modules/typeorm/cli.js migration:revert -d src/db/data-source.ts"
```

## Shared Patterns

### Fail-fast env validation
**Source:** RESEARCH.md Pattern 1 (`src/config/app-config.schema.ts` + `config.module.ts`)
**Apply to:** `app.module.ts` (must be first import), all modules that later inject `ConfigService`

### Synchronize-false, migration-owns-schema
**Source:** RESEARCH.md Pattern 2/3, DATA-03 lock
**Apply to:** `src/db/data-source.ts`, `src/modules/core/database.module.ts` — `synchronize: false` in both, no exceptions, no temporary overrides

### `enumName` + `synchronize: false` partial-index description
**Source:** RESEARCH.md Pattern 4
**Apply to:** `game.entity.ts` (status enum + `uq_game_fixture_live`), `game-question.entity.ts` (state/type enums + `uq_gq_one_open_per_game`) — every other entity is a plain column mapping with no special decorators needed

### Graceful shutdown
**Source:** RESEARCH.md Code Example (`main.ts`)
**Apply to:** `main.ts` only, single-line addition, must be called before `app.listen()`

## No Analog Found

Every file in this phase has no in-repo analog since the codebase is a fresh, unmodified NestJS boilerplate with zero prior modules, entities, or migrations. All patterns instead derive from:
1. RESEARCH.md's verified code examples (Patterns 1-4, Code Examples section) — cross-checked against NestJS/TypeORM official docs per the research's Sources section
2. `initial-request-src/initial-db-structure.sql` — the authoritative, byte-exact schema source for all migration and entity files

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| All 11 new files listed above | config/model/migration | CRUD/batch | No prior NestJS module, entity, config, or migration exists anywhere in `apps/gutcallfun-core` — greenfield phase |

## Metadata

**Analog search scope:** `apps/gutcallfun-core/src/**` (confirmed empty of implementation files beyond stock `app.controller.ts`/`app.service.ts`/`app.module.ts`/`main.ts`), `apps/gutcallfun-core/package.json`, `apps/gutcallfun-core/docker-compose.yml`, `initial-request-src/initial-db-structure.sql`
**Files scanned:** 4 existing source files, 1 package.json, 1 SQL schema file (244 lines, read in full)
**Pattern extraction date:** 2026-07-17
