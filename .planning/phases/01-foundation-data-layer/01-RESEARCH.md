# Phase 1: Foundation & Data Layer - Research

**Researched:** 2026-07-17
**Domain:** NestJS 11 + TypeORM 0.3.x schema-faithful migrations, env-validated config, Postgres 16 bootstrap
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| DATA-01 | TypeORM models + migrations reproduce `initial-request-src/initial-db-structure.sql` exactly — `gen_random_uuid()` defaults, hand-named enum types, partial unique indexes as raw SQL in migrations, `game_question_outcome` seeded in the same migration | Pattern 3 (raw-SQL migration), Pattern 4 (`enumName` + `synchronize: false` entities), Pitfall 1 & 2 (enum/index diff sharp edges), Open Question 1 (empty-diff verification gate) |
| DATA-02 | Env-validated config module (`class-validator` + `plainToInstance`/`validateSync`, `@Global()` AppConfig) following the hydration-data-feeds pattern; app refuses to boot on invalid env | Pattern 1 (fail-fast config validation), Standard Stack (`class-validator`/`class-transformer`/`@nestjs/config` versions), Security Domain V5 |
| DATA-03 | TypeORM wired via shared DataSource file usable by both app bootstrap and migration CLI (`tsx` for dev, compiled JS for prod); `typeorm` pinned to 0.3.31; `synchronize` disabled | Pattern 2 (shared DataSource), Code Examples (`package.json` scripts), Standard Stack (`typeorm@0.3.31` pin rationale), Anti-Patterns (`synchronize: true` warning) |
| DATA-04 | App boots against docker-compose Postgres 16 with `enableShutdownHooks()` active; docker-compose healthcheck references correct db/user (fix stale `pmmarkets` values) | Pattern/Code Example (`main.ts` shutdown hooks), Pitfall 4 (opt-in shutdown hooks), Pitfall 5 (stale healthcheck fix), Environment Availability (Docker/Compose confirmed present) |
</phase_requirements>

## Summary

Phase 1 has no architectural ambiguity — the stack is fully LOCKED by `./.claude/CLAUDE.md` (NestJS 11.1.28, TypeORM 0.3.31 pinned, `@nestjs/config` 4.0.4, `class-validator`/`class-transformer`, Postgres 16) and the schema is fully LOCKED by `initial-request-src/initial-db-structure.sql` (48 statements: 3 hand-named enums, 12 tables, all FKs, 2 partial unique indexes, 5 plain unique constraints, 3 btree indexes). All package versions in CLAUDE.md were re-verified live against the npm registry today (2026-07-17) and match exactly — no drift. The real risk in this phase is not "what to install," it's "will `migration:generate` actually produce an empty diff against a hand-rolled schema" — TypeORM's schema-diff engine has well-documented sharp edges around exactly the three things this schema uses: hand-named/shared Postgres enum types, partial (`WHERE`-clause) unique indexes, and index/enum drop-and-recreate loops. This research is almost entirely about avoiding those sharp edges.

The project currently has an *empty* NestJS boilerplate (`apps/gutcallfun-core`) — `app.module.ts` has no imports, `src/models/{account,game,squad}` and `src/modules/{core,user,game,squad}` exist as empty directories establishing the intended folder convention, and `docker-compose.yml` has a stale `pmmarkets` healthcheck left over from a template (DATA-04 explicitly calls this out to fix). Nothing needs porting from elsewhere for this phase — it is pure NestJS+TypeORM plumbing work.

