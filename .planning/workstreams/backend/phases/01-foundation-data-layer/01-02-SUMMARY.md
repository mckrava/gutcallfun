---
phase: 01-foundation-data-layer
plan: 02
subsystem: infra
tags: [nestjs, typeorm, database-module, shutdown-hooks]

# Dependency graph
requires: [01-01]
provides:
  - Shared TypeORM DataSource options (src/db/data-source.ts) consumed by both the CLI (-d flag) and the app's DatabaseModule factory — no drift between migration-CLI and runtime connections
  - DatabaseModule (src/modules/core/database.module.ts) registering TypeOrmModule.forRootAsync sourced from ConfigService
  - AppModule wired with [AppConfigModule, DatabaseModule] in that order
  - main.ts calling app.enableShutdownHooks() before app.listen()
affects: [01-03, 01-04]

# Tech tracking
tech-stack:
  added: []
  patterns: ["single DataSourceOptions shape shared by CLI and app factory via __dirname-relative {ts,js} entity/migration globs", "synchronize: false hard-locked in both connection definitions", "config-before-database import order enforced via ConfigService DI dependency"]

key-files:
  created:
    - apps/gutcallfun-core/src/db/data-source.ts
    - apps/gutcallfun-core/src/modules/core/database.module.ts
  modified:
    - apps/gutcallfun-core/src/app.module.ts
    - apps/gutcallfun-core/src/main.ts

key-decisions:
  - "dotenv loaded via 'import dotenv/config' in data-source.ts, resolved transitively through @nestjs/config's own dependency (npm workspace hoisting) rather than added as a direct package.json dependency, per plan instruction and CLAUDE.md's 'Don't Hand-Roll' guidance"
  - "Entities/migrations resolved via __dirname-relative path.join()/string-concat globs (not hardcoded dist/ paths) so the same files work under tsx (dev, .ts) and compiled node (prod, .js) without divergent connection configs"

patterns-established:
  - "Shared DataSource pattern: one DataSourceOptions object exported from src/db/data-source.ts, re-expressed identically inside DatabaseModule's forRootAsync factory — any future connection-option change must be applied in both places"

requirements-completed: [DATA-03, DATA-04]

coverage:
  - id: D1
    description: "Single shared connection-options shape drives both the CLI and the app; synchronize disabled in both"
    requirement: "DATA-03"
    verification:
      - kind: other
        ref: "grep -c 'synchronize: false' src/db/data-source.ts src/modules/core/database.module.ts (2 total, one per file) + npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "AppModule imports AppConfigModule before DatabaseModule; nest build compiles the wired app"
    requirement: "DATA-04"
    verification:
      - kind: other
        ref: "npx nest build (exit 0); grep imports: src/app.module.ts shows [AppConfigModule, DatabaseModule]"
        status: pass
    human_judgment: false
  - id: D3
    description: "main.ts calls app.enableShutdownHooks() before app.listen() so SIGTERM closes the TypeORM pool gracefully"
    requirement: "DATA-04"
    verification:
      - kind: other
        ref: "grep enableShutdownHooks src/main.ts (positioned after NestFactory.create, before app.listen)"
        status: pass
    human_judgment: false
  - id: D4
    description: "App boots end-to-end against the local docker-compose Postgres 16 container, initializing AppConfigModule before DatabaseModule/TypeOrmModule"
    verification:
      - kind: other
        ref: "node dist/main.js smoke test against 127.0.0.1:5488 — log shows AppConfigModule dependencies initialized, then DatabaseModule, then TypeOrmModule, then TypeOrmCoreModule connects (SELECT version()); Nest application successfully started"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-07-17
status: complete
---

# Phase 1 Plan 2: Shared DataSource, Database Module, and Shutdown Hooks Summary

