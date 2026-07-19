---
phase: 260719-hr6
plan: 01
subsystem: infra
tags: [typeorm, postgres, nestjs-schedule, cron, replay, migration]

requires:
  - phase: 02-feed-ingest-replay-state-machine
    provides: ReplayStarterService, ReplaySourceService, SourceSchedulerService (D-02 is_replay source-switch), GameStateRebuildService boot recovery
provides:
  - "replay_loop control table (migration + entity) — the entire post-World-Cup operator control surface, driven by plain SQL, ships disabled"
  - "ReplayLoopService: 30s cron that clones a finished/cancelled replay game forward (never resets in place), carries user_game participation forward, and force-finishes games stranded at status=live"
affects: [ops-runbook, post-submission-demo]

tech-stack:
  added: []
  patterns:
    - "Operator control table with no FK on its target-row columns (template_game_id/current_game_id) — avoids migration:generate FK-drop drift for a hand-driven psql surface"
    - "Clone-forward instead of reset-in-place for disposable/replayable rows sharing a UNIQUE(...) WHERE clause exemption"

key-files:
  created:
    - apps/gutcallfun-core/src/db/migrations/AddReplayLoop1790200000000.ts
    - apps/gutcallfun-core/src/models/game/replay-loop.entity.ts
    - apps/gutcallfun-core/src/modules/ingest/recovery/replay-loop.service.ts
    - apps/gutcallfun-core/src/modules/ingest/recovery/replay-loop.service.spec.ts
  modified:
    - apps/gutcallfun-core/src/modules/ingest/recovery/recovery.module.ts

key-decisions:
  - "Deliverable 3 (GameStateRebuildService is_replay guard) required no work — already implemented at game-state-rebuild.service.ts:101-105 and already covered by game-state-rebuild.service.spec.ts:127 (verified against current HEAD, not just survey-time notes)."
  - "Clone forward, never reset in place — locked in the plan's design_constraints and preserved as-is: no FK has ON DELETE CASCADE, wipeAndResetGame only deletes game_event (broken on take 2 for an existing row), and LiveWindowRegistry/GameMutexRegistry.remove() have zero callers so a fresh game_id is the only clean reset path."
  - "ReplayLoopService never calls ReplayStarterService/StreamManagerService directly — it only INSERTs status=scheduled clones for SourceSchedulerService's existing ~15s tick to pick up, preserving D-02's single is_replay source-switch scheduler rule."

patterns-established:
  - "Stall watchdog: force-finish a status=live game with no fresh game_event activity for stall_timeout_seconds, via the same conditional UPDATE...WHERE status='live' claim pattern GameFinalisationService and SourceSchedulerService.startGame already use (a concurrent real game_finalised wins the race, watchdog becomes a 0-row no-op)."

requirements-completed: [RPLY-LOOP-01, RPLY-LOOP-02, RPLY-LOOP-03]

coverage:
  - id: D1
    description: "replay_loop migration + TypeORM entity: 12 columns, partial idx_replay_loop_enabled index, zero seeded rows, no FKs on template_game_id/current_game_id"
    requirement: "RPLY-LOOP-01"
    verification:
      - kind: unit
        ref: "grep -c 'GENERATED ALWAYS AS IDENTITY' AddReplayLoop1790200000000.ts && grep -c \"@Entity('replay_loop')\" replay-loop.entity.ts"
        status: pass
      - kind: integration
        ref: "npm run migration:run / migration:revert against local Postgres 16 (127.0.0.1:5488) — table created with 0 rows, all 12 columns + partial index verified via psql \\d, then cleanly dropped on revert"
        status: pass
    human_judgment: false
  - id: D2
    description: "ReplayLoopService 30s cron: off-state hot path, advance (delay + iteration cap gates, clone payload, user_game carry-forward), stall watchdog (event-based + fallback-timestamp), error isolation to last_error"
    requirement: "RPLY-LOOP-02"
    verification:
      - kind: unit
        ref: "replay-loop.service.spec.ts — 13 cases, all pass (see Task 3 commit)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json — clean for all new files"
        status: pass
    human_judgment: false
  - id: D3
    description: "GameStateRebuildService is_replay guard (originally requested deliverable) — verified ALREADY IMPLEMENTED, no code change made"
    requirement: "RPLY-LOOP-03"
    verification:
      - kind: unit
        ref: "game-state-rebuild.service.spec.ts:127 — pre-existing passing spec, re-run as part of full suite in this task"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operator smoke test: enable a loop via INSERT, watch it clone/advance/cap/pause end-to-end against a live scheduler"
    verification: []
    human_judgment: true
    rationale: "Requires a running app process, a real fixture with replay-source data, and wall-clock observation across multiple cron ticks — the plan's own <human-check> section, not reproducible in an automated unit/integration run."

