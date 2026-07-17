---
phase: 01-foundation-data-layer
plan: 03
subsystem: database
tags: [typeorm, postgres, migrations, entities, schema]

# Dependency graph
requires:
  - phase: 01-01
    provides: NestJS boilerplate, env-validated config module, typeorm/pg/config deps already installed
provides:
  - Raw-SQL InitialSchema migration transcribing initial-db-structure.sql 1:1 (enums, 12 tables, FKs, partial indexes, seed)
  - 12 TypeORM entities describing that schema (enumName-bound enums, synchronize:false partial indexes)
affects: [01-04, phase-2-ingest, phase-3-auth, phase-4-windows-resolution, phase-5-api-ws-leaderboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw-SQL-first migration, entities describe (not generate) the schema"
    - "enumName ties enum columns to hand-named shared Postgres enum types"
    - "@Index(name, fields, { synchronize: false }) documents but does not manage DB-owned partial unique indexes"

key-files:
  created:
    - apps/gutcallfun-core/src/models/game/enums.ts
    - apps/gutcallfun-core/src/models/account/user.entity.ts
    - apps/gutcallfun-core/src/models/account/user-score-profile.entity.ts
    - apps/gutcallfun-core/src/models/squad/squad.entity.ts
    - apps/gutcallfun-core/src/models/squad/squad-participant.entity.ts
    - apps/gutcallfun-core/src/models/squad/squad-score-profile.entity.ts
    - apps/gutcallfun-core/src/models/game/game.entity.ts
    - apps/gutcallfun-core/src/models/game/game-event.entity.ts
    - apps/gutcallfun-core/src/models/game/game-question-outcome.entity.ts
    - apps/gutcallfun-core/src/models/game/game-question.entity.ts
    - apps/gutcallfun-core/src/models/game/game-question-option.entity.ts
    - apps/gutcallfun-core/src/models/game/user-game.entity.ts
    - apps/gutcallfun-core/src/models/game/user-game-answer.entity.ts
    - apps/gutcallfun-core/src/db/migrations/InitialSchema.ts
  modified: []

key-decisions:
  - "Cast @Index options literal to a local explicit type on the two partial-index decorators (game.entity.ts, game-question.entity.ts) to work around a TypeORM 0.3.31 .d.ts overload gap — the `Index(name, fields, options)` overload's IndexOptions type omits `synchronize` even though the runtime (typeorm/decorator/Index.js) fully supports it regardless of call shape. Zero runtime behavior change; documented inline."

patterns-established:
  - "Every entity column uses explicit @Column({ name: 'snake_case' }) rather than a global naming strategy, since no naming strategy is configured yet in data-source.ts (owned by plan 01-02) — keeps this plan self-contained and independently verifiable."

requirements-completed: [DATA-01]

coverage:
  - id: D1
    description: "InitialSchema migration transcribes the authoritative SQL 1:1: 3 CREATE TYPE enums, 12 CREATE TABLE statements, all 17 FK constraints, both partial unique indexes, plain uniques, 3 btree indexes, in the SQL file's own statement order"
    requirement: "DATA-01"
    verification:
      - kind: other
        ref: "grep -c 'CREATE TABLE' InitialSchema.ts == 12; grep -c 'CREATE TYPE' == 3; both partial index names present"
        status: pass
    human_judgment: false
  - id: D2
    description: "game_question_outcome seeded with the 4 LOCKED economy rows (fizzles=1, danger=2, shot=3, goal=4) immediately after its CREATE TABLE, before game_question_option's FK to it"
    requirement: "DATA-01"
    verification:
      - kind: other
        ref: "grep for 'fizzles'/'danger'/'shot'/'goal' seed INSERT in InitialSchema.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "12 entities describe their SQL tables 1:1 (matching column names/types/defaults/nullability/PK shape); enum columns use enumName; both partial unique indexes declared synchronize:false"
    requirement: "DATA-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json (clean across models/ and migrations/)"
        status: pass
    human_judgment: false
  - id: D4
    description: "migration:generate empty-diff verification against a live migrated DB — deferred to plan 01-04 per this plan's own verification note"
    verification: []
    human_judgment: true
    rationale: "Requires a running Postgres instance and the TypeORM CLI; explicitly scoped to plan 01-04's empty-diff gate task, not this plan's static-analysis verification."

duration: 35min
completed: 2026-07-17
status: complete
---

# Phase 01 Plan 03: Data Model & Migration Summary

**Raw-SQL InitialSchema migration (3 enums, 12 tables, 17 FKs, 2 partial unique indexes, LOCKED game_question_outcome seed) plus 12 TypeORM entities that describe it 1:1, using enumName-bound shared enum types and synchronize:false partial indexes.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-17T14:29:58Z
- **Tasks:** 3
- **Files modified:** 14 (all new)

## Accomplishments
- Wrote `InitialSchema1784298500212` migration transcribing `initial-request-src/initial-db-structure.sql` near-literally in the SQL file's own statement order (enums → 12 tables → LOCKED outcome seed → 17 FKs → uniques/partial indexes → 3 btree indexes), with a fully symmetric `down()`.
- Authored 12 TypeORM entities (`UserEntity`, `UserScoreProfileEntity`, `SquadEntity`, `SquadParticipantEntity`, `SquadScoreProfileEntity`, `GameEntity`, `GameEventEntity`, `GameQuestionOutcomeEntity`, `GameQuestionEntity`, `GameQuestionOptionEntity`, `UserGameEntity`, `UserGameAnswerEntity`) that describe (not generate) that schema — correct PK shapes (uuid/identity/plain-int/composite), bigint totals, numeric(6,3) reward multiplier, jsonb payload.
- `game.entity.ts` and `game-question.entity.ts` bind their enum columns to the hand-named Postgres types (`game_status`, `question_state`, `question_type`) via `enumName`, and declare their respective partial unique indexes (`uq_game_fixture_live`, `uq_gq_one_open_per_game`) with `synchronize: false` so the raw-SQL migration remains the sole owner of those indexes.
- Full project `npx tsc --noEmit` is clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Account + squad entities (5 tables, describe-not-generate)** - `698c1c1` (feat)
2. **Task 2: Enums + game-aggregate entities (7 tables, enumName + partial indexes)** - `c3eb0cd` (feat)
3. **Task 3: Raw-SQL InitialSchema migration + game_question_outcome seed** - `2488370` (feat)

**Plan metadata:** (this commit — see below)

## Files Created/Modified
- `apps/gutcallfun-core/src/models/account/user.entity.ts` - UserEntity: uuid PK, unique wallet_address/handle/share_code
- `apps/gutcallfun-core/src/models/account/user-score-profile.entity.ts` - UserScoreProfileEntity: varchar PK, bigint total_points
- `apps/gutcallfun-core/src/models/squad/squad.entity.ts` - SquadEntity: plain int PK (not identity), unique invite_code
- `apps/gutcallfun-core/src/models/squad/squad-participant.entity.ts` - SquadParticipantEntity: composite PK (squad_id, user_id)
- `apps/gutcallfun-core/src/models/squad/squad-score-profile.entity.ts` - SquadScoreProfileEntity: varchar PK, bigint total_points
- `apps/gutcallfun-core/src/models/game/enums.ts` - GameStatus, QuestionState, QuestionType string enums matching SQL enum values
- `apps/gutcallfun-core/src/models/game/game.entity.ts` - GameEntity: identity PK, enumName-bound status, uq_game_fixture_live (synchronize:false)
- `apps/gutcallfun-core/src/models/game/game-event.entity.ts` - GameEventEntity: uuid PK, jsonb payload, uq_game_event_seq
- `apps/gutcallfun-core/src/models/game/game-question-outcome.entity.ts` - GameQuestionOutcomeEntity: varchar PK (lookup table), unique ladder_position
- `apps/gutcallfun-core/src/models/game/game-question.entity.ts` - GameQuestionEntity: enumName-bound state/type, uq_gq_one_open_per_game (synchronize:false)
- `apps/gutcallfun-core/src/models/game/game-question-option.entity.ts` - GameQuestionOptionEntity: unique outcome/order per question
- `apps/gutcallfun-core/src/models/game/user-game.entity.ts` - UserGameEntity: composite PK (game_id, user_id)
- `apps/gutcallfun-core/src/models/game/user-game-answer.entity.ts` - UserGameAnswerEntity: numeric(6,3) reward_multiplier, uq_uga_user_question, idx_uga_leaderboard
- `apps/gutcallfun-core/src/db/migrations/InitialSchema.ts` - Raw-SQL migration: 3 enums, 12 tables, LOCKED seed, 17 FKs, both partial indexes, 3 btree indexes, full down()

## Decisions Made
- No global TypeORM naming strategy exists yet (that's owned by `data-source.ts` in plan 01-02, not yet executed in this worktree at plan-authoring time), so every entity property uses an explicit `@Column({ name: 'snake_case' })` mapping rather than relying on a snake_case naming strategy. This keeps this plan self-contained and independently verifiable regardless of plan 01-02's execution order (both are wave 2, depend only on 01-01).
- Used a real epoch-millis timestamp (`1784298500212`, captured via `Date.now()` at authoring time) for the migration class name `InitialSchema1784298500212`, matching TypeORM's migration-tracking convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeORM 0.3.31 `@Index` decorator overload gap with `synchronize: false` + fields array**
- **Found during:** Task 2 (game.entity.ts and game-question.entity.ts partial-index decorators)
- **Issue:** `npx tsc --noEmit` failed with `TS2769: No overload matches this call` on both `@Index('uq_game_fixture_live', ['fixtureId'], { unique: true, where: ..., synchronize: false })` and the equivalent on `game-question.entity.ts`. TypeORM 0.3.31's public `.d.ts` for the `Index(name, fields, options)` overload types `options` as `IndexOptions`, which does not include a `synchronize` property — even though a separate overload (`Index(name, { synchronize: false })`, no fields) explicitly supports it. This is a pure TS declaration-file gap: the runtime implementation (`typeorm/decorator/Index.js`) reads `options.synchronize` identically regardless of which call shape was used, and passes it straight through to `IndexMetadataArgs` (which does have a `synchronize?: boolean` field) — confirmed by reading the compiled `.js`/`.d.ts` sources directly in `node_modules/typeorm`.
- **Fix:** Cast the options object literal to an explicit local type (`{ unique: boolean; where: string; synchronize: false }`) on both decorators, satisfying the `IndexOptions`-typed overload via structural subtyping (extra properties on a variable of a known type are not flagged, unlike literal excess-property checks) with zero change to the emitted JS/runtime behavior. Added an inline comment explaining the typing gap for future maintainers.
- **Files modified:** `apps/gutcallfun-core/src/models/game/game.entity.ts`, `apps/gutcallfun-core/src/models/game/game-question.entity.ts`
- **Verification:** `npx tsc --noEmit -p tsconfig.json` reports zero errors in `models/game/`; both `synchronize: false` and the partial-index `where` clauses remain present and grep-verifiable per the plan's acceptance criteria.
- **Committed in:** `c3eb0cd` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — TypeScript typing-only compile error, no runtime/schema impact)
**Impact on plan:** No scope creep; purely a compile-time workaround for a documented TypeORM 0.3.31 typing limitation. Runtime behavior (both partial indexes remain `synchronize: false`, unmanaged by TypeORM's schema-diff engine) is unchanged from the plan's intent.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DATA-01 is satisfied at the source level: schema and entities are authored and compile clean.
- Plan 01-04 owns the live verification gate (run the migration against a real Postgres 16 instance, then run `migration:generate` and assert an empty diff — per this plan's `<verification>` note and Pitfall 1's fallback path if a spurious diff appears for either partial index).
- `initial-request-src/initial-db-structure.sql` is gitignored (confirmed via `.gitignore:37`), so it is not present in this worktree; it was read directly from the main checkout path for authoring. Plan 01-04's executor (or any future worktree) will need the same main-checkout read, since the file cannot be committed.

---
*Phase: 01-foundation-data-layer*
*Completed: 2026-07-17*
