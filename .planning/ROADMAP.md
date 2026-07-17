# Roadmap: GutCall Backend (gutcallfun-core)

## Overview

The journey builds the live micro-prediction loop bottom-up along the brief's prescribed pipeline. First we lay a schema-faithful data and config foundation the app boots on. Then we build the correctness backbone: a source-agnostic ingest that turns live or replayed TxLINE events into a trusted append-only log and an accurate in-memory per-game state machine, with restart recovery. Wallet auth gives fans an identity. On top of the state machine we build the hero mechanic — attack-triggered prediction windows, VAR-aware resolution, and locked scoring. Finally we expose everything to clients over documented REST endpoints and socket.io real-time push with a live leaderboard, making the full loop demoable end-to-end from replay.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Data Layer** - Schema-faithful migrations, validated config, and a bootable app on Postgres 16
- [ ] **Phase 2: Feed Ingest, Replay & State Machine** - Source-agnostic TxLINE pipeline into an append-only log and an in-memory per-game state machine, with restart recovery
- [ ] **Phase 3: Wallet Auth & User Identity** - Solana wallet sign-in with nonce challenge, session JWT, and first-time user creation
- [ ] **Phase 4: Prediction Windows, Resolution & Scoring** - Attack-triggered windows, 12s debounce, VAR-aware goal settlement, void/refund, and locked points
- [ ] **Phase 5: Public API, Real-time Push & Leaderboard** - Documented REST endpoints, socket.io snapshot-on-join with go-forward pushes, and a live global leaderboard

## Phase Details

### Phase 1: Foundation & Data Layer
**Goal**: The backend boots against Postgres 16 with a schema that exactly reproduces the authoritative SQL, env-validated config, and migration tooling shared by app and CLI — the base every other phase builds on.
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. Running the migration against a fresh docker-compose Postgres 16 produces a schema identical to `initial-db-structure.sql` — correct hand-named enum types, `gen_random_uuid()` defaults, and both partial unique indexes (`uq_game_fixture_live`, `uq_gq_one_open_per_game`) present; `migration:generate` yields an empty diff.
  2. The `game_question_outcome` reference rows (fizzles/danger/shot/goal, ladder 1-4) exist after migration.
  3. The app refuses to boot when required env vars are missing or invalid, and boots cleanly with `enableShutdownHooks()` active when they are valid.
  4. One shared DataSource file drives both app bootstrap and the TypeORM CLI, with `synchronize` disabled and `typeorm` pinned to 0.3.31.
**Plans**: 4 plans
- [ ] 01-01-PLAN.md — Dependencies, docker healthcheck fix, and fail-fast config validation (DATA-02, DATA-03, DATA-04)
- [ ] 01-02-PLAN.md — Shared DataSource, app wiring, and shutdown hooks (DATA-03, DATA-04)
- [ ] 01-03-PLAN.md — Raw-SQL InitialSchema migration + seed and the 12 describing entities (DATA-01)
- [ ] 01-04-PLAN.md — Schema push, empty-diff gate, and boot verification (DATA-01, DATA-03, DATA-04)

### Phase 2: Feed Ingest, Replay & State Machine
**Goal**: A source-agnostic pipeline turns live or replayed TxLINE events into a trusted append-only `game_event` log and an accurate in-memory per-game state — the persist-then-broadcast correctness backbone all game logic depends on, recoverable across restarts.
**Depends on**: Phase 1
**Requirements**: GAME-01, INGST-01, INGST-02, INGST-03, INGST-04, INGST-05, RPLY-01, RPLY-02, RPLY-03, STAT-01, STAT-02, STAT-03, RCVR-01, RCVR-02
**Success Criteria** (what must be TRUE):
  1. The fixtures cron discovers games every minute and creates/updates `game` rows with team names, competition, and `starts_at` (names sourced from the fixtures endpoint, not the numeric-only stream).
  2. A live game's SSE stream (ported `upstream.ts`, Last-Event-ID resume, idle watchdog, backoff) or a replay game's emitter persists every message to append-only `game_event` idempotently — replaying the same feed twice produces zero duplicate rows and never crashes on unknown actions/statuses; `stream_cursor` is flushed in the same transaction as the event insert and on SIGTERM.
  3. Each game has one in-memory state machine (possession stage, clock, StatusId, score, attack run) that stays correct under fast concurrent events for the same game (per-game serial processing verified via 20× replay), using event `Ts` for match logic and wall clock for user timing.
  4. A replay game drives the identical downstream pipeline as a live game — `is_replay` switches only the source, timestamps are rebased, and pacing follows original inter-event gaps × speed factor.
  5. After a restart, `live` games rebuild their in-memory state by replaying their own `game_event` rows, and the stream reconnects using the persisted `stream_cursor` as Last-Event-ID with Seq-gap detection and self-heal from the next message.
