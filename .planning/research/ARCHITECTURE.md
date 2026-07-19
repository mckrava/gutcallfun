# Architecture Research

**Domain:** Real-time sports feed-ingest backend (NestJS) — mapping a decided pipeline architecture onto NestJS module idioms
**Researched:** 2026-07-17
**Confidence:** HIGH (module boundaries, lifecycle hooks, EventEmitter2 usage — stable, well-documented NestJS 11 APIs) / MEDIUM (exact file layout of the two named reference repos — one fetched live, one inaccessible; see Sources)

This document does **not** invent architecture — the pipeline (`source → normalizer → persist(game_event) → in-memory state machine → WS broadcast`, persist-then-broadcast, `is_replay` source switch, restart recovery via own-log replay + Last-Event-ID, single long-lived process, cron-driven game discovery) is decided in `initial-request-src/initial-project-context.md` §5 and is authoritative. This document maps that pipeline onto NestJS modules under the project's prescribed `src/modules/<entity>/` + `src/models/<entity>/` convention (`initial-request-src/system-prompt.md`) and resolves the NestJS-specific idiom questions the brief leaves open: module decomposition, lifecycle hook placement, in-memory state ownership, event-flow mechanism, and DataSource/config wiring.

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  modules/core  (non-entity, cross-cutting infra)                          │
│  ┌───────────┐ ┌───────────┐ ┌───────────────┐ ┌────────────────────┐    │
│  │  config   │ │    db     │ │   scheduler    │ │   ws (gateway)     │    │
│  │ AppConfig │ │ DataSource│ │ FixturesCron   │ │ EventsGateway      │    │
│  │ (class-   │ │ + Nest    │ │ (@Cron 1min)   │ │ (socket.io,        │    │
│  │ validator)│ │ TypeORM   │ │ → GameService  │ │  snapshot + push)  │    │
│  └───────────┘ └───────────┘ └───────┬────────┘ └─────────▲──────────┘    │
└──────────────────────────────────────┼────────────────────┼──────────────┘
                                        │ calls                │ @OnEvent
                                        ▼                       │ (EventEmitter2)
┌──────────────────────────────┐   ┌────────────────────────────────────┐
│  modules/txodds  (ingest)    │   │  modules/game (domain core)         │
│  ┌─────────────────────────┐ │   │  ┌────────────────────────────────┐│
│  │ TxLineAuthService        │ │   │  │ GameService (fixtures upsert)  ││
│  │ TxLineStreamService      │─┼──▶│  │ GameEventService (append log)  ││
│  │  (ported upstream.ts)    │ │   │  │ GameStateRegistry              ││
│  │ ReplayEmitterService      │ │   │  │  (Map<gameId, StateMachine>)   ││
│  │  (ported replay.ts)       │ │   │  │ QuestionService                ││
│  │ NormalizerService          │ │   │  │  (open/pending/resolved/void)  ││
│  │  (ported possession.ts,   │ │   │  │ ResolutionService              ││
│  │   goals.ts)                │ │   │  │  (writes UserGameAnswer via   ││
│  │ IngestOrchestratorService  │ │   │  │   direct repo injection)      ││
│  │  (OnApplicationBootstrap)  │ │   │  └────────────────────────────────┘│
│  └─────────────────────────┘ │   └──────────────────────────────────────┘
└──────────────────────────────┘                     │ emits domain events
                                                        │ (EventEmitter2, after
                                                        │  persist completes)
┌──────────────────────────────────────────────────────▼───────────────────┐
│  modules/user                                                             │
│  UserService (wallet auth/signup) · AnswerService (submit-time only)      │
│  LeaderboardService (SUM aggregate) · UserGameService (join)              │
└────────────────────────────────────────────────────────────────────────────┘

Persistence layer:
  models/game/    → Game, GameEvent, GameQuestion, GameQuestionOption, GameQuestionOutcome
  models/account/ → User, UserScoreProfile, UserGame, UserGameAnswer  (existing scaffold name)
  models/squad/   → Squad, SquadParticipant, SquadScoreProfile        (schema-complete, out of build scope)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| `modules/core/config` | Env validation, single typed config source | `AppConfig` class (`class-validator` + `class-transformer`), `@Global()` module, `ConfigService`-free static-instance pattern (hydration-data-feeds pattern) |