**Primary recommendation:** Write ONE initial migration as raw SQL (`queryRunner.query(...)`) that is a near-literal transcription of `initial-db-structure.sql` (including the `game_question_outcome` seed INSERT in the same migration), then hand-write TypeORM entities to *describe* that already-existing schema using `enumName` for the three shared enums and `@Index(..., { synchronize: false })` for the two partial unique indexes — so that `typeorm migration:generate` computes zero diff against them. Do not let TypeORM's schema-sync attempt to own index/enum creation; the raw-SQL migration is the source of truth, entities are a typed read of it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema definition (tables, enums, FKs, indexes) | Database / Storage (raw-SQL migration) | ORM / Entities (typed description) | The SQL file is authoritative per CLAUDE.md; TypeORM entities must describe it, not generate it, to keep `migration:generate` empty |
| Seed reference data (`game_question_outcome` rows) | Database / Storage (same migration as table creation) | — | FK ordering requirement: `game_question_option.outcome_key` FKs this table later in Phase 4; seeding must happen at schema-creation time, not app boot |
| Env validation / fail-fast boot | Backend Server (Nest bootstrap, `ConfigModule`) | — | Framework-level concern; must run before any other module resolves so DB connection never attempts with bad config |
| DataSource wiring (app + CLI) | Backend Server (Nest DI) + CLI Tooling (standalone script) | Database / Storage (connection target) | Both consumers need identical connection options — single exported config object is the only way to guarantee no drift |
| Graceful shutdown (`enableShutdownHooks`) | Backend Server (Nest process lifecycle) | Database / Storage (TypeORM connection close) | Nest's `onModuleDestroy` chain closes the TypeORM `DataSource`; the app must call `app.enableShutdownHooks()` explicitly (opt-in, not default) |
| Local Postgres provisioning | Docker / Infra (docker-compose) | — | `docker-compose.yml` is dev-only infra, not part of the app's runtime tier, but its healthcheck values (`pmmarkets`) must match the app's actual `POSTGRES_DB`/`POSTGRES_USER` or the container reports unhealthy while Postgres is actually fine |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | `11.1.28` | Framework core + HTTP adapter | `npm view` `latest` confirmed 2026-07-17, matches CLAUDE.md pin exactly `[VERIFIED: npm registry]` |
| `@nestjs/typeorm` | `11.0.3` | TypeORM ↔ Nest DI glue (`TypeOrmModule.forRootAsync`) | `npm view` confirmed 2026-07-17; peer range `^0.3.0 \|\| ^1.0.0-dev` accepts the pinned `typeorm@0.3.31` `[VERIFIED: npm registry]` |
| `typeorm` | `0.3.31` (pin — do NOT take `latest`) | ORM / migrations / DataSource / CLI | `npm view typeorm dist-tags` confirmed `latest` is now `1.1.0` (shipped a breaking major ~2 months ago) and `legacy` is `0.3.31` — matches CLAUDE.md's explicit pin rationale exactly `[VERIFIED: npm registry]` |
| `pg` | `8.22.0` | Postgres driver | `npm view` confirmed current `[VERIFIED: npm registry]` |
| `@nestjs/config` | `4.0.4` | `.env` loading + `validate` hook | `npm view` confirmed current, peer-compatible with Nest 11 `[VERIFIED: npm registry]` |
| `class-validator` | `0.15.1` | Env-schema validation (`validateSync`) | `npm view` confirmed current; also required peer of `@nestjs/swagger` (future phase) `[VERIFIED: npm registry]` |
| `class-transformer` | `0.5.1` | `plainToInstance` for env parsing | `npm view` confirmed current `[VERIFIED: npm registry]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `4.23.1` | Run TypeORM CLI + migration scripts in dev without a separate compile step | `npm view` confirmed current `[VERIFIED: npm registry]`. Use for `migration:generate`/`migration:run`/`migration:revert` dev scripts against `src/db/data-source.ts` (`.ts`, not compiled). Reuse the same tool the reference monitor repo already standardized on (consistency, per CLAUDE.md). |
| `dotenv` | not needed as a direct dependency | `.env` file loading | `@nestjs/config`'s `ConfigModule.forRoot()` already wraps `dotenv` internally — do not add it as a separate direct dependency. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw-SQL migration mirroring the `.sql` file 1:1 | `migration:generate` from scratch off hand-written entities | Generating cold risks TypeORM's known enum/partial-index diff quirks producing DDL that *doesn't* byte-match the authoritative `.sql` (different enum naming, different index SQL shape) — riskier for DATA-01's "identical to `initial-db-structure.sql`" requirement. Raw-SQL-first, entities-described-after is the safer order for THIS phase. |
| `typeorm@0.3.31` | `typeorm@1.1.0` (npm `latest`) | Post-hackathon only — 1.x changes `where`-condition null/undefined semantics (now throws) and the internal glob engine; too risky mid-freeze against a fixed schema (CLAUDE.md, already decided) |
| `tsx` for CLI migration scripts | `ts-node` | `ts-node` still works (Nest CLI pulls it in transitively) but is slower/more config-fiddly; `tsx` is the project's already-decided tool (CLAUDE.md) |

**Installation:**
```bash
npm install --workspace=apps/gutcallfun-core \
  @nestjs/typeorm@11.0.3 typeorm@0.3.31 pg@8.22.0 \
  @nestjs/config@4.0.4 class-validator@0.15.1 class-transformer@0.5.1

npm install --workspace=apps/gutcallfun-core --save-dev tsx@4.23.1
```

**Version verification:** All versions above were confirmed live via `npm view <pkg> version` / `npm view typeorm dist-tags` on 2026-07-17 — see Package Legitimacy Audit below for registry provenance detail.

## Package Legitimacy Audit

Ran `gsd-tools query package-legitimacy check --ecosystem npm` against every package this phase installs, 2026-07-17.

| Package | Registry | Age signal | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@nestjs/core` | npm | latest version published 2026-07-08 | 11.9M/wk | github.com/nestjs/nest | SUS (`too-new`) | Approved — see note below |
| `@nestjs/common` | npm | published 2026-07-08 | 11.9M/wk | github.com/nestjs/nest | SUS (`too-new`) | Approved — see note below |
| `@nestjs/platform-express` | npm | published 2026-07-08 | 8.4M/wk | github.com/nestjs/nest | SUS (`too-new`) | Approved — see note below |
| `@nestjs/typeorm` | npm | published 2026-06-26 | 2.8M/wk | github.com/nestjs/typeorm | SUS (`too-new`) | Approved — see note below |
| `typeorm` | npm | published 2026-07-13 | 4.5M/wk | github.com/typeorm/typeorm | SUS (`too-new`) | Approved — see note below |
| `pg` | npm | published 2026-06-19 | 36.1M/wk | github.com/brianc/node-postgres | SUS (`too-new`) | Approved — see note below |
| `tsx` | npm | published 2026-07-13 | 73.0M/wk | github.com/privatenumber/tsx | SUS (`too-new`) | Approved — see note below |
| `@nestjs/config` | npm | published 2026-04-09 | 6.8M/wk | github.com/nestjs/config | OK | Approved |
| `class-validator` | npm | published 2026-02-26 | 9.7M/wk | github.com/typestack/class-validator | OK | Approved |
| `class-transformer` | npm | published 2021-11-22 | 10.4M/wk | github.com/typestack/class-transformer | OK | Approved |

