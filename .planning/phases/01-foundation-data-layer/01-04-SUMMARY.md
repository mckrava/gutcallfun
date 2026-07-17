---
phase: 01-foundation-data-layer
plan: 04
subsystem: database
tags: [typeorm, postgres, migrations, nestjs, docker-compose]

# Dependency graph
requires:
  - phase: 01-02
    provides: shared TypeORM DataSource, DatabaseModule, enableShutdownHooks()
  - phase: 01-03
    provides: raw-SQL InitialSchema migration + 12 TypeORM entities matching initial-db-structure.sql
provides:
  - Verified-empty migration:generate diff proving entities and the InitialSchema migration agree byte-for-byte
  - Live-migrated Postgres 16 schema with 4 locked game_question_outcome seed rows and both partial unique indexes
  - Confirmed app boot + prompt SIGTERM shutdown + fail-fast on missing DATABASE_URL against a real database
affects: [ingest, state-machine, prediction-windows, resolution, api-websocket]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TypeORM CLI in npm workspaces: bare `./node_modules/x` relative paths do not resolve to hoisted root deps — reference the hoisted path explicitly (`../../node_modules/typeorm/cli.js`) or use Node's own module resolution, not a raw relative file path"
    - "TypeORM CLI CommandUtils.loadDataSource rejects a DataSource instance reachable under two export keys (named + default) — export the instance under exactly one key"
    - "Named DB-level UNIQUE constraints (ADD CONSTRAINT ... UNIQUE) must be declared in entities via @Unique(name, [cols]), not @Index(name, {unique:true}) — TypeORM's introspection treats pg_constraint-backed uniques and bare unique indexes as different schema objects and will generate a spurious drop/recreate diff otherwise. Reserve @Index({unique:true, where, synchronize:false}) for genuine partial unique indexes (CREATE UNIQUE INDEX ... WHERE)."
    - "Every raw-SQL FK constraint needs a matching @ManyToOne + @JoinColumn({name, foreignKeyConstraintName}) relation in entity metadata (merged onto the same physical column as the existing raw @Column FK-id field) or migration:generate will propose dropping every FK it doesn't recognize. Circular FKs (game_question <-> game_question_option) use TypeORM's standard lazy `() => Entity` type function."

key-files:
  created: []
  modified:
    - apps/gutcallfun-core/package.json (migration:generate/run/revert scripts point at hoisted ../../node_modules/typeorm/cli.js)
    - apps/gutcallfun-core/src/db/data-source.ts (single default-only DataSource export)
    - apps/gutcallfun-core/src/models/account/user.entity.ts (@Unique constraints + fk_user_score_profile relation)
    - apps/gutcallfun-core/src/models/squad/squad.entity.ts (@Unique constraint)
    - apps/gutcallfun-core/src/models/squad/squad-participant.entity.ts (3 FK relations)
    - apps/gutcallfun-core/src/models/game/game-event.entity.ts (@Unique + fk_ge_game relation)
    - apps/gutcallfun-core/src/models/game/game-question.entity.ts (4 FK relations incl. circular)
    - apps/gutcallfun-core/src/models/game/game-question-option.entity.ts (@Unique x2 + 2 FK relations incl. circular)
    - apps/gutcallfun-core/src/models/game/game-question-outcome.entity.ts (@Unique constraint)
    - apps/gutcallfun-core/src/models/game/user-game.entity.ts (3 FK relations)
    - apps/gutcallfun-core/src/models/game/user-game-answer.entity.ts (@Unique + 4 FK relations)

key-decisions:
  - "Fixed migration:generate/run/revert scripts to reference the hoisted ../../node_modules/typeorm/cli.js path rather than a nonexistent local ./node_modules/typeorm/cli.js — necessary for the mandatory Task 1 schema push to run at all in this npm-workspace monorepo"
  - "Export DataSource under default only (not named + default) in data-source.ts to satisfy TypeORM CLI's single-instance requirement"
  - "Converted 6 entities' unique constraints from @Index({unique:true}) to @Unique() to match the migration's ADD CONSTRAINT ... UNIQUE form (the two genuine partial indexes are untouched)"
  - "Added 18 @ManyToOne/@JoinColumn relations across 8 entity files (one per FK in initial-db-structure.sql) merged onto existing raw @Column FK-id fields, so the empty-diff gate holds while raw scalar FK ids remain queryable without a join"