| `modules/core/db` | `DataSource` construction shared by app bootstrap and TypeORM CLI, migrations array | One `typeorm.config.ts` exporting a `DataSource` instance built from `AppConfig`, imported both by `TypeOrmModule.forRootAsync` and by `package.json`'s `typeorm migration:run -d src/modules/core/db/typeorm.config.ts` script (epic-data-hub pattern intent — see Sources) |
| `modules/core/scheduler` | 1-minute cron: discover fixtures, decide which games are ready to start | `@Cron('*/1 * * * *')` in a thin `FixturesCronService`; delegates to `GameService` (fixtures upsert) and `IngestOrchestratorService` (start live/replay source) — no domain logic here |
| `modules/core/ws` | socket.io gateway: full snapshot on subscribe, go-forward pushes | `@WebSocketGateway()` class listening to domain events via `@OnEvent(...)`; reads snapshot data from `GameStateRegistry` (direct DI, not events) |
| `modules/txodds` | Everything TxLINE-specific: auth, SSE client, replay emitter, normalization | Ported `upstream.ts`/`possession.ts`/`goals.ts`/`replay.ts` wrapped as injectable services; produces a **normalized event DTO**, never a raw feed record, to everything downstream |
| `modules/game` | Game/event persistence, per-game in-memory state machine, prediction-window + resolution engine | `GameEventService` (idempotent insert), `GameStateRegistry` (singleton in-process `Map`), `QuestionService`, `ResolutionService` |
| `modules/user` | Identity, join, answer submission, leaderboard | `UserService`, `UserGameService`, `AnswerService`, `LeaderboardService` |
| `models/<entity>/` | TypeORM entity classes only — no business logic | One file per table, grouped exactly as the existing scaffold (`account`, `game`, `squad`) |

## Recommended Project Structure

```
src/
├── modules/
│   ├── core/
│   │   ├── config/
│   │   │   ├── app.config.ts        # class-validator env schema, static getInstance()
│   │   │   ├── types.ts             # NodeEnv enum etc.
│   │   │   ├── config.module.ts     # @Global() module, provides AppConfig
│   │   │   └── index.ts
│   │   ├── db/
│   │   │   ├── typeorm.config.ts    # exported DataSource, consumed by app + CLI
│   │   │   ├── db.module.ts         # TypeOrmModule.forRootAsync wrapper
│   │   │   └── migrations/          # timestamped migration files (schema-driven)
│   │   ├── scheduler/
│   │   │   ├── fixtures-cron.service.ts
│   │   │   └── scheduler.module.ts
│   │   ├── ws/
│   │   │   ├── events.gateway.ts    # socket.io gateway, snapshot + push
│   │   │   └── ws.module.ts
│   │   └── core.module.ts           # aggregates the four above (or import individually in AppModule)
│   ├── txodds/
│   │   ├── txline-auth.service.ts       # guest JWT → on-chain subscribe → token activate
│   │   ├── txline-stream.service.ts     # ported upstream.ts (SSE, Last-Event-ID, watchdog)
│   │   ├── replay-emitter.service.ts    # ported replay.ts (source-agnostic, rebases Ts)
│   │   ├── normalizer.service.ts        # ported possession.ts + goals.ts classifiers
│   │   ├── ingest-orchestrator.service.ts  # OnApplicationBootstrap entrypoint, per-game source switch
│   │   └── txodds.module.ts
│   ├── game/
│   │   ├── game.service.ts              # fixtures upsert, game CRUD
│   │   ├── game-event.service.ts        # append-only insert, ON CONFLICT DO NOTHING
│   │   ├── game-state-registry.service.ts  # in-memory Map<gameId, GameStateMachine>
│   │   ├── game-state-machine.ts        # pure class: possession gradient, 12s debounce, two-clock logic
│   │   ├── question.service.ts          # open/pending_confirmation/resolved/voided lifecycle
│   │   ├── resolution.service.ts        # ladder resolution, void policy, awards via direct repo injection
│   │   ├── game.controller.ts           # REST: fixtures list, game join(?), snapshot bootstrap
│   │   └── game.module.ts
│   ├── user/
│   │   ├── user.service.ts              # wallet-based create/find
│   │   ├── user-game.service.ts         # join game (+ optional squad_id)
│   │   ├── answer.service.ts            # submit answer, lock checks (state/expires_at)
│   │   ├── leaderboard.service.ts       # SUM(awarded_points) GROUP BY user
│   │   ├── user.controller.ts
│   │   └── user.module.ts
│   └── squad/                            # scaffold exists; out of build scope this milestone
├── models/
│   ├── account/                          # existing scaffold name — houses "user" entities
│   │   ├── user.entity.ts
│   │   ├── user-score-profile.entity.ts
│   │   ├── user-game.entity.ts
│   │   └── user-game-answer.entity.ts
│   ├── game/
│   │   ├── game.entity.ts
│   │   ├── game-event.entity.ts
│   │   ├── game-question.entity.ts
│   │   ├── game-question-option.entity.ts
│   │   └── game-question-outcome.entity.ts
│   └── squad/
│       ├── squad.entity.ts
│       ├── squad-participant.entity.ts
│       └── squad-score-profile.entity.ts
├── app.module.ts
└── main.ts                               # app.enableShutdownHooks(); SIGTERM → graceful drain
```