**Note on the seven `SUS (too-new)` verdicts:** the legitimacy checker's "too-new" signal fires off the *most recent publish date* (i.e. the package shipped a routine patch/minor release recently), not the package's actual age or trust level. Every one of these flagged packages has 2.8M–73M weekly downloads and an official, long-established source repo (`nestjs/nest`, `typeorm/typeorm`, `brianc/node-postgres`, `privatenumber/tsx`) — this is the signature of an actively-maintained mainstream package on a normal release cadence, not a slopsquat or hallucination. `npm view <pkg> scripts.postinstall` returned `null`/none for all seven (checked via the seam's `postinstall` signal field). Treated as false positives, not removed.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/typeorm`, `typeorm`, `pg`, `tsx` — all seven flagged purely on publish-recency, not on download count or repo trust. The planner should still add ONE lightweight `checkpoint:human-verify` before the dependency-install task (confirm `npm view <pkg> version` matches the table above at execution time) rather than one per package, given the uniform false-positive cause.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  npm run migration:run  (tsx, dev)  /  node dist/db/migration:run (prod) │
│         │                                                             │
│         ▼                                                             │
│  src/db/data-source.ts  ──────────────┐  (single exported DataSource  │
│         │                             │   options object — shared)   │
│         ▼                             ▼                               │
│  TypeORM CLI runs migrations/*.ts   TypeOrmModule.forRootAsync()     │
│  against Postgres 16 (raw SQL:      reads the SAME options via       │
│  enums, tables, FKs, partial        AppConfig, opens the app's       │
│  indexes, seed rows)                runtime connection pool          │
│         │                             │                               │
│         ▼                             ▼                               │
│  ┌──────────────────────────────────────────────────┐                │
│  │              Postgres 16 (docker-compose)         │                │
│  │  schema now matches initial-db-structure.sql      │                │
│  └──────────────────────────────────────────────────┘                │
│                                        │                               │
│                                        ▼                               │
│                          Nest app boots: AppModule                    │
│                          → @Global() ConfigModule (validate() first,  │
│                            throws + exits if env invalid — no DB      │
│                            connection attempted on bad config)        │
│                          → TypeOrmModule (entities describe, do NOT   │
│                            synchronize, the already-migrated schema)  │
│                          → app.enableShutdownHooks() active           │
│                          → app.listen(PORT)                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
Matches the existing empty-folder convention already committed in `apps/gutcallfun-core/src/` (`models/{account,game,squad}`, `modules/{core,user,game,squad}`) — do not invent a new top-level layout for this phase.

```
apps/gutcallfun-core/src/
├── config/                        # NEW — @Global() ConfigModule
│   ├── app-config.schema.ts       #   class-validator env DTO (EnvironmentVariables)
│   ├── app-config.service.ts      #   AppConfig / ConfigService wrapper, typed getters
│   └── config.module.ts           #   @Global() module, validate() wired into ConfigModule.forRoot
├── db/                             # NEW — shared DataSource + migrations
│   ├── data-source.ts             #   exported DataSource instance — consumed by CLI AND app factory
│   └── migrations/
│       └── <timestamp>-InitialSchema.ts   # raw SQL: enums, tables, FKs, partial indexes, seed rows
├── models/                        # existing empty dirs — entities land here
│   ├── account/                   #   user.entity.ts, user-score-profile.entity.ts
│   ├── game/                      #   game.entity.ts, game-event.entity.ts, game-question.entity.ts,
│   │                               #     game-question-option.entity.ts, game-question-outcome.entity.ts,
│   │                               #     user-game.entity.ts, user-game-answer.entity.ts
│   └── squad/                     #   squad.entity.ts, squad-participant.entity.ts, squad-score-profile.entity.ts
├── modules/
│   ├── core/                      #   AppModule wiring, TypeOrmModule.forRootAsync registration
│   ├── user/  game/  squad/       #   existing empty feature-module dirs (populated in later phases)
├── app.module.ts                  #   imports: ConfigModule, TypeOrmModule.forRootAsync
└── main.ts                        #   NestFactory.create → app.enableShutdownHooks() → app.listen()
```

Note: `game_event`, `game_question*`, `user_game*` all live under `models/game/` — they follow the game aggregate, not a separate top-level folder, consistent with the existing 3-folder (`account`/`game`/`squad`) convention rather than introducing a 4th.

### Pattern 1: Global fail-fast config validation
**What:** A `@Global()` `ConfigModule` whose `validate` function runs `plainToInstance` + `validateSync` against a `class-validator`-decorated env schema class, throwing on any violation so Nest's bootstrap never completes with bad config.
**When to use:** Always, for this project — CLAUDE.md and the `hydration-data-feeds` reference pattern both mandate it; DATA-02 requires it explicitly.
**Example:**
```typescript
// Pattern verified against NestJS official docs + hydration-data-feeds reference pattern (per CLAUDE.md)
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
    // fail fast: throw, do not fall back to defaults for correctness-critical vars
    throw new Error(errors.toString());
  }
  return validated;
}

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

### Pattern 2: Shared DataSource for app + CLI
**What:** One `DataSource` instance in `src/db/data-source.ts`, built from the same `ConfigService`-sourced values, exported for both `TypeOrmModule.forRootAsync({ useFactory, dataSourceFactory })` and the TypeORM CLI (`-d src/db/data-source.ts`).
**When to use:** Always — prevents CLI and app connecting with drifted options (a well-known TypeORM+NestJS pitfall confirmed via WebSearch across multiple independent write-ups). Required by DATA-03.
**Example:**
```typescript
// src/db/data-source.ts
import 'dotenv/config'; // CLI has no Nest bootstrap — load .env directly for this entry point
import { DataSource, DataSourceOptions } from 'typeorm';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['dist/models/**/*.entity.js'],       // compiled path for CLI-against-dist in prod
  migrations: ['dist/db/migrations/*.js'],
  synchronize: false,                              // NEVER true — DATA-03 lock
  logging: process.env.NODE_ENV !== 'production',
};