patterns-established:
  - "Pattern: named unique DB constraints → @Unique() class decorator; partial/bare unique indexes → @Index({unique:true, where?, synchronize:false})"
  - "Pattern: every entity FK column gets a sibling @ManyToOne/@JoinColumn relation with foreignKeyConstraintName set to the exact SQL constraint name, merged onto the same @Column name"

requirements-completed: [DATA-01, DATA-03, DATA-04]

coverage:
  - id: D1
    description: "InitialSchema migration applies cleanly to a fresh Postgres 16 via npm run migration:run, creating all 12 tables, 3 enums, 18 FK constraints, and both partial unique indexes"
    requirement: "DATA-01"
    verification:
      - kind: other
        ref: "npm run migration:run (apps/gutcallfun-core) — exit 0, InitialSchema1784298500212 applied"
        status: pass
    human_judgment: false
  - id: D2
    description: "The 4 locked game_question_outcome seed rows exist with correct key/ladder_position (fizzles=1, danger=2, shot=3, goal=4)"
    requirement: "DATA-01"
    verification:
      - kind: other
        ref: "psql -tAc \"SELECT key, ladder_position FROM game_question_outcome ORDER BY ladder_position\" — returned fizzles|1, danger|2, shot|3, goal|4"
        status: pass
    human_judgment: false
  - id: D3
    description: "migration:generate reports an empty diff (\"No changes in database schema were found\") against the migrated DB, proving entities and the InitialSchema migration agree — the DATA-01 verification gate"
    requirement: "DATA-01"
    verification:
      - kind: other
        ref: "npm run migration:generate (apps/gutcallfun-core) — output contains 'No changes in database schema were found'; no stray migration file left in src/db/migrations/"
        status: pass
    human_judgment: false
  - id: D4
    description: "App boots against the docker Postgres 16 via the shared DataSource/DatabaseModule with no ECONNREFUSED, and enableShutdownHooks() causes prompt exit (0s) on SIGTERM"
    requirement: "DATA-03, DATA-04"
    verification:
      - kind: other
        ref: "node dist/main.js against docker db — 'Nest application successfully started' logged; SIGTERM → process exited in 0s (measured via date +%s before/after)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Booting with DATABASE_URL unset aborts fail-fast with a class-validator error (not a raw ECONNREFUSED)"
    requirement: "DATA-04"
    verification:
      - kind: other
        ref: "env -u DATABASE_URL node dist/main.js (run from a fresh cwd with no .env) — threw 'An instance of EnvironmentVariables has failed the validation: property DATABASE_URL has failed the following constraints: isUrl'"
        status: pass
    human_judgment: false

duration: 65min
completed: 2026-07-17
status: complete
---

# Phase 1 Plan 4: Schema Verification & Boot Gate Summary

**Migration applies clean to real Postgres 16 with an empty migration:generate diff (after fixing broken CLI script paths, a dual DataSource export, six @Index→@Unique constraint mismatches, and 18 missing FK relations), and the app boots/shuts down/fails-fast correctly against the live database.**

## Performance

- **Duration:** 65 min
- **Started:** 2026-07-17T13:58:00Z (approx.)
- **Completed:** 2026-07-17T15:03:57Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Ran the mandatory [BLOCKING] InitialSchema migration against a fresh docker-compose Postgres 16 — all 12 tables, 3 enums, 18 FK constraints, and both partial unique indexes (`uq_game_fixture_live`, `uq_gq_one_open_per_game`) created; 4 locked `game_question_outcome` seed rows confirmed present with correct ladder positions
- Closed the DATA-01 empty-diff verification gate: `migration:generate` now reports "No changes in database schema were found" — entities and the hand-authored migration are byte-for-byte reconciled
- Confirmed DATA-04's full boot lifecycle against the real database: clean boot (no ECONNREFUSED), prompt SIGTERM shutdown (0s, `enableShutdownHooks()` working), and fail-fast abort with a class-validator error when `DATABASE_URL` is missing

