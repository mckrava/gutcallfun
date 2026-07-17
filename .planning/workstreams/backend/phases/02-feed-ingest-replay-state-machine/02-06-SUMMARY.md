---
phase: 02-feed-ingest-replay-state-machine
plan: 06
subsystem: ingest
tags: [nestjs, typeorm, replay, txodds, txline, tsx]

# Dependency graph
requires:
  - phase: 02-feed-ingest-replay-state-machine (plan 03)
    provides: "EventIngestService.processEvent(gameId, raw) — the single source-agnostic pipeline entry point; GameStateRegistry/GameStateMachine per-game in-memory state"
  - phase: 02-feed-ingest-replay-state-machine (plan 04)
    provides: "TxlineHttpClient (INGST-01 shared authenticated fetch, exported by FixturesModule) reused for the historical fetch"
provides:
  - "emitReplay(): ported/adapted replay emitter (D-03 timestamp rebasing, D-04 pacing with the reference repo's maxGapMs=5000 pre-match clamp removed by default) — takes an ordered raw-event array + async onEvent callback"
  - "HistoricalClient.fetch(fixtureId) — Source A, GET /api/scores/historical/{fixtureId} via TxlineHttpClient, in-memory-only per-process cache"
  - "ReplaySourceService.load(game) — Source A/B loader: historical fetch first, falling back to a captured NDJSON file or the game's own game_event rows ORDER BY seq"
  - "ReplayStarterService.start(gameId, speed?) — is_replay-guarded auto-wipe (game_event rows + denormalized score/state + BOTH GameStateRegistry and GameStateMachine in-memory state) then drives emitReplay() into EventIngestService.processEvent, identical to the live SSE entry point (RPLY-02)"
  - "npm run replay:create -- <fixtureId> [--speed N] [--team1 Name] [--team2 Name] — dev/admin arming script inserting an is_replay=true, starts_at=now()+~3min game row; multiple takes = multiple rows (partial unique index)"
  - "ReplayModule filled, exports ReplayStarterService for the Plan-07 scheduler"