duration: ~25min
completed: 2026-07-19
status: complete
---

# Quick Task 260719-hr6: Infinite Replay Loop (DB-Toggled, Clone-Forward) Summary

**Added a `replay_loop` control table and a 30s `ReplayLoopService` cron that clones finished replay games forward indefinitely (never resetting in place) and force-finishes games stranded live, so the demo stays alive after the World Cup ends without any code or env change.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3 completed
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `replay_loop` table + `ReplayLoopEntity` shipped disabled (zero seeded rows) — the entire post-World-Cup control surface is a plain `UPDATE replay_loop SET ...` over psql, with a partial index keeping the off-state tick a single indexed read.
- `ReplayLoopService` 30s cron: clones a finished/cancelled game forward (new `game` row, same `fixture_id`, LOCKED design — never resets in place, never deletes), carries `user_game` participation forward with `ON CONFLICT DO NOTHING`, gates on `restart_delay_seconds`/`max_iterations`, and never calls `ReplayStarterService`/`StreamManagerService` directly (D-02 preserved — `SourceSchedulerService` remains the sole source-switch dispatcher).
- Stall watchdog force-finishes a game stuck at `status='live'` with no fresh `game_event` activity for `stall_timeout_seconds`, closing the pending todo `replay-restart-orphans-mid-flight-game` (restart-mid-replay orphan).
- Verified against real Postgres 16: `migration:run` created the table (12 columns, partial index, 0 rows) and `migration:revert` dropped it cleanly.
- Deliverable 3 (GameStateRebuildService `is_replay` guard) confirmed already implemented at `game-state-rebuild.service.ts:101-105` with an existing passing spec (`game-state-rebuild.service.spec.ts:127`) — no code touched there, per the plan's `<source_audit>`.

## Task Commits

1. **Task 1: replay_loop migration + TypeORM entity** - `2b48407` (feat)
2. **Task 2: ReplayLoopService — 30s advance + stall watchdog cron** - `2b8963c` (feat)
3. **Task 3: ReplayLoopService unit spec** - `bfb4995` (test — also carries prettier line-wrap reformatting of Task 1/2 files from `npm run lint`, no logic changes)

## Files Created/Modified

- `apps/gutcallfun-core/src/db/migrations/AddReplayLoop1790200000000.ts` - hand-written migration, creates `replay_loop` + `idx_replay_loop_enabled`, no seed rows
- `apps/gutcallfun-core/src/models/game/replay-loop.entity.ts` - `ReplayLoopEntity`, mirrors the migration 1:1, deliberately no FK relations
- `apps/gutcallfun-core/src/modules/ingest/recovery/replay-loop.service.ts` - the 30s cron: off-state fast path, stall watchdog, advance/clone/carry-forward
- `apps/gutcallfun-core/src/modules/ingest/recovery/replay-loop.service.spec.ts` - 13 unit test cases covering all documented behaviors
- `apps/gutcallfun-core/src/modules/ingest/recovery/recovery.module.ts` - wired `ReplayLoopEntity`/`UserGameEntity` into `forFeature` and `ReplayLoopService` into `providers`

## Decisions Made

- Followed the plan's LOCKED design exactly: clone-forward, no FK on `template_game_id`/`current_game_id`, no env var, no seeded row, no REST/DTO/WS exposure of `replay_loop`, `wipeAndResetGame` untouched, `GameStateRebuildService`'s guard untouched.
- Used a minimal, gitignored `.env` (DATABASE_URL only) purely to exercise `migration:run`/`migration:revert` against the local Postgres 16 container for verification — never committed, deleted immediately after use.

## Deviations from Plan

None — plan executed exactly as written, including the explicit no-op for deliverable 3.

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc comment self-terminated early on `*/15s` inside prose**

