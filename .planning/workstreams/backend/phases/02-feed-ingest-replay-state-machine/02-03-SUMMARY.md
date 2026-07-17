---
phase: 02-feed-ingest-replay-state-machine
plan: 03
subsystem: ingest
tags: [nestjs, typeorm, transactions, async-mutex, idempotency, jest, postgres]

# Dependency graph
requires:
  - phase: 02-feed-ingest-replay-state-machine
    provides: "Plan 01 (GameMutexRegistry, GameStateRegistry, GameStreamGapEmitter, GameState shape, empty PipelineModule stub); Plan 02 (possession.ts classifyPossession/nextPossessionStage/createAttackStore, goals.ts classifyGoalEvent/createGoalStore, clock.ts feedElapsedMs)"
provides:
  - "MessageNormalizer: normalize(raw) -> game_event column shape (never throws; malformed input flagged ignorable); lazyFillPatch(raw) -> INGST-05 game-row patch for jersey/status/score_adjustment/goal"
  - "EventIngestService.processEvent(gameId, raw) — the single source-agnostic entry point Plan 05 (SSE) and Plan 06 (replay) both call: mutex-wrapped normalize -> orIgnore insert + stream_cursor flush + lazy-fill patch in ONE transaction -> state-machine apply -> ConnectionId-aware gap detect/emit"
  - "GameStateMachine: applyEvent(state, raw) bridges possession.ts/goals.ts onto the frozen GameState shape via per-game AttackStore/GoalStore registries; detectGap(state, seq, connectionId) implements the ConnectionId-aware Seq-gap check (RCVR-02)"
  - "Filled PipelineModule: TypeOrmModule.forFeature([GameEntity, GameEventEntity]), exports EventIngestService"
  - "e2e proof (ingest-pipeline.e2e-spec.ts) that 20x replay of one fixture through processEvent holds game_event row count constant and derived score correct on every pass, against real Postgres 16 — ROADMAP Phase 2 success criterion #3"