**Plans**: TBD

### Phase 3: Wallet Auth & User Identity
**Goal**: A fan can sign in with a Solana wallet and receive a session that gates the rest of the API, with first-time sign-in creating their identity.
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. A client can request a single-use nonce, sign it with a Solana wallet, and exchange the signed message (tweetnacl + bs58 verification) for a session JWT; a replayed or expired nonce is rejected.
  2. A first-time sign-in creates a user with an internal uuid id (distinct from wallet_address), a unique `share_code` (`GC-XXXX-XXXX` with collision retry), a unique handle, and an avatar seed.
  3. Requests to protected endpoints are rejected without a valid session JWT and accepted with one; only the auth module reads wallet_address, everything else references user.id.
**Plans**: TBD

### Phase 4: Prediction Windows, Resolution & Scoring
**Goal**: The hero mechanic — an attack opens a ~5-second prediction window, players' answers are captured under a hard server deadline, and outcomes resolve into locked points, including VAR-aware goal settlement and void/refund on coverage gaps.
**Depends on**: Phase 2, Phase 3
**Requirements**: WNDW-01, WNDW-02, WNDW-03, WNDW-04, RESL-01, RESL-02, RESL-03, RESL-04, RESL-05, ANSW-01, ANSW-02
**Success Criteria** (what must be TRUE):
  1. In a replay, a window opens the moment possession first enters `attack_possession` (only while StatusId ∈ {2,4,7,9}), carries the four LOCKED options (base_gain 5/7/15/100) with a precomputed `expires_at`, records the attacking participant and `trigger_event_id`, and never more than one window is open per game.
  2. A window closes per the 12-second debounce (soft terminals stamped and cancellable by fresh attacking pressure; hard terminals act immediately) and settles at the highest rung reached, with a discarded high-water-mark shot correctly lowering the result.
  3. Fizzle/danger/shot windows resolve instantly and award `round(base_gain × reward_multiplier)`; an attacking-team goal moves the window to `pending_confirmation` and resolves only on a confirmed goal, re-resolving to the highest non-goal rung on discard, or adjudicating from the latest `Score` after the ~5-min timeout.
  4. The goal-confirm-vs-timeout race can never double-resolve or double-award, and a user can submit at most one answer per question (`UNIQUE(user_id, game_question_id)`) — rejected once the question is not `open` or `now > expires_at`.
  5. Any window open/pending across a seq gap, reconnect, suspend/disconnect, or unrecovered restart hole is voided and its answers refunded (no resolution); `game_finalised` freezes the game with no new windows.
**Plans**: TBD

### Phase 5: Public API, Real-time Push & Leaderboard
**Goal**: Everything the engine produces becomes reachable by clients — documented REST endpoints, socket.io snapshot-on-join with go-forward pushes, and a live global leaderboard — making the full loop demoable end-to-end.
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: GAME-02, GAME-03, LDRB-01, API-01, API-02, WS-01, WS-02, WS-03
**Success Criteria** (what must be TRUE):
  1. A client can list games (upcoming/live/finished) with denormalized score/status/team names (no stream call needed) and join a game, all documented in Swagger UI, with expected rejections returning structured 4xx via class-validator DTOs (never 500).
  2. Subscribing to a game over socket.io returns a full snapshot immediately (score, clock, StatusId, possession stage, active question) captured synchronously before room join, so a client joining mid-game renders instantly.
  3. After the snapshot, clients receive go-forward pushes (`game_event`, `question`, `resolution`, `void`) in persist-then-broadcast order, with no duplicates or gaps when joining mid-replay.
  4. The global leaderboard endpoint returns `SUM(awarded_points)` per user with handle/avatar, ordered descending, and updates promptly as resolutions land.
  5. The socket.io gateway authenticates with the same session JWT as REST, and cross-origin requests from the configured web client origin are accepted.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Data Layer | 0/4 | Planned | - |
| 2. Feed Ingest, Replay & State Machine | 0/TBD | Not started | - |
| 3. Wallet Auth & User Identity | 0/TBD | Not started | - |
| 4. Prediction Windows, Resolution & Scoring | 0/TBD | Not started | - |
| 5. Public API, Real-time Push & Leaderboard | 0/TBD | Not started | - |