affects: [02-07-recovery, phase-04-windows-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Replay emitter takes an ordered raw-event array (not a file path or a stream) + an async per-event callback — both Source A (historical) and Source B (NDJSON/own game_event rows) normalize to this SAME shape before reaching emitReplay(), so the emitter itself never branches on source"
    - "D-04 deviation from port-as-is: reference repo's createReplayDriver defaults maxGapMs=5000 (always clamps); this project's emitReplay() defaults maxGapMs=Infinity (no clamp) — documented inline as a deliberate CONTEXT.md-wins override, not an oversight"
    - "D-07 auto-wipe must reset THREE separate stores, not just the DB row: game_event rows (DB), GameStateRegistry (Plan01 in-memory scalar state), and GameStateMachine's own AttackStore/GoalStore closures (Plan02/03, a SEPARATE per-gameId registry) — missing the third would let take #2 reconcile goals against take #1's stale Id-anchored dedup state"
    - "speed>1 (D-04, headless-testing only) is never a DB column (no games.speed field in the authoritative schema) — passed as an explicit start(gameId, speed) argument from a trusted caller, with a REPLAY_SPEED env var as a secondary headless-config fallback for manual operator runs"

key-files:
  created:
    - apps/gutcallfun-core/src/modules/ingest/replay/replay.ts
    - apps/gutcallfun-core/src/modules/ingest/replay/historical.client.ts
    - apps/gutcallfun-core/src/modules/ingest/replay/replay-source.service.ts
    - apps/gutcallfun-core/src/modules/ingest/replay/replay.spec.ts
    - apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.ts
    - apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.spec.ts
    - apps/gutcallfun-core/scripts/replay-create.ts
  modified:
    - apps/gutcallfun-core/src/modules/ingest/replay/replay.module.ts
    - apps/gutcallfun-core/src/modules/ingest/pipeline/pipeline.module.ts
    - apps/gutcallfun-core/package.json

key-decisions:
  - "emitReplay() ports ONLY createReplayDriver's historical-array branch + parseHistoricalResponse from the reference repo — the NDJSON-file playback branch and parseReplayArgs CLI parser are not ported verbatim, because this project's Source B (replay-source.service.ts) already normalizes NDJSON captures AND own game_event rows to the same ordered-array shape Source A produces, so the emitter only needs one array-driven code path."
  - "D-04's maxGapMs default changed from the reference's 5000 to Infinity (no clamp) — a deliberate, inline-documented deviation from port-as-is, per CONTEXT.md D-04 explicitly locking 'no compression, no skip' for the pre-match segment over the reference repo's own default."
  - "Source B tries an NDJSON capture file first (convention-based path, REPLAY_CAPTURES_DIR env override, optional and not routed through the fail-fast AppConfig schema since it's a non-security-critical convenience path), then falls back to the game's own game_event rows ORDER BY seq — both options from the plan's action text are implemented, tried in that order."
  - "[Rule 3 - Blocking] pipeline.module.ts now exports GameStateMachine (previously provider-only, exports: [EventIngestService]). ReplayStarterService needs the SAME GameStateMachine singleton instance EventIngestService uses so its D-07 wipe resets the actual attack/goal closures the pipeline reads from — a second unexported GameStateMachine instance in ReplayModule would silently do nothing."
  - "[Rule 2 - Missing Critical] Added GameStateMachine.remove(gameId) + GameStateRegistry.remove(gameId) to the auto-wipe, beyond what the plan's action text named. Both methods already existed (Plan 01/03 built them as eviction hooks); the plan's D-07 wording ('resets denormalized score/state') was satisfied at the DB-row level by the literal action text, but leaving in-memory state unreset would let take #2 start from take #1's leftover possession stage, score, connectionId, AND (critically) the goal-dedup Id set — a correctness gap the D-07/RPLY-03 idempotency intent clearly requires closing."

requirements-completed: [RPLY-01, RPLY-02, RPLY-03]

coverage:
  - id: D1
    description: "emitReplay() rebases every event's Ts by delta = now() - firstEvent.Ts (D-03) and paces inter-event delay as originalGap / speed (D-04), never mutating the caller's source array"
    requirement: "RPLY-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/replay/replay.spec.ts#emitReplay (rebasing, no-mutation, speed scaling, speed=1 passthrough tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A large pre-match gap is NOT clamped to the reference repo's default 5000ms — the full original gap is preserved at speed=1 (D-04 explicit override of port-as-is), while an explicitly-passed maxGapMs is still honored for headless testing"
    requirement: "RPLY-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/replay/replay.spec.ts#emitReplay 'does NOT clamp a large pre-match gap...' + 'still honors an explicitly-passed maxGapMs...'"
        status: pass
      - kind: other
        ref: "grep -n maxGapMs apps/gutcallfun-core/src/modules/ingest/replay/replay.ts — shows the clamp default changed to Infinity with an inline deviation comment"
        status: pass
    human_judgment: false
  - id: D3
    description: "ReplaySourceService.load(game) returns Source A (historical, cached) when non-empty; falls back to Source B (NDJSON capture, then the game's own game_event rows ORDER BY seq) when Source A is empty (RESEARCH Pitfall 2 retention-window miss); never depends on TxLINE VirtualFixture (D-05)"
    requirement: "RPLY-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/replay/replay.spec.ts#ReplaySourceService.load (3 tests: A returned directly, A->B fallback, both-empty)"
        status: pass
    human_judgment: false
  - id: D4
    description: "ReplayStarterService.start(gameId) refuses to wipe or emit for an is_replay=false game (D-07 hard guard, never wipes a live append-only log); for is_replay=true it wipes game_event rows + resets denormalized score/state + BOTH in-memory registries BEFORE the source is loaded/emitted"
    requirement: "RPLY-02"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.spec.ts#'refuses to wipe or emit for an is_replay=false game' + 'wipes prior game_event rows...BEFORE emitting' + 'resets BOTH GameStateRegistry and GameStateMachine...'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every rebased event is driven into EventIngestService.processEvent(gameId, raw) with the exact same 2-arg call shape as the live SSE path — no downstream mode flag (RPLY-02)"
    requirement: "RPLY-02"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.spec.ts#'drives every rebased event into EventIngestService.processEvent with NO mode flag (RPLY-02)'"
        status: pass
    human_judgment: false
  - id: D6
    description: "npm run replay:create -- <fixtureId> validates fixtureId as a positive integer before any DB write, and successfully inserts an is_replay=true, status='scheduled', starts_at~=now()+3min game row; running it twice for the same fixtureId creates two rows with no unique-index collision (RPLY-03 multiple takes)"
    requirement: "RPLY-03"
    verification:
      - kind: other
        ref: "Manual end-to-end run against the shared local docker Postgres: `npm run replay:create -- 555 --team1 ... --team2 ...` twice for fixtureId=555 inserted game rows id=5 and id=6 (both is_replay=true, status=scheduled), confirmed via psql SELECT, then `npm run replay:create -- -5` rejected before any DB write (non-zero exit); test rows cleaned up afterward"
        status: pass
      - kind: other
        ref: "node -e check per PLAN.md's <verify><automated>: package.json scripts.replay-create present"
        status: pass
    human_judgment: false
  - id: D7
    description: "npm run build compiles cleanly and ReplayModule exports ReplayStarterService for the Plan-07 scheduler; full unit + e2e suite (105 unit tests, 2 e2e suites) passes unaffected by the pipeline.module.ts export change"
    verification:
      - kind: other
        ref: "cd apps/gutcallfun-core && npm run build (nest build) passes; npx jest passes 105/105; npx jest --config test/jest-e2e.json passes 2/2"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-17
status: complete
---

# Phase 2 Plan 06: Replay Emitter, Source A/B Loader & Demo Arming Script Summary

**Replay side of the source switch: a ported/adapted `emitReplay()` (D-03 timestamp rebasing, D-04 pacing with the reference repo's 5000ms pre-match clamp deliberately removed), a Source A (historical fetch, in-memory cache) / Source B (NDJSON capture or own `game_event` rows) loader, an `is_replay`-guarded auto-wipe starter that drives the SAME `EventIngestService.processEvent` entry point as live SSE, and a `replay:create` tsx script for demo choreography — verified end-to-end against a real Postgres instance.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-17T21:26:34Z
- **Completed:** 2026-07-17T21:39:15Z
- **Tasks:** 3
- **Files modified:** 10 (7 created, 3 modified)

## Accomplishments
- `emitReplay()` (Task 1): adapted port of the reference repo's `createReplayDriver` (historical-array branch) + `parseHistoricalResponse`, taking an ordered raw-event array and an async per-event callback. Adds D-03 timestamp rebasing (not present in the reference) and deliberately removes the reference's default 5000ms `maxGapMs` clamp (D-04) so a multi-hour pre-match gap plays at full original pacing.
- `HistoricalClient` (Task 1): Source A — `GET /api/scores/historical/{fixtureId}` via the shared `TxlineHttpClient`, in-memory-only per-process cache; never throws past a retention-window miss (falls back cleanly).
- `ReplaySourceService` (Task 1): Source A/B loader — historical first, then an NDJSON capture file, then the game's own `game_event` rows `ORDER BY seq` (the same read pattern Plan 07's boot-recovery will reuse).
- `ReplayStarterService` (Task 2): `start(gameId, speed?)` — refuses (throws, no side effect) for an `is_replay=false` game; for `is_replay=true`, wipes prior `game_event` rows, resets denormalized `score_p1/p2`/`current_status_id`/`stream_cursor(_at)`, AND clears both `GameStateRegistry` and `GameStateMachine`'s internal attack/goal closures, THEN drives `emitReplay()` into `EventIngestService.processEvent(gameId, raw)` — identical entry point to live SSE, no mode flag (RPLY-02).
- `ReplayModule` filled (Task 2): imports `PipelineModule` + `FixturesModule` + `forFeature([GameEntity, GameEventEntity])`; exports `ReplayStarterService` for the Plan-07 scheduler.
- `scripts/replay-create.ts` + `replay:create` npm script (Task 3): `npm run replay:create -- <fixtureId> [--speed N] [--team1 Name] [--team2 Name]` validates `fixtureId` as a positive integer before any DB write, inserts an `is_replay=true`, `status='scheduled'`, `starts_at=now()+~3min` game row. Verified end-to-end: two invocations for the same `fixtureId` created two rows with no unique-index collision (RPLY-03).

## Task Commits

Each task was committed atomically:

1. **Task 1: Port replay.ts (rebasing + pacing) + Source A/B loader** - `33ec6d4` (feat)
2. **Task 2: ReplayStarterService with is_replay-guarded auto-wipe** - `97cb0f8` (feat)
3. **Task 3: replay:create dev arming script** - `b1f74c8` (feat)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified
- `apps/gutcallfun-core/src/modules/ingest/replay/replay.ts` - `emitReplay()`, `parseHistoricalResponse()` (RPLY-01, D-03/D-04)
- `apps/gutcallfun-core/src/modules/ingest/replay/historical.client.ts` - `HistoricalClient.fetch()` (Source A, D-01)
- `apps/gutcallfun-core/src/modules/ingest/replay/replay-source.service.ts` - `ReplaySourceService.load()` (Source A/B, D-01, D-05)
- `apps/gutcallfun-core/src/modules/ingest/replay/replay.spec.ts` - 15 tests: rebasing, pacing, no-clamp, parseHistoricalResponse shapes, A->B fallback
- `apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.ts` - `ReplayStarterService.start()` (D-07, RPLY-02/03)
- `apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.spec.ts` - 6 tests: wipe ordering, dual state reset, mode-flagless emission, is_replay=false refusal, missing-game, empty-source
- `apps/gutcallfun-core/src/modules/ingest/replay/replay.module.ts` - filled: providers + exports `ReplayStarterService`
- `apps/gutcallfun-core/src/modules/ingest/pipeline/pipeline.module.ts` - now also exports `GameStateMachine` (deviation, see below)
- `apps/gutcallfun-core/scripts/replay-create.ts` - `npm run replay:create -- <fixtureId> ...` (D-06, D-08, RPLY-03)
- `apps/gutcallfun-core/package.json` - added `replay:create` script (tsx invocation, matching `migration:*` style)

## Decisions Made
- `emitReplay()` only ports the reference repo's historical-array code path, not the NDJSON-file branch or `parseReplayArgs` — this project's Source B already normalizes to the same ordered-array shape before reaching the emitter, so a second file-driven code path inside the emitter itself would be redundant.
- `maxGapMs` default changed from the reference's 5000 to `Infinity` — an explicit, inline-documented deviation from "port as-is" per CONTEXT.md D-04's locked "no compression, no skip" pre-match requirement.
- Source B tries an NDJSON capture file first (`REPLAY_CAPTURES_DIR` env override, default `<cwd>/replay-captures`, deliberately NOT routed through the fail-fast `AppConfig` schema since it's an optional convenience path with a safe empty-directory fallback), then the game's own `game_event` rows `ORDER BY seq`.
- `speed>1` is never persisted as a DB column (none exists in `initial-db-structure.sql`); `ReplayStarterService.start()` accepts it as an explicit argument from a trusted (non-user-facing) caller, with a `REPLAY_SPEED` env var as a secondary headless-config fallback — matching the must_haves wording "reachable ONLY via the script arg / headless config, never from a user-facing surface" (D-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pipeline.module.ts` now exports `GameStateMachine`**
- **Found during:** Task 2 (`ReplayStarterService` implementation)
- **Issue:** `PipelineModule` provided `GameStateMachine` but only exported `EventIngestService`. `ReplayStarterService`'s D-07 auto-wipe needs to reset the state machine's own `AttackStore`/`GoalStore` closures — but injecting `GameStateMachine` into `ReplayModule` without it being exported by `PipelineModule` would either fail DI resolution or (if separately provided) create a SECOND, disconnected instance that resets nothing the pipeline actually reads from.
- **Fix:** Added `GameStateMachine` to `PipelineModule`'s `exports` array (`exports: [EventIngestService, GameStateMachine]`), so `ReplayModule` (which imports `PipelineModule`) injects the SAME singleton instance `EventIngestService` uses.
- **Files modified:** `apps/gutcallfun-core/src/modules/ingest/pipeline/pipeline.module.ts`
- **Verification:** `npm run build` compiles; full unit suite (105 tests) and both e2e suites (`ingest-pipeline.e2e-spec.ts`, `app.e2e-spec.ts`) still pass, confirming the export addition didn't disturb Plan 03's existing DI wiring.
- **Committed in:** `97cb0f8` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Auto-wipe also resets `GameStateRegistry` and `GameStateMachine` in-memory state, not just DB columns**
- **Found during:** Task 2 (`ReplayStarterService.wipeAndResetGame`)
- **Issue:** PLAN.md's D-07 action text names resetting "denormalized score/state" at the DB-row level (`score_p1/p2`, `current_status_id`, `stream_cursor(_at)`). Implemented literally, a take #2 replay would still carry over take #1's in-memory `GameState` (score, possession stage, `lastSeq`/`connectionId`) AND, more critically, `GameStateMachine`'s Id-anchored `GoalStore` dedup set — the SAME `Id` values from take #1 would already be marked "seen," silently suppressing or mis-reconciling take #2's goal events.
- **Fix:** `wipeAndResetGame()` also calls `GameStateRegistry.remove(gameId)` and `GameStateMachine.remove(gameId)` (both pre-existing eviction-hook methods from Plans 01/03) before the DB wipe completes, so `getOrCreate()` rebuilds fresh state on the next event.
- **Files modified:** `apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.ts`
- **Verification:** `replay-starter.service.spec.ts#'resets BOTH GameStateRegistry and GameStateMachine...'` asserts both `.remove(gameId)` calls happen.
- **Committed in:** `97cb0f8` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking DI-wiring fix, 1 missing-critical-functionality fix for replay idempotency correctness)
**Impact on plan:** Both fixes are necessary for the D-07/RPLY-03 "take #2 never collides / never reconciles against stale state" guarantee the plan's must_haves require. No scope creep — no new files beyond what the plan named, no new user-facing behavior.

## Issues Encountered
- The worktree's local `npm run migration:run` failed (`ERR_MODULE_NOT_FOUND` on the hoisted `../../node_modules/typeorm/cli.js` relative path) — a pre-existing worktree/monorepo tooling quirk unrelated to this plan's changes (out of scope per the deviation rules' SCOPE BOUNDARY). Worked around it by reusing the already-migrated shared local docker Postgres (`gutcallfun-db-1`, port 5488, schema already present from an earlier phase) for the Task 3 manual verification instead of running migrations in this worktree.
- No `.env` existed in this worktree (git-ignored, not copied into linked worktrees — the same gap Plan 03's SUMMARY documented). Wrote a local git-ignored `apps/gutcallfun-core/.env` pointing at the shared Postgres with placeholder (non-real) TxLINE credentials, matching Plan 03's precedent exactly. No real TxLINE credentials were used or committed.

## User Setup Required

None for this plan's deliverables — no schema DDL, no new required env vars. A real `.env` with actual TxLINE credentials (`TXLINE_GUEST_JWT`, `TXLINE_API_TOKEN`) is still required before `HistoricalClient` can be exercised against the live feed (this plan's own verification used a mocked `TxlineHttpClient` for unit tests and a placeholder-credentials `.env` for the DB-only `replay:create` manual check, which never calls the historical endpoint).

## Next Phase Readiness
- `ReplayStarterService.start(gameId, speed?)` is the frozen, tested entry point Plan 07's ~15s replay-arm scheduler will call once it exists (D-06's scheduler rule: `starts_at<=now() AND status='scheduled'` for ALL games, live or replay).
- `ReplaySourceService`'s "own game_event rows `ORDER BY seq`" branch is the exact read pattern Plan 07's boot-recovery (RCVR-01) reuses — "build once, use twice" per D-01, already proven correct by this plan's tests.
- `ReplayModule` exports only `ReplayStarterService` — Plan 07 injects that single service and does not need to know about `HistoricalClient`/`ReplaySourceService`/`emitReplay` internals.
- No blockers for Plan 07. One open item for Plan 07 (or a later polish pass) to consider: `REPLAY_SPEED` is read once per `ReplayStarterService.start()` call as a process-env fallback — if Plan 07's scheduler wants a per-arm speed control instead of a single process-wide knob, it will need to pass `speed` explicitly to `start()` (already supported) rather than relying on the env var.

---
*Phase: 02-feed-ingest-replay-state-machine*
*Completed: 2026-07-17*

## Self-Check: PASSED

All 7 created files and 3 modified files verified present on disk; all 3 task commits (`33ec6d4`, `97cb0f8`, `b1f74c8`) verified in `git log`.