## Task Commits

Each task was committed atomically:

1. **Task 1: [BLOCKING] Push schema — bring up Postgres 16 and run the migration** - `cc45c83` (fix)
2. **Task 2: Empty-diff gate + boot with shutdown hooks** - `d3ea4a4` (fix)

_Note: both commits are `fix` type because Task 1's action (running the migration) surfaced blocking script/export bugs that had to be resolved before the migration could run at all, and Task 2's action (the empty-diff gate) surfaced entity/migration metadata mismatches that had to be resolved before the gate could pass — no new source files were planned for this verification-only plan, but fixes to existing files were required to make the verification actually succeed._

## Files Created/Modified
- `apps/gutcallfun-core/package.json` - `migration:generate`/`migration:run`/`migration:revert` scripts now point at the hoisted `../../node_modules/typeorm/cli.js` instead of a nonexistent local path
- `apps/gutcallfun-core/src/db/data-source.ts` - exports the `DataSource` instance under `default` only (previously exported under both a named `dataSource` binding and `default`, which broke the TypeORM CLI's single-instance check)
- `apps/gutcallfun-core/src/models/account/user.entity.ts` - `@Unique` constraints for wallet/share_code/handle; `fk_user_score_profile` relation
- `apps/gutcallfun-core/src/models/squad/squad.entity.ts` - `@Unique` constraint for invite_code
- `apps/gutcallfun-core/src/models/squad/squad-participant.entity.ts` - `fk_sp_squad`/`fk_sp_user`/`fk_sp_score_profile` relations
- `apps/gutcallfun-core/src/models/game/game-event.entity.ts` - `@Unique` for (game_id, seq); `fk_ge_game` relation
- `apps/gutcallfun-core/src/models/game/game-question.entity.ts` - `fk_gq_game`/`fk_gq_trigger_event`/`fk_gq_resolution_event`/`fk_gq_resolved_option` relations (the last is a circular FK with game_question_option)
- `apps/gutcallfun-core/src/models/game/game-question-option.entity.ts` - `@Unique` x2; `fk_gqo_question`/`fk_gqo_outcome` relations
- `apps/gutcallfun-core/src/models/game/game-question-outcome.entity.ts` - `@Unique` for ladder_position
- `apps/gutcallfun-core/src/models/game/user-game.entity.ts` - `fk_ug_game`/`fk_ug_user`/`fk_ug_squad` relations
- `apps/gutcallfun-core/src/models/game/user-game-answer.entity.ts` - `@Unique` for (user_id, game_question_id); `fk_uga_user`/`fk_uga_game`/`fk_uga_question`/`fk_uga_option` relations

## Decisions Made
- Kept every FK's existing raw `@Column` FK-id field (per 01-PATTERNS.md, "raw FK column is the SQL-authoritative part") and added the relation as a *sibling* property (`fooRef`) sharing the same physical column via matching `@JoinColumn({ name })`, rather than replacing the raw column — preserves query ergonomics for both the scalar id and (optionally, when joined) the related entity.
- Used `@Unique` (class decorator) instead of `@Index({unique:true})` for all six columns/composites the SQL file creates via `ADD CONSTRAINT ... UNIQUE` — kept `@Index({unique:true, where, synchronize:false})` reserved for the two genuine partial unique indexes, matching the SQL file's own `CREATE UNIQUE INDEX ... WHERE` form.
- Fixed `package.json`'s migration scripts to the hoisted `../../node_modules/typeorm/cli.js` path rather than introducing a new `.bin`/`npx`-based invocation, to keep the change minimal and consistent with the existing `tsx <path-to-cli.js>` invocation style already in the scripts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `migration:run`/`migration:generate`/`migration:revert` scripts referenced a nonexistent local `./node_modules/typeorm/cli.js`**
- **Found during:** Task 1 (the mandatory [BLOCKING] schema push)
- **Issue:** `apps/gutcallfun-core` is an npm workspace; `typeorm` is hoisted to the monorepo root's `node_modules`, not present under `apps/gutcallfun-core/node_modules`. The scripts as written (`tsx ./node_modules/typeorm/cli.js ...`) failed with `ERR_MODULE_NOT_FOUND` — the migration could not run at all, which would have blocked the entire plan (this task is explicitly the mandatory schema-push gate).
- **Fix:** Changed the three migration scripts to `tsx ../../node_modules/typeorm/cli.js ...`, pointing directly at the hoisted location.
- **Files modified:** `apps/gutcallfun-core/package.json`
- **Verification:** `npm run migration:run` now applies `InitialSchema1784298500212` successfully (exit 0).
- **Committed in:** `cc45c83` (Task 1 commit)

**2. [Rule 1 - Bug] `data-source.ts` exported the same DataSource instance under two keys, breaking the TypeORM CLI**
- **Found during:** Task 1 (the mandatory [BLOCKING] schema push)
- **Issue:** After fixing the script path (deviation 1), `migration:run` still failed with `Error: Given data source file must contain only one export of DataSource instance`. TypeORM's `CommandUtils.loadDataSource` iterates every module export looking for `DataSource` instances; `data-source.ts` exported the same instance as both a named `dataSource` binding and `export default dataSource`, so the loader found it twice.
- **Fix:** Removed the named export, keeping only `export default dataSource` (nothing else in the codebase imported the named binding — confirmed via grep before changing).
- **Files modified:** `apps/gutcallfun-core/src/db/data-source.ts`
- **Verification:** `npm run migration:run` proceeds past DataSource loading and applies the migration.
- **Committed in:** `cc45c83` (Task 1 commit)

**3. [Rule 1 - Bug] Six entities declared genuine UNIQUE table constraints as bare unique indexes, breaking the empty-diff gate**
- **Found during:** Task 2 (empty-diff gate)
- **Issue:** `migration:generate` against the freshly-migrated DB (not "no changes" — the DATA-01 success condition) produced a migration that dropped 18 UNIQUE constraints and recreated them as plain `CREATE UNIQUE INDEX` statements. `user`, `squad`, `game_event`, `game_question_outcome`, `game_question_option`, and `user_game_answer` entities declared these columns' uniqueness via `@Index(name, {unique:true})`, but the SQL-authoritative migration created them via `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE`. TypeORM's schema introspection distinguishes pg_constraint-backed uniques (`contype='u'`) from bare unique indexes and diffs them as different objects.
- **Fix:** Replaced `@Index(name, {unique:true})` with class-level `@Unique(name, [columns])` on all affected entities. Left the two genuine partial unique indexes (`uq_game_fixture_live` on `game`, `uq_gq_one_open_per_game` on `game_question`) untouched — those ARE `CREATE UNIQUE INDEX ... WHERE` in the SQL file, so `@Index` is correct for them.
- **Files modified:** `apps/gutcallfun-core/src/models/account/user.entity.ts`, `squad/squad.entity.ts`, `game/game-event.entity.ts`, `game/game-question-outcome.entity.ts`, `game/game-question-option.entity.ts`, `game/user-game-answer.entity.ts`
- **Verification:** Re-ran `migration:generate`; the UNIQUE-constraint diff disappeared (FK diff, described below, remained until deviation 4 was also fixed).
- **Committed in:** `d3ea4a4` (Task 2 commit)

**4. [Rule 1 - Bug] None of the 18 FK constraints in initial-db-structure.sql were represented in entity metadata**
- **Found during:** Task 2 (empty-diff gate)
- **Issue:** After fixing deviation 3, `migration:generate` still produced a non-empty diff — this time proposing to `DROP CONSTRAINT` all 18 foreign keys. 01-PATTERNS.md (from plan 01-03) had explicitly called `@ManyToOne`/`@JoinColumn` relations "optional" and described the raw `@Column` FK-id field as sufficient, but TypeORM's schema diffing can only recognize FK constraints it sees declared via relation metadata — with none declared, every FK in the live DB looked like drift to be removed. Left as-is, this would have made the DATA-01 empty-diff gate permanently unsatisfiable without either abandoning FK constraints (an unacceptable schema deviation from the authoritative SQL) or declaring relations.
- **Fix:** Added a `@ManyToOne(() => Target, {nullable?}) @JoinColumn({name: rawColumnName, foreignKeyConstraintName: 'fk_name'})` relation for every one of the 18 FK columns, across 8 entity files, merged onto the same physical column as the pre-existing raw `@Column` FK-id field (TypeORM supports two properties mapping the same column name — one scalar, one relation). The one genuinely circular case (`game_question.resolved_option_id` → `game_question_option.id`, and `game_question_option.game_question_id` → `game_question.id`) uses TypeORM's standard lazy `() => Entity` type-function pattern, matching the SQL file's own comment acknowledging the circularity is intentional (nullable, set post-insert).
- **Files modified:** `apps/gutcallfun-core/src/models/account/user.entity.ts`, `squad/squad-participant.entity.ts`, `game/game-event.entity.ts`, `game/game-question.entity.ts`, `game/game-question-option.entity.ts`, `game/user-game.entity.ts`, `game/user-game-answer.entity.ts`
- **Verification:** `migration:generate` now reports "No changes in database schema were found" (exit non-zero, which is the documented success condition for this command). `npm run build`, `npx tsc --noEmit`, and the existing jest suite (5/5 tests) all pass with the new relations in place.
- **Committed in:** `d3ea4a4` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking script/export bugs in Task 1, 2 schema-metadata bugs in Task 2)
**Impact on plan:** All four fixes were strictly necessary to satisfy this plan's own stated `must_haves.truths` (empty-diff gate, seed rows, clean boot+shutdown) — none introduce new features or scope beyond what DATA-01/DATA-03/DATA-04 already required. No scope creep; the plan's own verification commands (run byte-for-byte as specified) now pass.