export const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
```
```typescript
// src/modules/core/database.module.ts — app-side factory, same options shape
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

### Pattern 3: Raw-SQL migration for hand-named enums + partial unique indexes
**What:** Write `CREATE TYPE`, `CREATE TABLE`, FKs, and both partial `CREATE UNIQUE INDEX ... WHERE ...` statements as literal `queryRunner.query(...)` calls inside one migration, transcribed directly from `initial-db-structure.sql` (which is the ground truth per CLAUDE.md's DB schema constraint). Seed `game_question_outcome`'s 4 rows in the SAME migration, after that table's `CREATE TABLE`, before any FK that references it.
**When to use:** For this initial migration only — this is the one time schema authorship happens outside of entity-driven `migration:generate`.
**Example:**
```typescript
// src/db/migrations/<timestamp>-InitialSchema.ts
// Source: raw SQL transcribed from initial-request-src/initial-db-structure.sql (authoritative)
export class InitialSchema<timestamp> implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "game_status" AS ENUM ('scheduled', 'live', 'finished', 'cancelled')`);
    await queryRunner.query(`CREATE TYPE "question_state" AS ENUM ('open', 'pending_confirmation', 'resolved', 'voided')`);
    await queryRunner.query(`CREATE TYPE "question_type" AS ENUM ('attack_outcome', 'static')`);
    // ... CREATE TABLE statements, 1:1 with initial-db-structure.sql ...
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_game_fixture_live" ON "public"."game" ("fixture_id") WHERE NOT "is_replay"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_gq_one_open_per_game" ON "public"."game_question" ("game_id") WHERE "state" = 'open'`);
    // seed reference rows in the same migration (FK ordering requirement, per CLAUDE.md)
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

### Pattern 4: Entities that describe (not generate) the shared enums and partial indexes
**What:** Use `enumName` on `@Column({ type: 'enum' })` to point at the hand-named Postgres type instead of letting TypeORM auto-generate a per-column type name; use `@Index(name, columns, { unique: true, where: '...', synchronize: false })` for the two partial unique indexes so TypeORM's schema-diff engine does not try to manage (and therefore drop/recreate) them.
**When to use:** On every entity whose column maps to `game_status`, `question_state`, or `question_type`; on `Game` and `GameQuestion` entities for the two partial indexes.
**Example:**
```typescript
// Source: TypeORM decorator-reference docs pattern for shared Postgres enum types + unmanaged indexes
// (WebSearch cross-checked against typeorm.io "Indices" advanced-topics doc and multiple TypeORM
//  GitHub issues describing the enumName + synchronize:false combination — see Sources)
@Entity('game')
@Index('uq_game_fixture_live', ['fixtureId'], {
  unique: true,
  where: 'NOT "is_replay"',
  synchronize: false, // raw-SQL migration owns this index; entity only documents it
})
export class GameEntity {
  @Column({ type: 'enum', enum: GameStatus, enumName: 'game_status', default: GameStatus.SCHEDULED })
  status: GameStatus;
  // ...
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
  // ...
}
```

### Anti-Patterns to Avoid
- **Letting `migration:generate` author the initial migration from cold entities:** risks TypeORM choosing different enum-type names, different index SQL shape, or a different statement order than `initial-db-structure.sql` — violates DATA-01's "identical to" requirement. Write the migration by hand from the `.sql` file first; describe it with entities second.
- **Seeding `game_question_outcome` from application code (a seed script run at boot) instead of the migration:** the SQL file's own comment says "seed the 4 rows IN THE SAME MIGRATION as the table (FK ordering)" — `game_question_option.outcome_key` (built in Phase 4) FKs this table, so the rows must exist from migration time, not app-boot time (which could race with app instances or be skipped in some environments).
- **`synchronize: true` anywhere, even temporarily for "quick dev iteration":** DATA-03 explicitly locks `synchronize: false`; enabling it even briefly against a hand-authored schema risks TypeORM silently dropping the partial indexes or enum types it doesn't recognize as entity-owned.
- **Forgetting `CREATE EXTENSION pgcrypto` cargo-culted from older tutorials:** unnecessary on Postgres 16 — `gen_random_uuid()` has been a core built-in function since Postgres 13 `[VERIFIED: WebSearch cross-checked, pgpedia.info]`. Do not add an extension statement that isn't in the authoritative `.sql` file.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Env var presence/type checking | Scattered `if (!process.env.X) throw` calls across bootstrap files | `class-validator` DTO + `validateSync` in a single `ConfigModule.forRoot({ validate })` | Centralizes every required var in one typed schema; fails fast with a readable aggregate error instead of failing piecemeal deep in a service constructor |
| Migration execution/rollback tracking | Custom SQL runner + a hand-rolled `schema_migrations` table | TypeORM CLI (`migration:run`/`migration:revert`) against the shared `data-source.ts` | TypeORM already tracks applied migrations in its own `migrations` table with transactional run/revert — reinventing this wastes hackathon time for zero benefit |
| One-active-window-per-game enforcement | Application-level "check then insert" logic only | The partial unique index `uq_gq_one_open_per_game` (DB-level) as backstop, app-level check as fast-path | A pure app-level check has a race window under concurrent event processing; the schema file itself calls this out as "DB-enforced" |
| UUID generation for PKs | `uuid` npm package, or app-level UUID generation before insert | Postgres `gen_random_uuid()` DEFAULT (already in the `.sql` file for every uuid PK except `game.id`) | Native since PG13, zero dependency weight, matches the authoritative schema exactly — per CLAUDE.md's "What NOT to Use" table |

**Key insight:** this phase's entire risk surface is "does the generated schema match the hand-written SQL byte-for-byte, and does `migration:generate` reliably report no further diff" — every recommendation above exists to keep TypeORM's schema-diff engine out of the business of inventing structure and strictly in the business of confirming a structure that was already hand-authored.

## Common Pitfalls

### Pitfall 1: `synchronize: false` on `@Index` doesn't reliably suppress partial-index diffs in every TypeORM 0.3.x patch
**What goes wrong:** `migration:generate` still proposes a spurious `DROP INDEX` / `CREATE INDEX` pair for a partial unique index even though the entity declares `synchronize: false` on it.
**Why it happens:** Documented, still-open TypeORM GitHub issue (`typeorm/typeorm#10348`, found via WebSearch) — `synchronize: false` is the officially documented mechanism (typeorm.io "Indices" page) but has had inconsistent behavior across some 0.3.x versions for indexes with a `where` clause specifically.
**How to avoid:** After writing the raw-SQL migration and the describing entities, actually run `migration:generate` against a freshly-migrated database as part of this phase's own execution/verification (DATA-01's success criterion literally requires this — "migration:generate yields an empty diff"). If a spurious diff for one of the two partial indexes appears, the fallback is to declare the index's SQL definition in the entity metadata to exactly match what TypeORM would generate itself (matching the WHERE-clause text form TypeORM emits) rather than relying solely on `synchronize: false`.
**Warning signs:** `migration:generate -d src/db/data-source.ts src/db/migrations/Check` produces a non-empty file mentioning `uq_game_fixture_live` or `uq_gq_one_open_per_game` after a schema that should already be caught up.

