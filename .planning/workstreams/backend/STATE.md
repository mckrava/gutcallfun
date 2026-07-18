---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02.1
current_phase_name: Placeholder API Surface & Fake Realtime Contract
status: planned
stopped_at: Phase 02.1 planned — 5 plans, 4 waves, plan-checker passed
last_updated: "2026-07-18T13:24:44.557Z"
last_activity: 2026-07-18
last_activity_desc: Phase 02.1 inserted after Phase 2 to unblock UI developer integration
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 11
  completed_plans: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-17)

**Core value:** The live loop works end-to-end and is demoable from replay: TxLINE ingest → trusted `game_event` log → state machine → prediction windows → resolution → points → WS push.
**Current focus:** Phase 02.1 — Placeholder API Surface & Fake Realtime Contract (INSERTED, urgent)

## Current Position

Phase: 02.1 — Placeholder API Surface & Fake Realtime Contract (INSERTED)
Plan: 5 plans across 4 waves (0/5 executed)
Status: Planned — ready to execute
Last activity: 2026-07-18 — Phase 02.1 planned; plan-checker returned VERIFICATION PASSED on iteration 1

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 4 | - | - |
| 02 | 7 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 50min | 3 tasks | 7 files |
| Phase 01 P04 | 65min | 2 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 5-phase pipeline build order — foundation → ingest+replay+state machine → auth → windows+resolution → API/WS/leaderboard (matches brief's prescribed dependency chain; coarse granularity).
- [Roadmap]: Replay emitter built inside Phase 2 as core infrastructure (testing harness + demo path), not a nice-to-have.
- [Roadmap]: Window/resolution HTTP surface (answer submit) exposed in Phase 5; domain logic lands in Phase 4 — horizontal pipeline split, user-selected.
- [Phase ?]: typeorm hard-pinned to 0.3.31 (confirmed via registry, never 1.x) per CLAUDE.md LOCKED stack
- [Phase ?]: DATABASE_URL is a single required env var with no default; @IsUrl requires require_protocol:true to correctly fail-fast on protocol-less strings
- [Phase ?]: TypeORM CLI in npm workspaces needs an explicit hoisted node_modules path (../../node_modules/typeorm/cli.js) — bare relative paths don't resolve to root-hoisted deps
- [Phase ?]: Named DB UNIQUE constraints must be declared via @Unique(), not @Index({unique:true}) — TypeORM diffs pg_constraint-backed uniques differently from bare unique indexes
- [Phase ?]: Every FK in initial-db-structure.sql needs a matching @ManyToOne/@JoinColumn relation (merged onto the existing raw @Column FK-id field) or migration:generate proposes dropping it

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- **game-finalised-current-status-id** (resolves in Phase 4 / RESL-05) — `game_finalised` (status_id 100) leaves `game.current_status_id` stale at 5; RESL-05 specifies `status → finished` but is silent on the denormalized column. Decide deliberately (terminal sentinel vs last real period vs separate `finalised_at`).
- **replay-restart-orphans-mid-flight-game** (no owning phase yet) — restarting the app mid-replay strands the game at `status=live` with no source: boot recovery deliberately skips `is_replay` resume (D-02), and the scheduler only picks `scheduled`. Live/SSE games resume correctly (RCVR-02 unaffected). Workaround: re-arm to `scheduled` (restarts from scratch via D-07 wipe).

### Blockers/Concerns

[Issues that affect future work]

- Requirements header metadata says "33 requirements / 12 categories" but REQUIREMENTS.md actually contains 40 REQ-IDs across 13 categories; all 40 are mapped and the traceability footer was corrected to 40.
- Phase 2 open gap: exact TxODDS auth endpoint signatures/error paths (guest JWT → on-chain subscribe → activate) — resolve during Phase 2 planning via the `txodds-api` skill.
- Phase 4 open gap: double-resolution test harness needs clock mocking / manual trigger to fire goal-confirm and 5-min timeout simultaneously.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260718-3cm | fix historical replay source A: SSE text parse + pacing clamp | 2026-07-18 | 1f7f37d | [260718-3cm-fix-historical-replay-source-a-sse-text-](./quick/260718-3cm-fix-historical-replay-source-a-sse-text-/) |
| 260718-48a | fix CR-01 fixtures cron write race and CR-02 abort signal threading | 2026-07-18 | b29eb4d | [260718-48a-fix-cr-01-fixtures-cron-write-race-and-c](./quick/260718-48a-fix-cr-01-fixtures-cron-write-race-and-c/) |

### Roadmap Evolution

- Phase 02.1 inserted after Phase 2: Placeholder API Surface & Fake Realtime Contract — reprioritized to unblock UI developer integration ahead of Phases 3-5 (URGENT)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Scope | NICE list (streak multiplier, minimal squads by invite code) — only if CORE lands by evening July 17 | Deferred | 2026-07-17 |
| Scope | CUT list (full squads, pre-match predictions, achievements, AI commentary, profile updates) — not planned | Deferred | 2026-07-17 |

## Session Continuity

Last session: 2026-07-17T17:54:11.828Z
Stopped at: Phase 2 context gathered
Resume file: .planning/workstreams/backend/phases/02-feed-ingest-replay-state-machine/02-CONTEXT.md