### Structure Rationale

- **`modules/core/` holds everything that is NOT an entity** (config, db wiring, scheduler trigger, WS gateway). The scaffold already names this folder `core`; treat it as the catch-all for cross-cutting infrastructure so the entity-scoped folders (`game`, `user`, `squad`) stay pure domain. This resolves the ambiguity of where "config", "db", "scheduler", "ws gateway" go — none of them are entities, so none belong inside an entity folder.
- **`modules/txodds/` is a new top-level module**, not nested under `game`, because it owns an external integration boundary (auth, SSE transport, replay pacing) that must be swappable/testable independently of domain logic. Everything it produces crosses the boundary as a **normalized DTO** — `game` never imports TxLINE wire-format types.
- **`models/account/` keeps the scaffold's existing name** rather than renaming to `models/user/` — the scaffold intentionally already exists this way (`.env` and folder structure were pre-created); renaming is unnecessary churn under the July 19 deadline. `modules/user/` (behavior) and `models/account/` (data) is an accepted, documented mismatch, not a contradiction — NestJS doesn't require folder-name parity between `modules/` and `models/`.
- **`game_question`, `game_question_option`, `game_question_outcome` live under `game`**, not `user`, because they FK `game_id` and are core match state (the "what can be answered right now" surface), matching the system-prompt's identity-scoping rule applied to their actual foreign key.
- **`user_game` and `user_game_answer` stay under `user`** per the system-prompt's explicit example listing ("user should contain everything related with... user_game, user_game_answer"). This creates one deliberate cross-module coupling (see Anti-Patterns / Integration Points below) that is resolved via direct repository injection rather than circular service imports.

## Architectural Patterns

### Pattern 1: Persist-then-emit, not persist-then-call

**What:** The ingest orchestrator's hot path (`normalize → persist(game_event) → update in-memory state machine`) is a plain `await`-chained sequence of direct, injected service calls — never routed through `EventEmitter2`. Only *after* persistence and state-machine mutation are complete does the pipeline emit a domain event (`game.event.persisted`, `question.opened`, `question.resolved`, `question.voided`) via `EventEmitter2`, which `modules/core/ws`'s gateway subscribes to with `@OnEvent(...)` to broadcast over socket.io.

**When to use:** Any step where the brief's invariant "persist-then-broadcast, always" applies. The event bus is for **fan-out to a decoupled downstream consumer** (the WS gateway shouldn't need a direct dependency on `txodds` or `game`'s internals), not for sequencing steps that must happen in order with guaranteed completion.