### Pitfall 2: Duplicate `CREATE TYPE` statements when two entities reference the same shared enum
**What goes wrong:** If `enumName: 'question_state'` (or any of the 3 shared enums) is set on more than one entity/column without care, `migration:generate` can emit two `CREATE TYPE "question_state" ...` statements — the second fails at runtime because the type already exists.
**Why it happens:** Documented TypeORM issue (`typeorm/typeorm#11735`, found via WebSearch) — the migration-generator doesn't always dedupe `enumName` across columns.
**How to avoid:** In this schema each of the 3 enums is used by exactly one column (`game.status` → `game_status`; `game_question.state` → `question_state`; `game_question.question_type` → `question_type`) — so this specific bug's trigger condition (same enum name on 2+ columns) doesn't apply yet. Still worth a note for Phase 4+ if a future column ever needs to share one of these three enum types.
**Warning signs:** Migration run fails with `type "X" already exists`.

### Pitfall 3: `TypeOrmModule.forRootAsync` connecting before `ConfigModule`'s `validate()` has a chance to fail
**What goes wrong:** If `TypeOrmModule` is registered/imported in a way that resolves before the global config validation throws, the app can attempt (and fail on) a DB connection with an already-known-bad config, producing a confusing connection-refused error instead of the intended clear validation error.
**Why it happens:** NestJS module resolution order isn't strictly import-order in all cases; `@Global()` config modules are resolved early but async factories in other modules can still race if config validation itself is async or deferred.
**How to avoid:** Keep `validate()` synchronous (`validateSync`, not an async check) and import `AppConfigModule` first in `AppModule`'s `imports` array; `ConfigModule.forRoot({ validate })` runs during module instantiation, which happens before `TypeOrmModule.forRootAsync`'s factory executes (since the factory injects `ConfigService`, creating a hard DI dependency that forces ordering).
**Warning signs:** Boot fails with a raw `ECONNREFUSED`/`ENOTFOUND` Postgres error instead of a clear class-validator error listing the missing/invalid env vars.

