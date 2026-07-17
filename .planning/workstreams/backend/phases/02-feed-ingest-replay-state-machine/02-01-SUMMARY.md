---
phase: 02-feed-ingest-replay-state-machine
plan: 01
subsystem: ingest
tags: [nestjs, typeorm, async-mutex, event-emitter, config-validation]

# Dependency graph
requires:
  - phase: 01-foundation-data-layer
    provides: fail-fast AppConfig module, TypeORM entities (game, game_event), Postgres 16 schema
provides:
  - IngestModule scaffold with five empty feature sub-modules (pipeline/fixtures/stream/replay/recovery) for zero cross-plan file conflict
  - IngestSharedModule (@Global) exporting GameMutexRegistry, GameStateRegistry, GameStreamGapEmitter
  - Extended fail-fast config schema (TXLINE_GUEST_JWT, TXLINE_API_TOKEN, PAST_FIXTURES_COUNT, SERVICE_LEVEL_ID=12 assertion)
  - GameState shape + createInitialGameState factory (STAT-01), frozen for the Phase-3 state machine
  - GameStreamGapDetected typed event contract + log-only listener (D-13 seam, Phase-4 boundary)
affects: [02-02-pipeline, 02-03-fixtures-cron, 02-04-stream-ingest, 02-05-replay-emitter, 02-06-recovery, phase-04-windows-resolution]

# Tech tracking
tech-stack:
  added: ["@nestjs/schedule@6.1.3", "async-mutex@0.5.0"]
  patterns:
    - "Per-key singleton registry (Map<gameId, T>) — GameMutexRegistry, GameStateRegistry"
    - "Native EventEmitter wrapped in an injectable NestJS singleton for a single in-process event type (no @nestjs/event-emitter dependency)"
    - "Empty @Module({}) stubs so five downstream plans each own exactly one module file with zero shared-file conflict"

key-files:
  created:
    - apps/gutcallfun-core/src/modules/ingest/ingest.module.ts
    - apps/gutcallfun-core/src/modules/ingest/shared/ingest-shared.module.ts
    - apps/gutcallfun-core/src/modules/ingest/pipeline/pipeline.module.ts
    - apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures.module.ts
    - apps/gutcallfun-core/src/modules/ingest/stream/stream.module.ts
    - apps/gutcallfun-core/src/modules/ingest/replay/replay.module.ts
    - apps/gutcallfun-core/src/modules/ingest/recovery/recovery.module.ts
    - apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.ts
    - apps/gutcallfun-core/src/modules/ingest/state/game-state.registry.ts
    - apps/gutcallfun-core/src/modules/ingest/state/game-state.types.ts
    - apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.spec.ts
    - apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.event.ts
    - apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.emitter.ts
    - apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.listener.ts
  modified:
    - apps/gutcallfun-core/package.json
    - apps/gutcallfun-core/src/config/app-config.schema.ts
    - apps/gutcallfun-core/src/config/app-config.schema.spec.ts
    - apps/gutcallfun-core/src/app.module.ts

key-decisions:
  - "Pinned @nestjs/schedule and async-mutex to exact versions (no ^ range) in package.json, matching the project's existing exact-pin convention for correctness-critical deps (typeorm, @nestjs/typeorm, class-transformer, pg)"
  - "GameMutexRegistry.forGame() made public (not private, per RESEARCH.md's sample) so the identity contract (same Mutex per gameId) can be asserted directly in a spec, matching PLAN.md's explicit acceptance criteria wording"
  - "Native Node EventEmitter wrapped in a ~15-line injectable singleton for the D-13 gap seam — matches RESEARCH.md's recommendation over @nestjs/event-emitter for a single event type with one Phase-2 listener"

requirements-completed: [INGST-01, STAT-01, STAT-02]