**Trade-offs:** Direct calls give synchronous ordering and let a thrown DB error abort the whole event's processing (correct — brief mandates append-only, trustworthy log). `EventEmitter2` listeners run synchronously by default unless declared `async`; if the WS payload composition needs anything beyond what's already in `GameStateRegistry` post-mutation, use `emitAsync` and await it — never emit before the DB write commits.

**Example:**
```typescript
// modules/txodds/ingest-orchestrator.service.ts
async handleFrame(gameId: number, raw: RawFeedRecord) {
  const normalized = this.normalizer.normalize(raw);           // pure, no I/O
  await this.gameEventService.insertIdempotent(gameId, normalized); // persist first
  const transition = this.stateRegistry.get(gameId).apply(normalized); // in-memory
  if (transition.questionOpened) {
    const question = await this.questionService.open(gameId, transition);
    this.events.emit('question.opened', { gameId, question });  // broadcast last
  }
}
```

### Pattern 2: One in-memory state machine per game, owned by a singleton registry

**What:** `GameStateRegistry` is an ordinary NestJS singleton provider (default scope — do **not** use `Scope.REQUEST`) holding `Map<number, GameStateMachine>`. Each `GameStateMachine` instance is a plain class (not itself a NestJS provider) encapsulating possession gradient, the 12s attack debounce, and two-clock discipline. The registry is the *only* thing injected across modules (`txodds` writes into it, `game`'s `QuestionService`/`ResolutionService` reads/reacts to it, `core/ws` reads it for snapshots).

**When to use:** Exactly this project's constraint — single long-lived process, no horizontal scaling, no Redis needed for state. A `Map` in a singleton service is the correct and simplest fit; reaching for Redis/external cache here would be solving a scaling problem the brief explicitly rules out.

**Trade-offs:** State is lost on process crash — this is why restart recovery (§5.3 of the brief) rebuilds it deterministically by replaying the game's own `game_event` rows through the same state-machine code at boot. The registry must expose an idempotent `rebuild(gameId)` path that ingest and boot-recovery both call, so there is exactly one code path for "derive state from events," not two.

### Pattern 3: Long-lived SSE/replay consumer as an `OnApplicationBootstrap` provider, not a controller-triggered action

**What:** `IngestOrchestratorService implements OnApplicationBootstrap, OnApplicationShutdown`. `onApplicationBootstrap()` is where the process starts consuming — it fires after **all modules have finished `onModuleInit`**, guaranteeing `DataSource`, `AppConfig`, and every domain service are ready before the first SSE byte or replay tick arrives. Using `onModuleInit` instead is a common mistake: it fires per-module in registration order and gives no guarantee that sibling modules (e.g., `game`) are fully initialized yet.

For shutdown: implement `onApplicationShutdown(signal)` (not just `onModuleDestroy`) to close SSE connections, stop replay timers, and flush the in-flight `stream_cursor` write — this only fires when `app.enableShutdownHooks()` is called in `main.ts`, which must be added explicitly (it is not default in NestJS).

**When to use:** Any process-lifetime background worker that must start after the app is fully wired and must drain cleanly on `SIGTERM` (Docker `docker stop`, Railway/Fly deploys).

**Trade-offs:** `OnApplicationBootstrap` blocks nothing else (Nest doesn't wait for it before serving HTTP), which is correct here — REST/WS should come up even if TxLINE auth is momentarily failing (exponential backoff keeps retrying in the background per the ported `upstream.ts`).

**Example:**
```typescript
// main.ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks(); // required for SIGTERM → onApplicationShutdown to fire
await app.listen(config.PORT);
```
```typescript
// modules/txodds/ingest-orchestrator.service.ts
@Injectable()
export class IngestOrchestratorService implements OnApplicationBootstrap, OnApplicationShutdown {
  async onApplicationBootstrap() {
    for (const game of await this.gameService.findLiveOnBoot()) {
      await this.stateRegistry.rebuild(game.id);         // replay own log first
      await this.startSource(game);                       // then reconnect / resume replay
    }
  }
  async onApplicationShutdown(signal?: string) {
    await this.drainAllSources();                          // close SSE, flush stream_cursor
  }
}
```

## Data Flow

### Ingest → Broadcast Flow (the demoable core loop)

```
TxLINE SSE (or ReplayEmitterService, source chosen by is_replay)
    ↓ raw feed record (flat PascalCase, defensive parsed.Update ?? parsed)
NormalizerService  (ported possession.ts / goals.ts — action classify, attack-run heuristic)
    ↓ normalized DTO
GameEventService.insertIdempotent()  → Postgres game_event  (UNIQUE(game_id, seq), ON CONFLICT DO NOTHING)
    ↓ (persisted — now safe to mutate/broadcast)
GameStateRegistry.get(gameId).apply(dto)  → possession gradient, 12s debounce, two-clock logic
    ↓ transition (question opened / attack progressed / hard terminal / soft-terminal stamp)
QuestionService / ResolutionService  (game_question lifecycle; awards via direct UserGameAnswer repo write)
    ↓ EventEmitter2.emit('game.event' | 'question.opened' | 'question.resolved' | 'question.voided')
core/ws EventsGateway  @OnEvent(...)  → socket.io broadcast to room `game:<id>`
```

### Restart Recovery Flow

```
Process boot
    ↓ onApplicationBootstrap
For each game with status='live':
    1. GameStateRegistry.rebuild(gameId)  — replay own game_event rows (same state-machine code, deterministic)
    2. Reconnect SSE with persisted stream_cursor as Last-Event-ID header
    3. Verify first incoming Seq ≤ max(seq)+1; on gap → void+refund open/pending questions, let state self-heal
```

### Key Data Flows

1. **Hot path (ingest → WS):** strictly synchronous/awaited through persistence and state mutation; only the final broadcast step is event-bus-decoupled. This is the flow the "persist-then-broadcast, always" invariant governs.
2. **Cold path (REST):** `game.controller.ts` (fixtures list) and `user.controller.ts` (auth, join, answer submit, leaderboard) are ordinary request/response NestJS controllers calling into the same services the hot path uses — e.g., `AnswerService.submit()` calls `QuestionService.assertOpenAndNotExpired()` before writing, reusing the single source of truth for question state (the DB row, not a duplicated in-memory copy — only match/possession state lives in memory; question state is authoritative in Postgres per the DB schema's partial unique indexes).
3. **Resolution → leaderboard:** `ResolutionService` writes `awarded_points` directly onto `user_game_answer` rows (via injected `UserGameAnswer` repository, not via a call into `modules/user`'s `AnswerService`) — see Anti-Patterns for why this avoids a circular module dependency. `LeaderboardService` (in `modules/user`) simply reads the aggregate; it has no write path into game state.

## Scaling Considerations

The brief explicitly rules out horizontal scaling and serverless — "the SSE ingest must run in exactly one long-lived process." The standard 0-1k/1k-100k/100k+ scaling ladder does not apply; what matters instead is what breaks *first inside* the single process.

| Concern | Within hackathon scope (1-3 concurrent games, dozens of demo users) | If this had to grow later |
|---------|----------------------------------------------------------------------|----------------------------|
| Event-loop blocking | Normalizer/state-machine work is small, synchronous JS — negligible risk at this volume | Move heavy parsing off the loop only if profiling shows it; not needed now |
| In-memory state growth | One `GameStateMachine` per concurrent game; trivial footprint | Evict finished games' state from the `Map` on `game_finalised` to bound memory over a long-running deployment |
| Postgres write volume | `game_event` inserts are the dominant write; idempotent unique index makes retries cheap | Not a concern at hackathon volume; batch-insert only if profiling shows contention |
| WS fan-out | socket.io rooms per game keep broadcast targeted | N/A — no horizontal scaling means no Redis adapter needed for socket.io either |

### Scaling Priorities

1. **Not applicable as "scaling" — but do budget for match-end cleanup**: on `game_finalised`, explicitly remove the game's entry from `GameStateRegistry` and unsubscribe/close its SSE or replay source. Skipping this is the one way a long-running demo deployment degrades over multiple matches.
2. **Reconnect storms**: the ported `upstream.ts` already implements exponential backoff + 30s idle watchdog — reuse it as-is rather than writing new reconnect logic; this is the actual reliability bottleneck for a demo, not throughput.

## Anti-Patterns

### Anti-Pattern 1: Routing the ingest hot path through `EventEmitter2`

**What people do:** Emit an event immediately on receiving a normalized frame and let a listener handle persistence, on the theory that "everything should be decoupled via events" in NestJS.

**Why it's wrong:** `EventEmitter2` listeners are fire-and-forget unless explicitly awaited with `emitAsync`; a thrown error in a listener does not naturally propagate back to the emitter, and ordering across multiple listeners for the same event is not a strong guarantee. This directly risks violating "persist-then-broadcast, always" and the idempotent-ingest invariant, and makes restart-recovery replay (which depends on `game_event` being a complete, trustworthy log) fragile.

**Do this instead:** Direct injected service calls for `normalize → persist → mutate state`; `EventEmitter2` only for the final fan-out to WS (and, later, any other decoupled consumer) after that chain has completed and awaited successfully.

### Anti-Pattern 2: Circular `GameModule ↔ UserModule` service imports

**What people do:** `ResolutionService` (in `game`) calls `AnswerService.applyAward()` (in `user`), while `UserGameService.join()` (in `user`) calls `GameService.exists()` (in `game`) — a bidirectional module dependency that forces `forwardRef()` on both sides.

**Why it's wrong:** `forwardRef()` circular imports work in NestJS but are a maintenance trap, especially with a hackathon-compressed timeline where getting DI wiring wrong costs debugging time you don't have. The `user_game_answer` write is really the tail end of the resolution transaction, not a distinct piece of business logic that belongs in `UserModule`.

**Do this instead:** Keep the module dependency one-directional (`user → game`, for the join-validation read). For the resolution write, have `ResolutionService` (in `game`) inject the `UserGameAnswer` TypeORM repository directly via `TypeOrmModule.forFeature([UserGameAnswer])` in `GameModule` — NestJS repository injection is not gated by which module "owns" the entity file. The entity still *lives* in `models/account/` per the folder convention; only the repository token is shared. `LeaderboardService`'s read-only aggregate in `user` has no coupling back to `game` at all.

### Anti-Pattern 3: Deriving in-memory match state from a DB query instead of the event stream

**What people do:** On each incoming frame, `SELECT ... FROM game_event WHERE game_id = ? ORDER BY seq DESC LIMIT N` to "figure out" current possession/attack state, instead of maintaining it in `GameStateRegistry`.

**Why it's wrong:** Defeats the entire point of the in-memory state machine (§5 of the brief), adds DB round-trip latency to the hot path, and makes the 12s debounce timing logic (which needs event-`Ts` deltas held in memory, not re-derived per query) awkward to implement correctly.

**Do this instead:** `game_event` is the durable log and the *replay source*, not a live query target. State lives in `GameStateRegistry`'s `Map` and is only rebuilt from the DB once, at boot (`rebuild()`), never per-frame.

### Anti-Pattern 4: Broadcasting before the DB write is durable

**What people do:** Push the socket.io message as soon as the state machine transitions, then persist afterward (or in parallel) "for performance."

**Why it's wrong:** Directly contradicts the brief's explicit invariant ("Persist-then-broadcast, always") and breaks restart-recovery: if the process crashes between broadcast and persist, connected clients saw an event that replay-based recovery can never reproduce, corrupting the demo's core trust property (the event log is "sacred").

**Do this instead:** Pattern 1 above — persist, then mutate state, then emit for broadcast, in that literal await order.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| TxLINE Scores Product (SSE) | `TxLineStreamService` wraps ported `upstream.ts`; `Last-Event-ID` header for resume; 30s idle watchdog + exponential backoff already implemented in the source module | Auth is a one-time backend-held JWT + API token (guest JWT → on-chain `subscribe` on Solana mainnet → sign → activate); see `txodds-api` skill for full flow |
| TxLINE Historical / replay | `ReplayEmitterService` — same normalized-DTO output shape as the live stream, so `IngestOrchestratorService` treats both sources identically past the source-switch point | Source-agnostic: historical fetch or captured NDJSON; rebases timestamps so `Ts ≈ wall clock` invariant holds |
| Postgres 16 (docker-compose) | `@nestjs/typeorm` via `modules/core/db`, migrations-only in non-dev environments | `docker-compose.yml` maps host port 5488 → container 5432; healthcheck present but currently references stale service/db names (`pmmarkets`) inherited from a template — worth fixing when wiring `db.module.ts`'s connection retry/health check |
| Solana wallet sign-in | Frontend-only concern; backend just verifies a signature against `wallet_address` at signup/signin | Out of this module's scope — covered by `modules/user` auth, not `modules/txodds` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| `txodds` → `game` | Direct injected service calls (`GameEventService`, `GameStateRegistry`) | Hot path; must stay synchronous/awaited (Pattern 1) |
| `game` → `core/ws` | `EventEmitter2` (`@OnEvent`) | Decoupled fan-out only, fired after persistence (Pattern 1) |
| `core/scheduler` → `game` | Direct call (`GameService.upsertFixtures()`) | Cron trigger is infra-only; domain logic stays in `game` |
| `core/scheduler` / `game` → `txodds` | Direct call (`IngestOrchestratorService.startGameIngest(game)`) | Decides live-SSE vs replay-emitter per `is_replay`; downstream code is source-agnostic per the brief |
| `user` → `game` | Direct call, read-only (`GameService.exists()` for join validation) | One-directional only — see Anti-Pattern 2 |
| `game` → `models/account` (`UserGameAnswer` repo) | Direct TypeORM repository injection, not a `user`-module service call | Avoids circular `game ↔ user` dependency (Anti-Pattern 2) |
| `core/ws` → `game` | Direct call, read-only (`GameStateRegistry.snapshot(gameId)`) for the on-subscribe full snapshot | Snapshot composition needs current, not historical, state — not an event replay |

## Sources

- `initial-request-src/initial-project-context.md` §5 "Ingest & lifecycle architecture" — authoritative decided pipeline (HIGH — project source of truth)
- `initial-request-src/initial-db-structure.sql` — authoritative schema, FK/unique-index structure used to derive entity-to-module mapping (HIGH — project source of truth)
- `initial-request-src/system-prompt.md` — folder convention (`modules/<entity>/`, `models/<entity>/`) and named reference repos (HIGH — project source of truth)
- `github.com/galacticcouncil/hydration-data-feeds`, `apps/hydration-data-lake-adapter/src/modules/config/{app.config.ts,config.module.ts,types.ts,index.ts}` — fetched live via GitHub API, confirmed pattern: `class-validator`-decorated `AppConfig` class with a static `getInstance()` singleton, `@Global() ConfigurationModule` provider, no `@nestjs/config` `ConfigService` indirection (HIGH — fetched directly, matches brief's explicit reference)
- `github.com/dappforce/epic-data-hub` `data-hub-core/src/db/typeorm.config.ts` — **inaccessible** (repo returns 404 over both the GitHub API and raw content, so it is private or has moved). The recommended `modules/core/db/typeorm.config.ts` pattern (single exported `DataSource`, shared by NestJS bootstrap and TypeORM CLI migration commands) is the standard, widely-documented approach for `@nestjs/typeorm` + CLI migrations, not verified against this specific repo (MEDIUM — standard community/official pattern, not source-verified for this named reference)
- NestJS official docs — lifecycle events (`OnApplicationBootstrap`, `OnApplicationShutdown`, `enableShutdownHooks`), `@nestjs/event-emitter` (`EventEmitterModule`, `@OnEvent`, `emitAsync`), `@nestjs/schedule` (`@Cron`), `@nestjs/websockets` + `@nestjs/platform-socket.io` gateways — stable NestJS 11 APIs (HIGH — well-established, unlikely to have material breaking changes)

---
*Architecture research for: real-time sports feed-ingest backend (NestJS)*
*Researched: 2026-07-17*