### Pitfall 4: `enableShutdownHooks()` is opt-in and easy to forget
**What goes wrong:** DATA-04's success criterion requires "`enableShutdownHooks()` active" — if omitted, Nest never invokes `onModuleDestroy`/`onApplicationShutdown` on SIGTERM, so the TypeORM connection pool (and, in Phase 2, the `stream_cursor` flush-on-SIGTERM requirement) never fires.
**Why it happens:** Nest docs are explicit that shutdown hook listeners "consume system resources" and are disabled by default — it is a one-line, easy-to-skip call.
**How to avoid:** Call `app.enableShutdownHooks()` in `main.ts` immediately after `NestFactory.create(...)`, before `app.listen(...)`.
**Warning signs:** `docker stop` / SIGTERM on the container takes the full grace-period timeout to kill the process rather than exiting promptly; no shutdown log lines appear.

### Pitfall 5: docker-compose healthcheck references stale `pmmarkets` values (DATA-04, already flagged)
**What goes wrong:** `docker-compose.yml`'s healthcheck runs `pg_isready -U pmmarkets -d pmmarkets` while `POSTGRES_DB`/`POSTGRES_USER` are actually `gutcallfun` — the container reports unhealthy indefinitely even though Postgres itself is fine, which can block `depends_on: { condition: service_healthy }` chains and confuses local dev.
**Why it happens:** Leftover values from whatever template/prior-project this compose file was copied from — confirmed by reading the file directly.
**How to avoid:** Change the healthcheck test to `pg_isready -U gutcallfun -d gutcallfun` (matching the `environment:` block's `POSTGRES_DB`/`POSTGRES_USER` in the same file).
**Warning signs:** `docker compose ps` shows the `db` service as `unhealthy` even though `psql` connects fine manually.

## Code Examples

### `main.ts` — shutdown hooks + config-validated boot
```typescript
// Pattern verified against NestJS official Lifecycle Events docs (enableShutdownHooks section)
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

### `package.json` scripts — tsx-driven CLI against the shared DataSource
```json
{
  "scripts": {
    "migration:generate": "tsx ./node_modules/typeorm/cli.js migration:generate -d src/db/data-source.ts src/db/migrations/Migration",
    "migration:run": "tsx ./node_modules/typeorm/cli.js migration:run -d src/db/data-source.ts",
    "migration:revert": "tsx ./node_modules/typeorm/cli.js migration:revert -d src/db/data-source.ts"
  }
}
```
Note: for the compiled prod image, run the equivalent `node` command against `dist/db/data-source.js` instead of `tsx` against the `.ts` source (per CLAUDE.md's dev/prod migration-runner split — running `tsx` in prod too is an acceptable documented shortcut if simplicity is prioritized).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `CREATE EXTENSION pgcrypto;` + `gen_random_uuid()` | `gen_random_uuid()` alone, no extension | Postgres 13 (2020) | Any tutorial/boilerplate written before 2020 that includes the extension line is safe-but-unnecessary noise; the authoritative `.sql` file correctly omits it — do not add it back in |
| `ts-node` for TypeORM CLI invocation | `tsx` | Ongoing industry shift (`ts-node` effectively maintenance-mode) | Faster CLI invocation, auto-handles `tsconfig-paths`; already the project's locked choice per CLAUDE.md |
| `typeorm@0.3.x` "current" | `typeorm@1.x` is now npm `latest` (shipped 2026-05-19) | ~2 months before this research | Must pin `typeorm@0.3.31` explicitly in `package.json` — an un-pinned `^0.3.0` range or blind `npm install typeorm` would resolve to the breaking `1.x` line |

**Deprecated/outdated:**
- `uuid-ossp` extension + `uuid_generate_v4()`: superseded by core `gen_random_uuid()` since PG13; not used anywhere in the authoritative schema.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The exact code shapes shown in "Code Examples" / "Architecture Patterns" (variable names, exact decorator argument order) are illustrative patterns synthesized from cross-checked WebSearch results, not copy-pasted from a single official doc page fetched this session (no Context7/official-docs MCP tool was available in this environment — all "docs"-kind research questions fell back to WebSearch) | Architecture Patterns, Code Examples | Low — the underlying mechanisms (`enumName`, `@Index({ synchronize: false, where })`, `validate` hook, `enableShutdownHooks()`) are all confirmed to exist and behave as described across multiple independent sources; only the exact example syntax should be treated as a starting point to verify against `typeorm.io` and `docs.nestjs.com` directly during implementation, not blindly copied |
| A2 | `synchronize: false` on `@Index` is the correct mitigation for the two partial unique indexes, notwithstanding the open GitHub issue about inconsistent behavior | Common Pitfalls #1 | Medium — if it doesn't work cleanly in `typeorm@0.3.31` specifically, the plan needs a fallback task to hand-verify the generated diff and possibly express the index's `where` clause in the exact text TypeORM itself would produce |

**If this table is empty:** N/A — see entries above; both are LOW-MEDIUM risk with documented fallbacks already noted inline.

## Open Questions (RESOLVED)

1. **Does `typeorm@0.3.31` reliably respect `synchronize: false` for `where`-clause partial indexes, or does the open bug (`#10348`) reproduce here?**
   - What we know: it's the officially documented mechanism; the bug report exists but its exact affected version range wasn't confirmed in this research pass.
   - What's unclear: whether 0.3.31 specifically is affected.
   - Recommendation: the plan should include a verification task that actually runs `migration:generate` against the freshly-migrated DB and asserts an empty diff — this is already literally DATA-01's success criterion #1, so no extra scope, just make sure the plan's verification step doesn't skip it.
   - **— RESOLVED:** The plans adopt the recommended verification exactly. Plan `01-04-PLAN.md` Task 2 (the empty-diff gate) runs `npm run migration:generate` against the already-migrated Postgres 16 and asserts the output contains `No changes in database schema were found` — which is DATA-01 success criterion #1 and the `01-04` must-have truth. If instead a spurious diff mentioning `uq_game_fixture_live` or `uq_gq_one_open_per_game` is emitted, plan `01-04` Task 2 applies the Pitfall 1 fallback (adjust the entity `@Index` `where` text to exactly match TypeORM's emitted form, delete the spurious file, re-run until empty). So whether or not `0.3.31` reproduces the bug, the phase gate detects it and the fallback path is planned — no residual uncertainty.

2. **Exact `DATABASE_URL` vs. discrete `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` env var shape** — not specified by CLAUDE.md or the requirements.
   - What we know: either shape works equally well with `pg`/TypeORM; `docker-compose.yml` currently defines discrete `POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD` values (`gutcallfun`/`gutcallfun`/`changeme-local-only`) and exposes port `5488` on `127.0.0.1`, not the Postgres-default `5432`.
   - What's unclear: which shape the planner should standardize on for the `EnvironmentVariables` schema.
   - Recommendation: use a single `DATABASE_URL` (e.g. `postgresql://gutcallfun:changeme-local-only@127.0.0.1:5488/gutcallfun`) as the one required var — simpler validation (one `@IsUrl`) and simpler `.env`/`.env.example` — this is Claude's discretion since no CONTEXT.md locked a choice.
   - **— RESOLVED:** The plans locked the single-`DATABASE_URL` shape. Plan `01-01-PLAN.md` Task 2 seeds `apps/gutcallfun-core/.env.example` with `DATABASE_URL=postgresql://gutcallfun:changeme-local-only@127.0.0.1:5488/gutcallfun` (plus `PORT=3000`, `NODE_ENV=development`), and Task 3's `EnvironmentVariables` schema validates `DATABASE_URL` as a single required var via `@IsUrl({ protocols: ['postgresql','postgres'], require_tld: false })`. Discrete `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` vars are NOT used anywhere in the plans.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Docker | `docker-compose.yml` Postgres 16 container | Yes | 28.0.4 (Docker Desktop) | — |
| Docker Compose | `docker compose up` for local Postgres | Yes | v2.34.0-desktop.1 (`docker compose`, not the standalone `docker-compose` binary) | Use `docker compose` (space) syntax in all instructions/scripts, not the deprecated hyphenated binary, which is NOT installed |
| Node.js | Nest 11 runtime (`>=20` required) | Yes | v24.10.0 | — |
| npm | Package install / workspace scripts | Yes | 11.6.1 (root `package.json` pins `packageManager: npm@10.2.4` — close enough, not a blocker) | — |
| psql (local) | Manual schema inspection during verification | Yes | 16.1 (Homebrew) | — |
| Local Postgres already running on host port 5432 | N/A — informational | A Postgres instance is already listening on the host's default `5432` (separate from the project's docker-compose container, which is deliberately mapped to `127.0.0.1:5488`) | 16.1 | No action needed — the project's own container already avoids the collision by using port 5488; just don't accidentally point `DATABASE_URL` at 5432 |