coverage:
  - id: D1
    description: "Fail-fast config schema extended with TXLINE_GUEST_JWT, TXLINE_API_TOKEN, PAST_FIXTURES_COUNT, and SERVICE_LEVEL_ID=12 boot assertion"
    requirement: "INGST-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/config/app-config.schema.spec.ts (11 tests: valid env, missing credentials, SL=1 rejection, idempotent re-validation)"
        status: pass
    human_judgment: false
  - id: D2
    description: "IngestModule scaffold with five empty feature sub-modules wired into AppModule after DatabaseModule; app still boots"
    verification:
      - kind: e2e
        ref: "apps/gutcallfun-core/test/app.e2e-spec.ts (AppController e2e / GET)"
        status: pass
      - kind: other
        ref: "npm run build (nest build) compiles the full module tree"
        status: pass
    human_judgment: false
  - id: D3
    description: "GameMutexRegistry (STAT-02) — per-game Mutex identity + serialization + eviction"
    requirement: "STAT-02"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.spec.ts (Tests 1-4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GameStateRegistry (STAT-01) — per-game initial state, idempotent getOrCreate, eviction"
    requirement: "STAT-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.spec.ts (Tests 5-7)"
        status: pass
    human_judgment: false
  - id: D5
    description: "GameStreamGapDetected typed event + emitter drives a log-only listener (D-13 seam)"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.spec.ts (Tests 8-9)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-17
status: complete
---

# Phase 2 Plan 01: Ingest Scaffold + Shared Primitives Summary

**IngestModule DI scaffold (five empty feature sub-modules), TxLINE config fields with a SERVICE_LEVEL_ID=12 fail-fast assertion, and three @Global source-agnostic primitives — GameMutexRegistry (per-game async-mutex), GameStateRegistry (per-game in-memory state), and the GameStreamGapDetected event seam with a log-only listener.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-17T19:40:00Z (approx.)
- **Completed:** 2026-07-17T19:55:00Z
- **Tasks:** 3
- **Files modified:** 18 (4 modified, 14 created)

## Accomplishments
- Installed the two locked ingest dependencies (`@nestjs/schedule@6.1.3`, `async-mutex@0.5.0`) at exact pinned versions
- Extended the Phase-1 fail-fast `EnvironmentVariables` schema with TXLINE credentials, `PAST_FIXTURES_COUNT`, and a synchronous `SERVICE_LEVEL_ID !== 12` throw (RESEARCH Pitfall 6 — SL=1 silently ships a 60s-delayed feed)
- Scaffolded `IngestModule` importing `ScheduleModule.forRoot()`, `IngestSharedModule` (@Global), and five empty feature sub-module stubs (pipeline/fixtures/stream/replay/recovery), wired into `AppModule` after `DatabaseModule`
- Implemented `GameMutexRegistry` (STAT-02: per-game serial processing, the only concurrency guarantee this phase provides — no cross-game ordering, no distributed lock) and `GameStateRegistry` (STAT-01 store) as per-key singleton registries with eviction
- Implemented the `GameStreamGapDetected` typed event contract, a native-`EventEmitter`-backed `GameStreamGapEmitter`, and a `GameStreamGapLogListener` (Phase-2 log-only; Phase-4 swaps the listener body for void+refund + goal adjudication — D-13 seam frozen)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install locked deps + extend fail-fast config schema** - `ec1f445` (feat)
2. **Task 2: IngestModule scaffold with five feature sub-module stubs + app wiring** - `1d92b63` (feat)
3. **Task 3: Shared source-agnostic primitives — mutex registry, state registry, gap seam** - `dcd530c` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/gutcallfun-core/package.json` - added `@nestjs/schedule@6.1.3`, `async-mutex@0.5.0` (exact pins)
- `apps/gutcallfun-core/src/config/app-config.schema.ts` - new required/defaulted fields + SL=12 boot assertion
- `apps/gutcallfun-core/src/config/app-config.schema.spec.ts` - extended with 7 new cases (credential presence, SL=1 rejection, idempotency)
- `apps/gutcallfun-core/src/app.module.ts` - registers `IngestModule` after `DatabaseModule`
- `apps/gutcallfun-core/src/modules/ingest/ingest.module.ts` - imports ScheduleModule + shared + five sub-module stubs
- `apps/gutcallfun-core/src/modules/ingest/shared/ingest-shared.module.ts` - `@Global()`, provides+exports the three shared singletons
- `apps/gutcallfun-core/src/modules/ingest/{pipeline,fixtures,stream,replay,recovery}/*.module.ts` - empty `@Module({})` stubs for downstream plans
- `apps/gutcallfun-core/src/modules/ingest/state/game-state.types.ts` - `GameState` interface + `PossessionStage` union + `createInitialGameState`
- `apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.ts` - per-game `Mutex` registry (STAT-02)
- `apps/gutcallfun-core/src/modules/ingest/state/game-state.registry.ts` - per-game `GameState` registry (STAT-01)
- `apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.spec.ts` - 9 tests covering both registries + the gap emitter
- `apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.event.ts` - `GameStreamGapDetected` typed payload
- `apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.emitter.ts` - native `EventEmitter` wrapper singleton
- `apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.listener.ts` - Phase-2 log-only listener (Phase-4 seam)

## Decisions Made
- Pinned `@nestjs/schedule` and `async-mutex` to exact versions in `package.json` (removed npm's default `^` range) to match this project's exact-pin convention for correctness-critical dependencies, consistent with CLAUDE.md's stack-locking philosophy.
- Made `GameMutexRegistry.forGame()` public rather than private (RESEARCH.md's sample code has it private) — PLAN.md's acceptance criteria explicitly requires asserting `registry.forGame(1)` identity in a spec, and there's no DI-boundary reason to hide it.
- `PossessionStage` typed as the four literal wire values (`SafePossession`/`AttackPossession`/`DangerPossession`/`HighDangerPossession`) plus `null`, sourced from the `txodds-api` skill's `message-reference.md` rather than invented — keeps the type ready for the Phase-3 state machine to consume without a later rename.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created a local, git-ignored `.env` for local verification**
- **Found during:** Task 2 verify step (`npx jest test/app.e2e-spec.ts`)
- **Issue:** The worktree has no `.env` file (only the tracked `.env.example`) — untracked/git-ignored files from the main checkout are not copied into a linked git worktree. Confirmed this is a pre-existing, environment-level gap (not caused by this plan): running the e2e test against the unmodified Phase-1 codebase already fails with the same `DATABASE_URL` validation error before any Task-1/2/3 change.
- **Fix:** Wrote a local `apps/gutcallfun-core/.env` (confirmed git-ignored via `git check-ignore -v`) pointing `DATABASE_URL` at the already-running local docker-compose Postgres (`127.0.0.1:5488`, credentials from `docker-compose.yml`), plus placeholder (non-real) `TXLINE_GUEST_JWT`/`TXLINE_API_TOKEN`/`SERVICE_LEVEL_ID=12` values so the app-boot e2e test could actually run and prove `IngestModule` resolves in the DI graph. No real TxLINE credentials were used or committed.
- **Files modified:** `apps/gutcallfun-core/.env` (git-ignored, not committed — will not appear in any commit)
- **Verification:** `npx jest test/app.e2e-spec.ts --config ./test/jest-e2e.json` passes (1/1)
- **Committed in:** N/A (git-ignored file, never staged)

---

**Total deviations:** 1 auto-fixed (1 blocking, environment-only, no committed change)
**Impact on plan:** No production code or committed artifact was affected. This unblocks local `npm run build && npx jest` verification going forward for this worktree; a real `.env` with actual TxLINE credentials is still required before any live-feed testing (Task 1's acceptance criteria are about the config *schema*, not live credentials).

## Issues Encountered
None beyond the `.env` gap above.

## User Setup Required

None for this plan's deliverables — the config schema and DI scaffold are complete. A real `.env` with actual TxLINE credentials (`TXLINE_GUEST_JWT`, `TXLINE_API_TOKEN`) and `SERVICE_LEVEL_ID=12` will be required before any subsequent plan attempts live SSE ingest (INGST-02) against the real TxLINE feed.

## Next Phase Readiness
- `IngestModule`'s five empty sub-modules (pipeline/fixtures/stream/replay/recovery) are ready for the next four Phase-2 plans to fill independently with zero shared-file conflict.
- `GameMutexRegistry`, `GameStateRegistry`, and `GameStreamGapEmitter` are injectable anywhere in `IngestModule`'s subtree via `@Global()` without re-importing `IngestSharedModule`.
- `GameStreamGapDetected` contract is frozen — Phase 4 can replace `GameStreamGapLogListener`'s body wholesale without any ingest-side rework.
- No blockers for the next plan in this phase.

---
*Phase: 02-feed-ingest-replay-state-machine*
*Completed: 2026-07-17*