- **Found during:** Task 2, first `tsc --noEmit` pass
- **Issue:** The service's header JSDoc used the literal text `(@Cron */15s)` to describe `SourceSchedulerService`'s cadence; `*/` inside a `/** ... */` block comment closes the comment early, turning the rest of the file into a cascade of ~250 parse errors.
- **Fix:** Reworded to `(@Cron every ~15s)` — no code semantics affected, comment-only.
- **Files modified:** `apps/gutcallfun-core/src/modules/ingest/recovery/replay-loop.service.ts`
- **Verification:** `npx tsc --noEmit -p tsconfig.json` clean for the file afterward.
- **Committed in:** `2b8963c` (part of Task 2 commit — caught before the initial commit, not a follow-up fix)

---

**Total deviations:** 1 auto-fixed (Rule 1, caught pre-commit during the task's own verify step)
**Impact on plan:** None — comment wording only, no scope creep.

## Issues Encountered

- `npm run lint` in this repo runs `eslint ... --fix` and its glob (`{src,apps,libs,test}/**/*.ts`) covers the entire backend, not just this task's files. The first run reformatted ~50 unrelated pre-existing files across the repo. Per this task's constraint (never sweep unrelated work into a commit), I reverted every unrelated file with `git checkout --` and kept only the reformatting that landed inside the 4 files this plan actually touches (pure prettier line-wraps, verified via `git diff` — no logic changes), then re-ran `tsc`/tests to confirm nothing broke. Nothing from other in-flight sessions was committed.
- `npm run migration:run`/`migration:revert` use a relative `../../node_modules/typeorm/cli.js` path that resolves correctly when run from the main checkout but not from this nested git worktree (no local `node_modules` at the worktree root by design). Worked around by invoking `tsx` against the main repo's absolute `node_modules/typeorm/cli.js` path — same script, same `data-source.ts`, real Postgres 16 container (`gutcallfun-db-1`, port 5488). This is a worktree-execution quirk, not a defect in the migration or the plan.
- `npm test` (full suite) has 2 pre-existing failures in `stream-manager.service.spec.ts` (`AppConfig`/`ConfigModule` env validation + a real-Postgres integration spec) caused by this worktree lacking the full `.env` with TxLINE credentials — unrelated to this task (that file was never touched) and present before this plan started. 250/252 tests pass; all `replay-loop.service.spec.ts` (13/13), all other recovery specs (`source-scheduler`, `game-state-rebuild`, `rcvr-equivalence`), and the rest of the suite are green.
- `npm run lint` (pre-fix baseline, and even after `--fix`) reports errors in `replay-loop.service.spec.ts` of the same class (`@typescript-eslint/unbound-method`, `require-await`) that already exist in `source-scheduler.service.spec.ts` — the exact reference file Task 3 was instructed to mirror ("no Test.createTestingModule, none of the sibling recovery specs do"). Confirmed via `npx eslint source-scheduler.service.spec.ts` — 27 identical-class errors pre-exist there too. This is a repo-wide gap in this hand-rolled-mock test pattern, not something introduced by this task; fixing it would mean diverging from the explicitly mandated pattern, so it was left as-is (out of scope per the plan's own constraints).

## User Setup Required

None — no external service configuration required. The feature is entirely DB-driven (see `key-decisions`); no env var was added by design.

## Next Phase Readiness

- `replay_loop` ships disabled — safe to deploy as-is. Post-submission, an operator arms it with a single `INSERT INTO replay_loop (...) VALUES (..., enabled=true)` per the migration's own header usage example.
- Not addressed here (flagged per the plan's `<output>` instructions): `FixturesCronService.upsertAll` looks up games by `findOne({ where: { fixtureId } })`, which with many clones sharing one `fixture_id` would return an arbitrary one and update its metadata. This is inert post-World-Cup (the fixtures cron discovers nothing once the tournament ends) but would need attention if the loop is ever run against a fixture the cron is actively discovering.
- No blockers for future phases. `GameStateRebuildService`'s `is_replay` guard, `wipeAndResetGame`, the LOCKED points ladder, question timing, live-engine logic, and `apps/gutcallfun-ui` remain untouched.

---
*Quick task: 260719-hr6*
*Completed: 2026-07-19*

## Self-Check: PASSED

All 5 created/modified files verified present on disk; all 3 task commits (`2b48407`, `2b8963c`, `bfb4995`) verified present in `git log --oneline --all`.