affects: [02-04-fixtures-cron, 02-05-stream-ingest, 02-06-replay-emitter, 02-recovery, phase-04-windows-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dataSource.transaction(async (manager) => {...}) wrapping BOTH the orIgnore insert and the game-row UPDATE — never a second bare .execute() against the top-level dataSource (Pitfall 4)"
    - "GameMutexRegistry.runExclusive(gameId, ...) wraps the entire processEvent body, including the DB transaction (STAT-02)"
    - "Per-message-type stage-name bridging (STAGE_MAP) between a pure ported module's internal vocabulary (possession.ts's lowercase safe/attack/danger/high_danger) and a frozen cross-plan DTO's wire vocabulary (GameState's PascalCase PossessionType strings) — resolved at the integration layer (Task 2), not by changing either side"
    - "Stateful closures (createAttackStore()/createGoalStore()) held in the state-machine's own per-gameId Map registries, separate from the scalar GameState object they update — GameState stays a plain frozen DTO"

key-files:
  created:
    - apps/gutcallfun-core/src/modules/ingest/persistence/message-normalizer.ts
    - apps/gutcallfun-core/src/modules/ingest/persistence/message-normalizer.spec.ts
    - apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.ts
    - apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.spec.ts
    - apps/gutcallfun-core/src/modules/ingest/state/game-state.machine.ts
    - apps/gutcallfun-core/test/ingest-pipeline.e2e-spec.ts
  modified:
    - apps/gutcallfun-core/src/modules/ingest/pipeline/pipeline.module.ts

key-decisions:
  - "stream_cursor is set to String(event.seq) at this pipeline layer — processEvent(gameId, raw) has no separate SSE-frame-id parameter per the plan's own fixed 2-arg contract; Plan 05 (SSE client) owns translating the stream's own `id:` block into this call if it ever needs to differ from Seq. Documented inline in event-ingest.service.ts."
  - "lazyFillPatch('goal') only applies its score_p1/p2 patch when Confirmed:true, mirroring goals.ts's deriveScore() count-on-first-confirm discipline — an unconfirmed goal's Score field must not prematurely denormalize onto the game row. lazyFillPatch('score_adjustment') always applies (that action is confirmed automatically per message-reference.md, no pending-confirmation gate exists for it)."
  - "GameStateMachine bridges possession.ts's lowercase PossessionStage vocabulary ('safe'|'attack'|'danger'|'high_danger') onto GameState's PascalCase PossessionType vocabulary ('SafePossession'|...) via an explicit STAGE_MAP — these are two intentionally different types from two different plans (Plan01 froze GameState against the wire vocabulary; Plan02 ported possession.ts's own internal vocabulary) and Task 2 is exactly the integration seam where they must be reconciled."
  - "AttackStore/GoalStore (Plan 02's stateful closures) are held in GameStateMachine's own internal Map<gameId, ...> registries rather than embedded in the GameState DTO — GameState (Plan01, frozen shape) stays scalar-only; the state machine is the sole owner of translating closure-internal state into GameState field updates."
  - "connectionId on GameState is typed string|null (Plan01); TxLINE's wire ConnectionId is a number (message-reference.md) — coerced via String(ConnectionId) at the point GameStateMachine.applyEvent()/EventIngestService.extractConnectionId() reads it, consistent with the frozen DTO shape."

requirements-completed: [INGST-03, INGST-04, INGST-05, STAT-01, STAT-02, STAT-03, RCVR-02]

coverage:
  - id: D1
    description: "MessageNormalizer.normalize() maps any raw feed message to the exact game_event column shape; unknown Action/StatusId stored raw without throwing; malformed/missing Seq or Ts flagged ignorable instead of inserted or thrown"
    requirement: "INGST-03"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/persistence/message-normalizer.spec.ts#MessageNormalizer.normalize (8 tests: valid/Fusion-envelope/unknown-action/open-set-StatusId/malformed-Seq/malformed-Ts/non-object/hostile-Proxy)"
        status: pass
    human_judgment: false
  - id: D2
    description: "MessageNormalizer.lazyFillPatch() extracts INGST-05 game-row patches for jersey/status/score_adjustment/goal; score_adjustment always overwrites (authoritative), goal only once Confirmed:true"
    requirement: "INGST-05"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/persistence/message-normalizer.spec.ts#MessageNormalizer.lazyFillPatch (8 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "EventIngestService.processEvent inserts via .orIgnore() and updates game.stream_cursor/stream_cursor_at inside the SAME transaction as the insert (never a second bare dataSource-level .execute())"
    requirement: "INGST-04"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.spec.ts#inserts via .orIgnore() and updates stream_cursor inside the SAME transaction manager"
        status: pass
      - kind: e2e
        ref: "apps/gutcallfun-core/test/ingest-pipeline.e2e-spec.ts (assertion c: game.stream_cursor equals the last processed event's Seq after 20 passes)"
        status: pass
    human_judgment: false
  - id: D4
    description: "processEvent runs the entire body inside GameMutexRegistry.runExclusive(gameId, ...) — per-game serial processing (STAT-02)"
    requirement: "STAT-02"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.spec.ts#runs the whole body inside GameMutexRegistry.runExclusive (STAT-02)"
        status: pass
    human_judgment: false
  - id: D5
    description: "GameStateMachine.detectGap emits GameStreamGapDetected for a true same-ConnectionId Seq discontinuity and never for a Seq reset caused by a ConnectionId change (RCVR-02)"
    requirement: "RCVR-02"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.spec.ts#emits GameStreamGapDetected for Seq > lastSeq+1 on the SAME ConnectionId (RCVR-02); #does NOT emit GameStreamGapDetected for a Seq reset across a ConnectionId change (Pitfall 7); #does NOT emit GameStreamGapDetected for consecutive Seq on the same ConnectionId"
        status: pass
    human_judgment: false
  - id: D6
    description: "GameStateMachine.applyEvent updates possession stage, attack run, StatusId, score (via goals.ts reconciliation), and the feed-Ts clock in GameStateRegistry after each persisted event (STAT-01, STAT-03)"
    requirement: "STAT-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.spec.ts#updates in-memory GameState only after a successful commit (score reflects a confirmed goal)"
        status: pass
      - kind: e2e
        ref: "apps/gutcallfun-core/test/ingest-pipeline.e2e-spec.ts (assertion b: derived score equals the fixture's terminal Score field on all 20 passes)"
        status: pass
    human_judgment: false
  - id: D7
    description: "20x replay of one fixture through processEvent leaves the game_event row count identical across all 20 runs (zero duplicates) and the in-memory state-machine score equal to the fixture's terminal Score on every pass — ROADMAP Phase 2 success criterion #3"
    requirement: "INGST-03"
    verification:
      - kind: e2e
        ref: "apps/gutcallfun-core/test/ingest-pipeline.e2e-spec.ts#replays the same 9-event fixture 20x: zero duplicate rows and score matches the terminal Score on every pass"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-07-17
status: complete
---

# Phase 2 Plan 03: Persistence, Per-Game Mutex & State Machine Summary

**event-ingest.service.ts's `processEvent(gameId, raw)` — the single source-agnostic pipeline entry point: defensive normalize -> per-game mutex-wrapped, idempotent orIgnore insert + same-transaction stream_cursor flush + INGST-05 lazy-fill -> possession/goal state-machine apply -> ConnectionId-aware Seq-gap detection — proven idempotent and score-correct across a real-Postgres 20x replay.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-17T21:05:00Z (approx.)
- **Completed:** 2026-07-17T21:19:07Z
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `MessageNormalizer` (Task 1): pure, never-throwing `normalize()`/`lazyFillPatch()`/`isStale()` mapping any raw TxLINE message (flat SSE or Fusion `{Update}` envelope) to the exact `game_event` column shape, with defensive handling for unknown Actions, open-set StatusIds, and malformed/missing Seq or Ts
- `EventIngestService.processEvent(gameId, raw)` (Task 2): the frozen entry point Plan 05 (SSE) and Plan 06 (replay) will both call — mutex-wrapped (STAT-02), idempotent same-transaction persistence (INGST-03/04), INGST-05 lazy-fill, and ConnectionId-aware gap detection/emission (RCVR-02) — state only mutates after a successful DB commit
- `GameStateMachine` (Task 2): bridges Plan 02's pure `possession.ts`/`goals.ts` modules onto Plan 01's frozen `GameState` shape via per-game `AttackStore`/`GoalStore` registries and an explicit stage-vocabulary map, implementing STAT-01/STAT-03
- `PipelineModule` filled with `TypeOrmModule.forFeature`, providers, and `EventIngestService` export
- `ingest-pipeline.e2e-spec.ts` (Task 3): proves ROADMAP Phase 2 success criterion #3 against real Postgres — 20 full replay passes of a 9-event synthetic fixture (jersey x2, status, possession-ladder climb, score_adjustment, goal Confirmed:false->true) with zero duplicate rows and score correctness on every pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Defensive source-agnostic normalizer (INGST-03, INGST-05)** - `0737ad2` (feat)
2. **Task 2: Idempotent same-transaction persistence + per-game mutex + state-machine apply + gap detect** - `649c8a3` (feat)
3. **Task 3: End-to-end 20x replay idempotency + score-correctness e2e** - `46cc023` (test)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified
- `apps/gutcallfun-core/src/modules/ingest/persistence/message-normalizer.ts` - `normalize()`/`lazyFillPatch()`/`isStale()`, never-throwing (INGST-03/05)
- `apps/gutcallfun-core/src/modules/ingest/persistence/message-normalizer.spec.ts` - 18 unit tests
- `apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.ts` - `processEvent(gameId, raw)` entry point (INGST-03/04, STAT-02, RCVR-02)
- `apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.spec.ts` - 7 unit tests (mocked DataSource/manager)
- `apps/gutcallfun-core/src/modules/ingest/state/game-state.machine.ts` - `applyEvent()`/`detectGap()` (STAT-01/02/03, RCVR-02)
- `apps/gutcallfun-core/src/modules/ingest/pipeline/pipeline.module.ts` - filled: `forFeature`, providers, exports `EventIngestService`
- `apps/gutcallfun-core/test/ingest-pipeline.e2e-spec.ts` - 20x replay e2e against docker-compose Postgres

## Decisions Made
- `stream_cursor` value: `String(event.seq)`, since `processEvent(gameId, raw)`'s 2-arg contract has no room for a separate SSE-frame-id parameter this plan doesn't own (Plan 05 territory) — documented inline, not silently assumed.
- `lazyFillPatch('goal')` gated on `Confirmed:true`; `lazyFillPatch('score_adjustment')` always applied (authoritative, confirmed automatically). Reconciles the plan's "score_adjustment overwrites; goals are derived" acceptance criterion with the fact that an unconfirmed goal's `Score` field must not leak onto the game row prematurely.
- `GameStateMachine` reconciles a real type mismatch between Plan 01's frozen `GameState.possessionStage` (PascalCase PossessionType wire strings) and Plan 02's `possession.ts` internal `PossessionStage` (lowercase classifier output) via an explicit `STAGE_MAP` — both prior plans were correct in their own scope; this plan's Task 2 is the intended integration seam.
- `AttackStore`/`GoalStore` (Plan 02's stateful closures) live in `GameStateMachine`'s own `Map<gameId, ...>` registries, not embedded in the `GameState` DTO — keeps Plan 01's frozen shape scalar-only while still giving the closures a persistent per-game home.
- `GameState.connectionId` (string|null, Plan01) receives `String(ConnectionId)` — TxLINE's wire `ConnectionId` is numeric per message-reference.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created a local, git-ignored `.env` for e2e verification**
- **Found during:** Task 3 verify step (`npx jest --config test/jest-e2e.json test/ingest-pipeline.e2e-spec.ts`)
- **Issue:** This worktree has no `.env` (only the tracked `.env.example`, itself unreadable per this repo's permission policy that blocks reading any `.env*` file) — untracked/git-ignored files from the main checkout are not copied into a linked git worktree, matching the same gap Plan 01's SUMMARY documented for this same worktree.
- **Fix:** Wrote a local `apps/gutcallfun-core/.env` (confirmed git-ignored via `git check-ignore -v`) pointing `DATABASE_URL` at the already-running local docker-compose Postgres (`127.0.0.1:5488`), plus placeholder (non-real) `TXLINE_GUEST_JWT`/`TXLINE_API_TOKEN` and `SERVICE_LEVEL_ID=12` so the app-boot e2e harness could run. No real TxLINE credentials were used or committed.
- **Files modified:** `apps/gutcallfun-core/.env` (git-ignored, not committed — will not appear in any commit)
- **Verification:** `npx jest --config test/jest-e2e.json test/ingest-pipeline.e2e-spec.ts` and `test/app.e2e-spec.ts` both pass against the real Postgres container.
- **Committed in:** N/A (git-ignored file, never staged)

**2. [Rule 1 - Bug] `.values()` TypeScript type mismatch on the jsonb `payload` column**
- **Found during:** Task 2 (`npm run build`)
- **Issue:** TypeORM 0.3.31's `InsertQueryBuilder.values()` typing rejects a plain `Record<string, unknown>` for a `jsonb` column typed that way on the entity — a known TypeORM/TypeScript inference gap, not a logic error.
- **Fix:** Cast the `.values({...})` argument to `QueryDeepPartialEntity<GameEventEntity>` (imported from `typeorm/query-builder/QueryPartialEntity`), the standard TypeORM workaround for this exact typing gap. No runtime behavior change — the insert shape is identical.
- **Files modified:** `apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.ts`
- **Verification:** `npm run build` compiles cleanly.
- **Committed in:** `649c8a3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking/environment-only with no committed change, 1 bug/typing-only with no behavior change)
**Impact on plan:** No production logic was affected by either fix. This unblocks local `npm run build && npx jest`/e2e verification going forward for this worktree; a real `.env` with actual TxLINE credentials is still required before any live-feed testing (Plan 05's concern, not this plan's).

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required

None for this plan's deliverables — the pipeline is complete and self-contained against the existing schema (no migration needed). A real `.env` with actual TxLINE credentials (`TXLINE_GUEST_JWT`, `TXLINE_API_TOKEN`) will still be required before Plan 05 (live SSE ingest) can be tested end-to-end against the real feed.

## Next Phase Readiness
- `EventIngestService.processEvent(gameId, raw)` is the frozen, tested entry point — Plan 05 (SSE client) and Plan 06 (replay emitter) can now call it directly with zero further ingest-side changes (D-02: source-unaware core).
- `GameStreamGapDetected` continues to flow through the same Plan-01 seam (log-only in Phase 2; Phase 4 replaces the listener body).
- `GameStateMachine`'s `STAGE_MAP` (lowercase possession.ts vocabulary <-> PascalCase GameState vocabulary) and its internal `AttackStore`/`GoalStore` registries are the canonical bridge for any future consumer of possession/goal state — do not re-derive score or possession stage anywhere else.
- No blockers for Plan 04/05/06. The `stream_cursor = String(seq)` decision should be revisited by whichever plan (05) first has access to the SSE stream's own `id:` frame value, in case it ever diverges from `Seq`.

---
*Phase: 02-feed-ingest-replay-state-machine*
*Completed: 2026-07-17*

## Self-Check: PASSED

All 6 created files and 1 modified file verified present on disk; all 3 task commits (`0737ad2`, `649c8a3`, `46cc023`) verified in `git log`.
