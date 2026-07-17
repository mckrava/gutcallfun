# Project Research Summary

**Project:** GutCall (Solana-based real-time sports micro-prediction backend)
**Domain:** Real-time feed-ingest + live-prediction NestJS backend (sports micro-predictions tied to in-game events)
**Researched:** 2026-07-17
**Confidence:** HIGH (stack versions verified, features scope locked in brief, architecture patterns established, pitfalls catalogued with prevention strategies)

## Executive Summary

GutCall is a real-time, single-process NestJS backend that ingests live sports event feeds (via TxLINE SSE), maintains an in-memory per-game state machine (possession gradient, clock, status), triggers prediction windows on specific game events (attack starts), and broadcasts resolutions to players via socket.io. The recommended approach is a strict **persist-then-broadcast pipeline**: normalize feed data → idempotent DB insert → mutate in-memory state → emit domain events → WS broadcast. This ordering is the single correctness backbone — violations break restart recovery and fairness guarantees. The technology stack is locked (NestJS 11, TypeORM 0.3.31, Postgres 16, socket.io 4.8.3, Node 24 LTS) with exact versions verified against npm registry and reference repos. The main risks are engineering pitfalls (state mutations interleaved across async boundaries, schema drift via TypeORM's defaults, signature replay via missing nonces) rather than technology choices — all are preventable with discipline during the ingest/data-layer/auth phases.

## Key Findings

### Recommended Stack

The stack is **locked** per the brief and this research confirms all exact versions. No technology swaps are under consideration.

**Core technologies:**
- **NestJS 11.1.28**: Current latest, already in boilerplate. Express adapter (not Fastify). Peer-locked to all major modules.
- **socket.io 4.8.3** (via `@nestjs/platform-socket.io`): Standard stable; default in-memory adapter (no Redis — brief rules out horizontal scaling).
- **TypeORM 0.3.31** (CRITICAL PIN): npm latest is 1.1.0 (~2 months old) with breaking changes to where-condition null handling and internal glob engines. Pin 0.3.31 explicitly — all reference repos use it, runtime behavior matches expected patterns.
- **PostgreSQL 16** with `pg@8.22.0` driver: Current stable, no special config needed.
- **@nestjs/swagger 11.4.5**, **@nestjs/schedule 6.1.3**, **@nestjs/config 4.0.4**: Peer-locked to NestJS 11.
- **class-validator 0.15.1** + **class-transformer 0.5.1**: Required peers; used for both request DTOs and env validation.
- **@nestjs/jwt 11.0.2**: Session tokens after wallet verification (distinct from TxLINE guest JWT).
- **tweetnacl 1.0.3** + **bs58 6.0.0**: Solana Ed25519 verification; exact versions in reference monitor repo.
- **Node.js 24.x (Active LTS)**: Pin Docker base and engines field.
- **Development:** tsx 4.23.1 (TypeORM CLI, standalone scripts — faster than ts-node), jest 30.4.2 + ts-jest 29.4.11, supertest 7.2.2 + socket.io-client 4.8.3.

**What NOT to use:** typeorm@latest, zod/joi for env (reference pattern is class-validator), eventsource npm (port upstream.ts as-is), GraphQL, Redis adapter, uuid package, @solana/web3.js at runtime.

### Expected Features

Scope is **LOCKED** per PROJECT.md. No negotiation open.

**Must have (table stakes):**
- Wallet-based auth + session JWT (distinct from TxLINE guest JWT)
- Fixture discovery (1-min cron, denormalized names)
- Snapshot-on-join (full live state instantly, no "wait for next event" gap)
- Live score + clock + status push
- Time-boxed answer window with server-side hard deadline
- One question at a time, no double-answering (DB unique constraint)
- Resolution + points delivered promptly (instant for fizzles/danger/shot; pending-confirmation for goals)
- Global leaderboard (cumulative SUM(awarded_points) per user)
- Reconnect without state loss (stream_cursor resume token)
- Idempotent event ingest (UNIQUE(game_id, seq) ON CONFLICT DO NOTHING)
- Graceful unknown event handling (store-and-ignore)
- API documentation (Swagger)

**Differentiators:**
- Attack-start-triggered windows (not fixed-interval polling)
- Shot-based ladder with empirically-calibrated points (5/7/15/100 — LOCKED)
- 12-second attack debounce (correctness feature)
- Pending-confirmation goal settlement (VAR-aware delay; 17.5% of goals later discarded)
- Two-clock discipline (event timestamps for match logic, wall-clock for answer deadlines)
- Void-and-refund policy on coverage gaps
- Replay-driven demo harness sharing production code path

**Anti-features (explicitly CUT):**
- Full squads, pre-match predictions, multi-game management, achievements, AI commentary, GraphQL, horizontal scaling, client-authoritative timing

### Architecture Approach

Architecture is **decided** in the brief's §5. Core pattern: **persist-then-broadcast, always** — normalize → idempotent DB insert → mutate in-memory state → emit domain event → WS broadcast, in that await order. Any deviation breaks restart recovery and fairness.

**Modules:**
- **modules/core**: config (AppConfig singleton with class-validator), db (DataSource shared by app + CLI), scheduler (FixturesCron @Cron), ws (EventsGateway socket.io)
- **modules/txodds**: ported upstream.ts/possession.ts/goals.ts/replay.ts as services, produces normalized DTOs
- **modules/game**: GameService, GameEventService (append-only), GameStateRegistry (singleton `Map<gameId, GameStateMachine>`), QuestionService, ResolutionService
- **modules/user**: UserService (wallet auth), AnswerService, LeaderboardService, UserGameService
- **models/**: TypeORM entities only (no business logic): account/ (User, UserScoreProfile, UserGame, UserGameAnswer), game/ (Game, GameEvent, GameQuestion, GameQuestionOption, GameQuestionOutcome), squad/ (schema-complete, out of scope)

**Critical patterns:**
1. **Persist-then-emit**: Direct service calls for hot path; EventEmitter2 only for final fan-out
2. **Singleton state registry**: One in-memory GameStateMachine per game, owned by GameStateRegistry
3. **OnApplicationBootstrap for long-lived consumers**: SSE/replay client starts after all modules ready; onApplicationShutdown handles graceful drain

### Critical Pitfalls

Nine engineering correctness pitfalls; all preventable:

1. **In-memory state mutation out of order** — async handlers interleave across await boundaries. **Prevention:** serialize event processing per game_id via promise-chain mutex (~15 lines).

2. **`synchronize: true` left on** — auto-alters schema, can drop columns. **Prevention:** `synchronize: false` everywhere except local dev; baseline migration from SQL file.

3. **UUID/enum defaults don't match schema** — TypeORM defaults to uuid_generate_v4 (needs uuid-ossp extension) instead of gen_random_uuid; enum names auto-generated. **Prevention:** explicit `@Column({ type: 'uuid', default: () => 'gen_random_uuid()' })` and `enumName` decorators.

4. **Partial unique indexes silently not enforced** — Postgres-specific, TypeORM's @Index has bugs. **Prevention:** raw SQL migration copied from initial-db-structure.sql, never via decorator.

5. **WS snapshot/subscribe race** — client receives live event between room join and snapshot capture. **Prevention:** snapshot (sync from memory), room join, emit snapshot, all in one sync block.

6. **Double-submit answer** — two requests both SELECT see no answer, both INSERT. **Prevention:** `INSERT ... ON CONFLICT (user_id, game_question_id) DO NOTHING`.

7. **Double-resolution race** — goal-confirm and 5-min timeout both fire. **Prevention:** idempotent guarded update with rowCount check; clear timeout on success.

8. **SIGTERM without `enableShutdownHooks()`** — process killed mid-write on every deploy (Docker). **Prevention:** call `app.enableShutdownHooks()` in main.ts; implement onApplicationShutdown to close SSE, flush stream_cursor.

9. **Wallet sign-in without nonce** — captured signature replayed indefinitely. **Prevention:** server-issued single-use nonce (5–10 min TTL), embedded in message, invalidated after verify.

## Implications for Roadmap

**5-phase structure recommended** for strict dependency graph (ingest must precede state machine, which must precede windows; schema is foundational).

### Phase 1: Foundation & Data Layer (4–6 hrs)
- **Delivers:** AppConfig validation, TypeORM DataSource, baseline migration with explicit uuid/enum/partial-index handling, verify migration:generate produces empty diff, docker-compose config
- **Avoids:** Pitfalls 2, 3, 4 (schema drift, defaults, indexes)
- **Research flags:** None — standard NestJS patterns

### Phase 2: Ingest & State Machine (6–8 hrs)
- **Delivers:** TxLineAuthService, TxLineStreamService (ported upstream.ts), ReplayEmitterService (ported replay.ts), NormalizerService (ported possession.ts/goals.ts), GameEventService (idempotent insert), GameStateRegistry (singleton Map), GameStateMachine (possession/debounce/two-clock logic), IngestOrchestratorService (OnApplicationBootstrap + graceful shutdown), per-game promise-chain mutex
- **Critical:** This is the correctness backbone; all downstream depends on it
- **Avoids:** Pitfalls 1, 8 (state race, SIGTERM)
- **Research flags:** Per-game serialization pattern needs concurrency test (verify deterministic state under concurrent events for same game)

### Phase 3: Wallet Auth & User Identity (2–3 hrs)
- **Delivers:** UserService, nonce-based wallet sign-in (POST /auth/wallet/nonce), session JWT issuance, user creation at signup
- **Avoids:** Pitfall 9 (signature replay)
- **Research flags:** None — standard Solana Sign-In-With-Solana pattern

### Phase 4: Prediction Windows & Resolution (8–10 hrs)
- **Delivers:** QuestionService (lifecycle), ResolutionService (fizzle/danger/shot instant + goal pending-confirmation + 5-min timeout adjudicator), idempotent guarded resolution, void-and-refund logic, direct UserGameAnswer repo injection (avoid circular import), concurrency tests (double-answer, double-resolution race)
- **Critical:** Resolution engine is the hero mechanic; must be rock-solid
- **Avoids:** Pitfalls 6, 7 (double-answer, double-resolution)
- **Research flags:** Goal-confirm + 5-min timeout collision test harness essential (needs clock mocking or manual trigger to fire both paths)

### Phase 5: Real-time Push & Leaderboard (4–5 hrs)
- **Delivers:** EventsGateway (socket.io, @OnEvent listeners), snapshot-on-subscribe (sync capture → room join → emit), go-forward pushes (game_event/question/resolution/void), JWT handshake auth, LeaderboardService (SUM aggregate), integration test (join mid-replay, verify no duplicates/gaps)
- **Avoids:** Pitfall 5 (snapshot/subscribe race)
- **Research flags:** socket.io CORS config (explicit allowlist of Next.js origin + withCredentials: true)

**Phase ordering:** 1 → 2 → {3 parallel with 2/4} → 4 → 5. Phase 2 is the critical path; everything downstream depends on it.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | **HIGH** | Versions verified live on npm; typeorm@0.3.31 pin justified; reference repos consulted |
| **Features** | **HIGH** | Scope locked in PROJECT.md + authoritative brief; dependencies explicit; table stakes/differentiators/anti-features clear |
| **Architecture** | **HIGH** | NestJS 11 APIs stable; module boundaries map cleanly to brief's pipeline; patterns are standard idioms |
| **Pitfalls** | **MEDIUM** | Derived from brief + framework docs; prevention strategies clear; phase mapping explicit; requires live testing under concurrent load to fully validate (48-hr hackathon time constraint) |

**Overall:** HIGH for tech decisions; MEDIUM for implementation robustness. Stack/features/architecture are solid; risk is engineering discipline (serialization, schema, nonces, shutdown). Research provides clear checklists; execution must follow them.

### Gaps to Address

1. **TxODDS auth flow endpoints:** Exact signatures + error paths for guest JWT → on-chain subscribe → activate. *Schedule for Phase 2 planning.*
2. **Docker/Railway Postgres config:** Stale docker-compose health check; verify platform-specific SSL + health check. *Phase 1 completion checklist.*
3. **Double-resolution test harness:** Clock mocking or manual trigger to fire both goal-confirm and 5-min timeout paths simultaneously. *Phase 4 acceptance criteria.*
4. **Per-game serialization verification:** Concurrent events for same game, fast replay (20×), verify deterministic state. *Phase 2 acceptance criteria.*
5. **WS cross-origin config:** Next.js frontend origin(s) needed for socket.io CORS allowlist + withCredentials. *Coordinate during Phase 5.*

## Sources

- `.planning/research/STACK.md` — exact package versions verified live against npm registry (2026-07-17); reference repos read directly (txodds-txline-api-monitor, hydration-data-feeds)
- `.planning/research/FEATURES.md` — table stakes / differentiators / anti-features catalogue derived from the authoritative brief and schema
- `.planning/research/ARCHITECTURE.md` — NestJS module decomposition, lifecycle, event-flow patterns; hydration-data-feeds config pattern source-verified
- `.planning/research/PITFALLS.md` — engineering pitfalls cross-checked against TypeORM/NestJS docs and GitHub issues, Solana sign-in references
- `initial-request-src/initial-project-context.md` — authoritative implementation brief (empirical corpus: 23,510 records, 19 fixtures)
- `initial-request-src/initial-db-structure.sql` — authoritative DB schema (v2)

---
*Synthesized: 2026-07-17 (orchestrator persisted per #222 self-heal — synthesizer returned document inline)*