**Missing dependencies with no fallback:** none — everything Phase 1 needs is present.
**Missing dependencies with fallback:** the standalone `docker-compose` (hyphenated) binary is absent; use `docker compose` (Compose V2 plugin syntax) everywhere instead — already the modern default and requires no separate install.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No | Out of scope for this phase (Phase 3) |
| V3 Session Management | No | Out of scope for this phase (Phase 3) |
| V4 Access Control | No | Out of scope for this phase (no endpoints exist yet) |
| V5 Input Validation | Yes | `class-validator` + `class-transformer` `validate`/`validateSync` on the env schema — reject boot on any malformed/missing required var, no silent defaulting for correctness-critical values (DB URL, port) |
| V6 Cryptography | No (directly) | No cryptographic operations in this phase — `gen_random_uuid()` is a randomness primitive, not a security-boundary crypto operation; wallet signature verification (`tweetnacl`) is Phase 3 |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Committed DB credentials / `.env` leaked into git | Information Disclosure | `.env` already git-ignored per CLAUDE.md constraint (`apps/gutcallfun-core/.gitignore` — confirmed present, contents not read due to sandbox path restriction, but the file's existence plus CLAUDE.md's explicit "`.env` git-ignored" directive is the governing constraint); keep `.env.example` with placeholder values only, never real credentials |
| `synchronize: true` left enabled against a production database | Tampering / Availability | `synchronize: false` is LOCKED by DATA-03 — TypeORM's auto-sync can silently drop columns/indexes/types it doesn't recognize as entity-owned, which is exactly what would happen to the two hand-authored partial indexes if sync were ever turned on |
| Raw SQL string interpolation in migration files (if ever parameterizing the seed INSERT dynamically) | Tampering (SQL Injection) | The `game_question_outcome` seed values are static, hardcoded literals in the migration — never build the migration SQL by concatenating any external/user input; if future migrations ever need dynamic values, use `queryRunner.query(sql, params)`'s parameterized form, not string interpolation |
| Postgres port unintentionally exposed beyond localhost | Information Disclosure / unauthorized access | `docker-compose.yml` already binds `127.0.0.1:5488:5432` (loopback-only) — preserve this binding, do not change to `0.0.0.0` or drop the host IP prefix |