## Issues Encountered
- The plan's Task 2 negative-path check (`DATABASE_URL` unset → fail-fast) initially appeared to fail during manual exploration because `@nestjs/config`'s `ConfigModule.forRoot()` auto-loads a `.env` file from `process.cwd()` by default — running `env -u DATABASE_URL node dist/main.js` from `apps/gutcallfun-core` (where `.env` lives, created in Task 1) silently re-populated `DATABASE_URL` from the `.env` file despite the shell-level unset, so the app booted successfully instead of failing fast. This was not a real problem in the app — it was a test methodology issue. The plan's own automated verify command already accounts for this correctly (`cd` into a fresh `mktemp -d` directory before running `node`, so no `.env` is discoverable); re-running the check that way (and via the exact plan verify command, executed verbatim) confirmed the fail-fast behavior is correct: `Error: An instance of EnvironmentVariables has failed the validation: property DATABASE_URL has failed the following constraints: isUrl`.

## User Setup Required
None - no external service configuration required. `apps/gutcallfun-core/.env` was created locally (git-ignored) with `DATABASE_URL`, `PORT`, and `NODE_ENV` for this verification session; it was never committed.

## Next Phase Readiness
- Phase 1 (foundation-data-layer) is now fully verified end-to-end: shared DataSource/DatabaseModule (01-02), 12 entities + InitialSchema migration (01-03), and this plan's live-database proof (01-04) all agree.
- The empty-diff gate and FK/unique-constraint entity patterns established here (`@Unique` for named constraints, `@ManyToOne`/`@JoinColumn` with `foreignKeyConstraintName` for every FK, both merged onto existing raw `@Column` fields) should be followed by any future phase that adds new entities or migrations against this schema, to avoid re-discovering the same diff-gate failures.
- No blockers for Phase 2 (ingest/replay/state machine) — the database layer is proven against a real Postgres 16 instance, not just type-checked.

---
*Phase: 01-foundation-data-layer*
*Completed: 2026-07-17*