**One shared TypeORM DataSource options shape now drives both the CLI (`-d src/db/data-source.ts`) and the app's `DatabaseModule` factory, with `synchronize: false` hard-locked in both; `AppModule` wires config-before-database and `main.ts` enables graceful shutdown hooks.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-17
- **Completed:** 2026-07-17T14:28:33Z
- **Tasks:** 2 (both auto, no checkpoints)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Created `src/db/data-source.ts`: exports `dataSourceOptions` (`type: 'postgres'`, `url: process.env.DATABASE_URL`, `synchronize: false`, `logging` gated on `NODE_ENV`, `__dirname`-relative `entities`/`migrations` globs via `path.join`) plus `dataSource`/`default` exports consumed by the TypeORM CLI's `-d` flag; `dotenv/config` is imported first since the CLI has no Nest bootstrap of its own.
- Created `src/modules/core/database.module.ts`: `DatabaseModule` registers `TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory })`, re-expressing the identical connection shape (`synchronize: false`, `autoLoadEntities: true`, same `__dirname`-relative globs) sourced from the validated `ConfigService` rather than raw `process.env`.
- Wired `AppModule`'s `imports` array to `[AppConfigModule, DatabaseModule]` in that exact order, so `ConfigService`'s DI dependency forces config validation to resolve before `DatabaseModule`'s factory runs (Pitfall 3 from research).
- Added `app.enableShutdownHooks()` to `main.ts`, positioned after `NestFactory.create(AppModule)` and before `app.listen(...)`, so SIGTERM triggers Nest's `onModuleDestroy` chain and closes the TypeORM pool instead of a hard kill.
- Ran an extra (beyond-plan) end-to-end boot smoke test: copied `.env.example` to `.env`, built with `nest build`, ran `node dist/main.js` against the already-running local docker-compose Postgres 16 container (`127.0.0.1:5488`) — confirmed `AppConfigModule` initializes before `DatabaseModule`/`TypeOrmModule`, the connection succeeds (`SELECT version()`), and the app starts cleanly. `.env` was removed afterward (gitignored, never committed).

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared DataSource + app-side database module (synchronize disabled)** — `f7f325e` (feat)
2. **Task 2: Wire AppModule imports (ordered) + enable shutdown hooks in main.ts** — `1f2cd81` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `apps/gutcallfun-core/src/db/data-source.ts` — shared `DataSourceOptions`/`DataSource`, CLI entry point
- `apps/gutcallfun-core/src/modules/core/database.module.ts` — `DatabaseModule` with `TypeOrmModule.forRootAsync`
- `apps/gutcallfun-core/src/app.module.ts` — imports `AppConfigModule` then `DatabaseModule`
- `apps/gutcallfun-core/src/main.ts` — adds `app.enableShutdownHooks()`

## Decisions Made

- `dotenv` loaded via side-effect import (`import 'dotenv/config'`) in `data-source.ts` without adding it to `package.json` — it resolves transitively through `@nestjs/config`'s own dependency tree via npm workspace hoisting (confirmed present at the workspace-root `node_modules/dotenv`); matches CLAUDE.md's "Don't Hand-Roll" guidance and the plan's explicit instruction not to add it as a direct dependency.
- Entities/migrations resolved via `__dirname`-relative globs (`path.join` in `data-source.ts`, string concatenation in `database.module.ts`) rather than hardcoded `dist/`-only paths, so the exact same file works under `tsx` in dev (`.ts` source) and compiled `node` in prod (`.js` output) without any connection-option drift between the two runtimes.

## Deviations from Plan

None — plan executed exactly as written. The end-to-end boot smoke test (copying `.env.example` to `.env`, running `node dist/main.js`, then removing `.env`) was additional verification beyond the plan's required automated checks, performed to raise confidence beyond the compile-only `nest build` gate; it did not require any code change.

## Issues Encountered

None.

## User Setup Required

None — the local docker-compose Postgres 16 container from Plan 01-01 was already running and healthy (`127.0.0.1:5488`, `gutcallfun`/`gutcallfun`/`changeme-local-only`), used only for the optional boot smoke test.

## Next Phase Readiness

- `apps/gutcallfun-core` now boots end-to-end against Postgres 16 with config validated first, database connected second, and graceful shutdown wired.
- No entity files exist yet — `entities`/`migrations` globs currently match zero files, which is expected; Plan 01-03 is expected to add the raw-SQL initial-schema migration (transcribed from `initial-db-structure.sql`) into `src/db/migrations/`, and Plan 01-04 is expected to add the TypeORM entities under `src/models/` that describe that schema (per `01-RESEARCH.md`'s Pattern 3/Pattern 4 and the empty-diff verification gate).
- No blockers for 01-03 or 01-04.

---
*Phase: 01-foundation-data-layer*
*Completed: 2026-07-17*

## Self-Check: PASSED

All created/modified files verified on disk (data-source.ts, database.module.ts, app.module.ts, main.ts, this SUMMARY.md). Both task commits (f7f325e, 1f2cd81) verified present in git log.