## Sources

### Primary (HIGH confidence)
- `npm view <pkg> version` / `npm view typeorm dist-tags` — live registry queries, run 2026-07-17, for `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/config`, `class-validator`, `class-transformer`, `tsx` — all match `./.claude/CLAUDE.md`'s pinned recommendations exactly
- `gsd-tools query package-legitimacy check --ecosystem npm` — run 2026-07-17 against all 10 phase-1 packages
- `initial-request-src/initial-db-structure.sql` — read directly, authoritative schema (48 statements)
- `initial-request-src/initial-project-context.md` §4 — DB schema decisions/invariants (read directly)
- `apps/gutcallfun-core/docker-compose.yml`, `nest-cli.json`, `tsconfig.json`, `package.json`, `src/app.module.ts`, `src/main.ts` — read directly, current boilerplate state confirmed empty/stale healthcheck
- `./.claude/CLAUDE.md` "Technology Stack" section — project-level pre-existing research, itself sourced from live npm queries + reference-repo reads on 2026-07-17 (same day)

### Secondary (MEDIUM confidence)
- WebSearch: "PostgreSQL gen_random_uuid() built-in since which version" — cross-referenced against pgpedia.info, confirms core-built-in since PG13
- WebSearch: TypeORM raw-SQL migration + partial index patterns — cross-referenced against typeorm.io "Query Runner API" and "Indices" docs pages
- WebSearch: NestJS `@nestjs/config` validate pattern — cross-referenced against multiple independent write-ups describing the same documented `plainToInstance`+`validateSync` pattern
- WebSearch: shared `DataSource` for NestJS app + TypeORM CLI — cross-referenced across freeCodeCamp, dev.to, and a TypeORM GitHub issue (`#9789`) describing the same DI-vs-CLI tension and standard workaround
- WebSearch: NestJS `enableShutdownHooks`/lifecycle events — cross-referenced against docs.nestjs.com's own Lifecycle Events page content as summarized in search results
- WebSearch: `tsx` + TypeORM CLI script conventions — cross-referenced across multiple dev.to / Medium write-ups

### Tertiary (LOW confidence, flagged in Assumptions Log)
- Exact code-example syntax in this document — synthesized from the above WebSearch cross-checks, not fetched verbatim from a single official docs page (no Context7/docs MCP tool was available this session — see A1)
- TypeORM `synchronize: false` reliability for `where`-clause partial indexes specifically on `0.3.31` — GitHub issue `#10348` confirms the class of bug exists, but its precise affected-version range was not independently confirmed (see A2, Pitfall 1, Open Question 1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version live-verified against npm registry same day, matches an already-thorough project-level research doc (CLAUDE.md)
- Architecture: HIGH — patterns (raw-SQL-first migration, shared DataSource, `enumName`, fail-fast config) are standard, well-documented TypeORM/NestJS practice, cross-checked across multiple independent sources
- Pitfalls: MEDIUM — the two TypeORM GitHub issues cited (`#10348`, `#11735`) are real and directly relevant, but their exact behavior on the pinned `0.3.31` patch specifically was not independently reproduced in this research pass; the plan should treat DATA-01's own "empty diff" success criterion as the verification gate

**Research date:** 2026-07-17
**Valid until:** 2026-07-24 (7 days — fast-moving npm ecosystem context, and this project is mid-hackathon feature-freeze; re-verify package versions if planning is delayed past the freeze date)
