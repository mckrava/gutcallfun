# Phase 2: Feed Ingest, Replay & State Machine - Research

**Researched:** 2026-07-17
**Domain:** Real-time sports data ingest (SSE) + replay simulation + in-memory per-entity state machines, on a NestJS 11 / TypeORM 0.3.31 / Postgres 16 stack
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Replay source & emitter (consolidated design ADOPTED):**
- **D-01:** Two-source model. Source A (primary): historical fetch at runtime from `/api/scores/historical/{fixtureId}` (serves fixtures ≥6h–2w old, full log in one fetch), cached **in-memory only** per process. Source B (fallback): captured NDJSON files / own `game_event` rows fed through the same source-agnostic emitter (ordered raw-event array in). Source B is also the RCVR-01 boot-recovery path — build once, use twice.
- **D-02:** `is_replay` switches ONLY the source. One scheduler rule for all games: `starts_at <= now() AND status='scheduled'` → start the game's source (SSE for live, emitter for replay). Everything downstream (normalizer, persistence, state machine, later phases) is replay-unaware. No mode flags leak past the source boundary. **HARD CONSTRAINT (user-stated): a running replay must never affect live-game ingest — live + replay games coexist in one process with per-game isolation.**
- **D-03:** Timestamp rebasing: `delta = now() − firstEvent.Ts` added to every event's Ts. Live path is a passthrough (delta never touches naturally-started games). `expires_at`/answer-TTL semantics stay on server wall clock even in replay — correct because rebasing + 1× pacing aligns event time with wall time.
- **D-04:** Pacing: original inter-event gaps ÷ speed. Default speed=1 (script arg override). **speed>1 is a headless-testing configuration only, never user-facing** (a 5s window spans 100s of match time at 20×). Pre-match segment plays at **full original pacing** (no compression, no skip).
- **D-05:** No dependency on TxLINE VirtualFixture (absent from OpenAPI, unverified) and no dependency on TxLINE uptime on recording night (Source B covers).

**Replay arming & demo control surface:**
- **D-06:** Replay creation is a dev/admin action, NOT the fixtures cron. Primary tooling: tsx script `npm run replay:create -- <fixtureId> [--speed N]`. Additionally (user's chosen demo surface): **manual DB flip must work** — scheduler polls (~15s) for `is_replay=true AND status='scheduled' AND starts_at<=now()`; a single UPDATE (`is_replay=true, status='scheduled', starts_at=now()+~3min`) arms a replay on an existing past-game row.
- **D-07:** Auto-wipe on replay start: the starter wipes that game's prior `game_event` rows and resets denormalized score/state before emitting, so re-flipping the same row for take #2 never collides with `UNIQUE(game_id, seq)`. Replay rows are disposable by definition; append-only discipline applies to live games.
- **D-08:** `starts_at = now() + ~3 min` choreography: fixture list renders the replay as genuinely upcoming, giving time to record the browse/join segment before the scheduler fires.

**Fixtures discovery:**
- **D-09:** Reality note: the feed currently has NO live or upcoming fixtures. Discovery must ALSO pull past games: last N fixtures (env `PAST_FIXTURES_COUNT`, default 20) into `game` rows (status finished, real team names/metadata, never ingested) as browsable replay source material.
- **D-10:** No competition filter — take every soccer fixture TxLINE returns (feed is sparse; everything is potential demo material).
- **D-11:** Upcoming window: 7 days ahead. Upsert-only by `fixture_id` (GAME-01 create/update); vanished fixtures left as-is (no delete/reconcile logic); postponements arrive as updated `starts_at`.
- **D-12:** When live fixtures reappear: ingest ALL discovered live games — no allowlist, no cap.

**Seq-gap consequence seam (Phase 4 boundary):**
- **D-13:** Ingest emits a typed in-process event on gap detection — `GameStreamGapDetected {gameId, expectedSeq, actualSeq, at}`. Phase 2 ships a log-only listener; Phase 4 replaces the listener body with real void+refund + goal adjudication. Same seam is reused for restart-hole detection (RCVR-02). Contract fixed now, zero ingest rework later.

### Claude's Discretion
- Event-bus mechanism for D-13 (plain typed emitter vs Nest event emitter) — planner/researcher choose the lightest thing consistent with the locked stack. **Resolved by this research: native Node `EventEmitter` wrapped in a typed NestJS singleton — see Standard Stack / Alternatives Considered.**
- `stream_cursor` flush cadence "every N events" (INGST-04) — pick N during planning. **Resolved by this research: N=1 (every event, same transaction) — see Common Pitfalls #4.**
- Scheduler poll interval exact value (~15s guidance). **Resolved by this research: `*/15 * * * * *` (6-field cron, seconds granularity) — see Architecture Patterns, Pattern 5.**
- State-machine debug logging verbosity. Recommend `Logger.debug()` gated by `NODE_ENV !== 'production'`, consistent with the existing `database.module.ts` logging pattern.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Android recording for Vibration API haptics remains a NICE-list item tracked in STATE.md deferred table, not a Phase 2 concern.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| GAME-01 | Cron job (every 1 min) discovers available fixtures from TxLINE and creates/updates `game` rows with team names, competition, fixture_group_id, starts_at | `/api/fixtures/snapshot` contract confirmed (forward-only window — see Pitfall 1); `@Cron(CronExpression.EVERY_MINUTE)` pattern (Pattern 5); upsert via TypeORM repository `save`/`upsert` by `fixture_id` |
| INGST-01 | Backend authenticates to TxLINE using `.env` credentials (guest JWT + X-Api-Token; 401 → refresh JWT, retry) | Full 3-step auth chain + 401-retry gotcha documented in `auth-and-subscription.md`/`sse-streaming.md` (Sources); config schema extension noted (Open Question 2) |
| INGST-02 | SSE client ported from `upstream.ts` (fetch/ReadableStream, Last-Event-ID resume, 30s idle watchdog, exponential backoff) | Reference repo module summary (Architecture Patterns, Recommended Project Structure); AbortController shutdown pattern (Pattern 4) |
| INGST-03 | Every stream message persisted to append-only `game_event` idempotently (`UNIQUE(game_id, seq)` + ON CONFLICT DO NOTHING); unknown actions/statuses stored and ignored, never crash | `InsertQueryBuilder.orIgnore()` pattern (Pattern 1); defensive JSON.parse / unknown-action handling (Security Domain, V5) |
| INGST-04 | `stream_cursor` flushed every N events in the same transaction as the event insert; flushed on SIGTERM | N=1 recommendation + same-transaction invariant (Common Pitfalls #4); AbortController + `OnApplicationShutdown` flush pattern (Pattern 4) |
| INGST-05 | Ingest lazily fills game row from stream: jersey colors, `current_status_id`, denormalized score; `score_adjustment` treated as authoritative resync | Message schema for `jersey`, `status`, `score_adjustment` actions documented in `message-reference.md` (Sources) |
| RPLY-01 | Replay emitter feeds the identical downstream pipeline from a recorded source; timestamps rebased, paced by original inter-event gaps × speed | Reference `replay.ts` module summary + pacing formula (Architecture Patterns); D-04 conflict with reference repo's default `maxGapMs` clamp flagged explicitly (Summary, Anti-Patterns) |
| RPLY-02 | `is_replay` switches ONLY the source; scheduler starts SSE for live, emitter for replay; downstream code cannot tell the difference | System Architecture Diagram shows the source-boundary split; normalizer explicitly source-agnostic |
| RPLY-03 | Admin/dev action can create a replay game; multiple takes = multiple replay rows | D-06/D-07 requirements restated verbatim in User Constraints; partial unique index (`uq_game_fixture_live`) confirmed in schema |
| STAT-01 | Singleton registry holds one in-memory state machine per live game, derived from ported `possession.ts`/`goals.ts`; self-heals from any message after a gap | Reference repo module summaries for `possession.ts`/`goals.ts` (Architecture Patterns); `Id`-based dedup/reconciliation pitfall (Common Pitfalls #3) |
| STAT-02 | Events for the same game processed strictly serially (per-game mutex/queue) | `async-mutex` per-game `Mutex` pattern (Pattern 2, Standard Stack) |
| STAT-03 | Two-clock discipline: match-time logic uses event `Ts` deltas; user-time logic uses server wall clock | Pattern 3 (Two-clock discipline) with code example |
| RCVR-01 | On boot, `status='live'` games rebuild in-memory state by replaying own `game_event` rows through the same code path | Restart path described in System Architecture Diagram; Source B reuse (D-01) confirmed as "build once, use twice" |
| RCVR-02 | Stream reconnects with persisted `stream_cursor` as Last-Event-ID; gap self-heals, voids+refunds pending windows, adjudicates pending goals from Score | `Seq` per-`ConnectionId` reset pitfall (Common Pitfalls #7); `GameStreamGapDetected` seam (D-13, User Constraints) — void+refund body is explicitly Phase 4's responsibility, Phase 2 ships the detection + log-only listener |
</phase_requirements>

## Summary

This phase builds the correctness backbone of the whole product: a source-agnostic pipeline that turns TxLINE soccer events (live SSE or replayed history) into a trusted, append-only `game_event` log and an accurate in-memory per-game state machine, recoverable across restarts. Nothing here is exploratory — CONTEXT.md and CLAUDE.md already lock almost every architectural decision (two-source replay model, `is_replay` source-switch-only semantics, ported `upstream.ts`/`possession.ts`/`goals.ts`, `@nestjs/schedule` for cron, no new SSE/queue/ORM libraries). Research therefore focuses on: (1) verifying the TxLINE API surfaces this phase actually calls (fixtures snapshot, historical, SSE) against their real constraints, (2) filling the two small technical gaps CONTEXT.md left as "Claude's Discretion" (per-game serial-processing primitive, in-process event-bus mechanism), and (3) surfacing pitfalls specific to porting the reference monitor repo's logic into a NestJS DI/transaction context.

The single most consequential finding: `GET /api/fixtures/snapshot` is **forward-only** — it returns fixtures "starting at or within 30 days after" a given `startEpochDay`, defaulting to today. There is no dedicated "past fixtures" endpoint. Satisfying D-09 (pull the last N past fixtures as replay source material) requires deliberately calling `/api/fixtures/snapshot?startEpochDay=<N days ago>` so the 30-day forward window from that anchor includes fixtures whose `StartTime` has already passed, then filtering/sorting client-side. This must be explicit in the fixtures-cron plan or GAME-01 will silently return nothing (current reality: "the feed currently has NO live or upcoming fixtures" per D-09).

The second finding worth flagging: the reference `replay.ts`'s default `maxGapMs` (5000ms) **clamps** inter-event gaps to prevent multi-hour pre-match dead time from stalling playback. CONTEXT.md's D-04 explicitly **locks the opposite** behavior for this project ("pre-match segment plays at full original pacing — no compression, no skip"). When porting `replay.ts`, this default must be overridden/removed for the pre-match segment, not inherited as-is — a direct conflict between "port as-is" (CLAUDE.md) and a locked user decision (CONTEXT.md D-04) that the planner must resolve explicitly (CONTEXT.md wins; document the deviation from the reference repo).

**Primary recommendation:** Port `upstream.ts`/`possession.ts`/`goals.ts`/`replay.ts` near-verbatim as pure/injectable modules; wrap them in a NestJS ingest module with one `@Cron` fixtures poller (1 min) and one `@Cron` replay-arm poller (~15s); serialize per-game event processing with `async-mutex` (one `Mutex` per `gameId`); persist via `InsertQueryBuilder.orIgnore()` for idempotent `game_event` inserts; signal seq-gaps via a small typed native-`EventEmitter`-backed singleton, not a new pub/sub dependency.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fixtures discovery (GAME-01) | Backend / Cron | Database | `@nestjs/schedule` cron calls TxLINE REST, upserts `game` rows; no client involvement |
| TxLINE SSE ingest (INGST-01..05) | Backend / long-lived process | Database | Single in-process connection per live game; must run in exactly one process (deployment constraint) |
| Replay emitter (RPLY-01..03) | Backend / long-lived process | Database | Drives the identical downstream pipeline as SSE; source-only difference |
| Event persistence (append-only log) | Database / Storage | Backend | `game_event` is the source of truth and future replay-as-demo-source material |
| Per-game state machine (STAT-01..03) | Backend / in-memory singleton registry | — | Lives entirely in process memory; rebuilt from DB on restart (RCVR-01) |
| Restart recovery (RCVR-01..02) | Backend / long-lived process | Database | Reads `game_event` rows + `stream_cursor` to rebuild state and resume the stream |
| Seq-gap event seam (D-13) | Backend / in-process pub-sub | — | Log-only in Phase 2; Phase 4 attaches the real void+refund listener |

No browser, CDN, or frontend-server tier involvement in this phase — it is a pure backend pipeline. REST/WS surface is explicitly Phase 5 scope.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/schedule` | **6.1.3** [VERIFIED: npm registry, matches CLAUDE.md LOCKED pin] | Fixtures cron (1 min) + replay-arm poller (~15s) | LOCKED choice per CLAUDE.md; peer-compatible with `@nestjs/common@^11` (confirmed via `npm view` peerDependencies: `^10.0.0 \|\| ^11.0.0`). Pulls in `cron@4.4.0` transitively — current stable, no manual pin needed. |
| `typeorm` | **0.3.31** [VERIFIED: npm registry, already pinned in package.json] | `InsertQueryBuilder.orIgnore()` for idempotent `game_event` inserts; repository queries for state rebuild | Already the project's pinned ORM version (Phase 1). `.orIgnore()`/`.orUpdate()` are present across the whole 0.3.x line, not a new-version dependency. |
| `pg` | **8.22.0** [VERIFIED: already in package.json] | Postgres driver | Already pinned; no phase-specific change. |
| Native `fetch` + `ReadableStream` (Node 24 built-in) | — | SSE client transport (ported `upstream.ts`) | Zero new dependency; TxLINE requires two custom auth headers `EventSource` cannot send — CLAUDE.md explicitly rejects the `eventsource` package for this reason. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `async-mutex` | **0.5.0** [VERIFIED: npm registry + package-legitimacy OK, 10M+ weekly downloads, github.com/DirtyHairy/async-mutex] | Per-game serial event processing (STAT-02) | Keep a `Map<gameId, Mutex>`; `await mutex.runExclusive(() => processEvent(...))` around every event handled for that game. Resolves the "Claude's Discretion" item in CONTEXT.md — chosen over `p-queue` (see Alternatives). |
| Native Node.js `EventEmitter` (built-in, wrapped in a typed NestJS singleton) | — | In-process `GameStreamGapDetected` seam (D-13) | Zero new dependency; one event type, one log-only listener in Phase 2, swapped for the real handler in Phase 4. See Alternatives for why this beats `@nestjs/event-emitter` here. |
| `AbortController` (built-in) | — | Clean SSE shutdown on SIGTERM | Pass `{ signal }` to `fetch()`; call `controller.abort()` from the `OnApplicationShutdown` hook so the blocked `reader.read()` throws immediately instead of hanging the process past `enableShutdownHooks()`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `async-mutex` | `p-queue` (concurrency:1 per-game queue) | `p-queue@9.3.1` is ESM-only [WARNING: flagged SUS by package-legitimacy check — release is only weeks old relative to research date], adding friction in this project's default CommonJS NestJS build. `async-mutex` is CJS+ESM dual-published and simpler for a single acquire/release pattern. |
| Native `EventEmitter` for D-13 | `@nestjs/event-emitter` (`EventEmitter2` + `@OnEvent` decorator) [VERIFIED: npm registry + package-legitimacy OK] | `@nestjs/event-emitter` is DI-idiomatic and gives async-listener/wildcard support out of the box — a fine choice if the team expects more than one listener type. For exactly one event type with one Phase-2 log-only listener (swapped for one Phase-4 listener), it's an extra dependency for no functional gain; a ~15-line typed wrapper around the built-in `EventEmitter` is lighter and equally DI-friendly as an injectable singleton provider. Revisit if Phase 4 ends up needing wildcard patterns or multiple concurrent listeners on the same event. |
| `InsertQueryBuilder.orIgnore()` | Manual `SELECT` existence check then `INSERT` | Race-prone (TOCTOU) outside a single atomic statement; `.orIgnore()` compiles to `ON CONFLICT DO NOTHING` in one round trip, safe under concurrent SSE-resume + replay-overlap re-delivery. |
| Static `@Cron()` decorators (two, fixed expressions) | `SchedulerRegistry.addCronJob()` dynamic registration | Dynamic registration is for schedules unknown until runtime (e.g., user-configured intervals). Both this phase's intervals (1 min fixtures poll, ~15s replay-arm poll) are fixed at compile time — two `@Cron()` methods are simpler and sufficient; no need for the dynamic API's extra ceremony. |

**Installation:**
```bash
npm install --workspace=apps/gutcallfun-core @nestjs/schedule@6.1.3 async-mutex@0.5.0
```
(`typeorm`, `pg`, `@nestjs/common`/`core` etc. are already installed from Phase 1 — no version change needed.)

**Version verification:** Confirmed live via `npm view <pkg> version` on 2026-07-17: `@nestjs/schedule@6.1.3` (matches CLAUDE.md pin exactly), `async-mutex@0.5.0` (published 2024-03-11, stable), `cron@4.4.0` (transitive peer, current). `typeorm@0.3.31` and `pg@8.22.0` already verified in Phase 1 research and present in `package.json`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@nestjs/schedule` | npm | latest release 2026-04-15 (project long-lived, official NestJS org package) | 3.8M/wk | github.com/nestjs/schedule | OK | Approved |
| `cron` (transitive via `@nestjs/schedule`) | npm | latest release 2025-12-09 | 5.9M/wk | github.com/kelektiv/node-cron | OK | Approved (transitive, no direct install needed) |
| `async-mutex` | npm | latest release 2024-03-11 | 10.0M/wk | github.com/DirtyHairy/async-mutex | OK | Approved |
| `@nestjs/event-emitter` | npm | latest release 2026-04-27 | 1.8M/wk | github.com/nestjs/event-emitter | OK | Not adopted (see Alternatives — native `EventEmitter` preferred for this phase's single-event-type need); safe to add later if Phase 4 needs it |
| `p-queue` | npm | latest release 2026-07-03 (2 weeks old at research time) | 27.8M/wk | github.com/sindresorhus/p-queue | SUS (flagged "too-new" by legitimacy check — long-lived package, but its most recent version is very fresh) | REMOVED from recommendation — use `async-mutex` instead; also ESM-only, adds build friction |

No `postinstall` scripts found on any candidate package (`npm view <pkg> scripts.postinstall` returned empty for all).

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `p-queue` — not recommended; if the planner or a future phase reconsiders it, gate the install behind a `checkpoint:human-verify` task first.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌────────────────────────────┐
                         │   Fixtures Cron (1 min)     │
                         │  GET /api/fixtures/snapshot  │
                         │  (startEpochDay = today,     │
                         │   AND startEpochDay = N days │
                         │   ago for past-fixture pull) │
                         └──────────────┬───────────────┘
                                        │ upsert by fixture_id
                                        ▼
                         ┌────────────────────────────┐
                         │        game (Postgres)       │
                         │  status, starts_at, names,    │
                         │  is_replay, stream_cursor      │
                         └──────────────┬───────────────┘
                                        │ scheduler poll (~15s):
                                        │ starts_at<=now() AND status='scheduled'
                                        ▼
                    ┌───────────────────┴────────────────────┐
                    │                                        │
                    ▼ is_replay=false                        ▼ is_replay=true
        ┌───────────────────────┐              ┌───────────────────────────┐
        │   SSE Client           │              │   Replay Emitter            │
        │  (ported upstream.ts)   │              │  (ported replay.ts,         │
        │  fetch+ReadableStream,  │              │   Source A: historical      │
        │  Last-Event-ID resume,  │              │   fetch; Source B:          │
        │  30s idle watchdog,     │              │   captured NDJSON /         │
        │  exponential backoff    │              │   own game_event rows)      │
        └───────────┬─────────────┘              └────────────┬───────────────┘
                    │  raw feed message (PascalCase JSON)       │ rebased Ts,
                    │                                            │ paced by
                    ▼                                            │ original gaps × speed
        ┌─────────────────────────────────────────────────────────┐
        │       Normalizer (source-agnostic, replay-unaware)         │
        │  parse → validate → map to game_event columns              │
        └───────────────────────────┬─────────────────────────────┘
                                    │ per-game Mutex.runExclusive()
                                    ▼
        ┌─────────────────────────────────────────────────────────┐
        │   Transaction: INSERT game_event (orIgnore on UNIQUE      │
        │   (game_id,seq)) + conditional UPDATE game.stream_cursor  │
        └───────────────────────────┬─────────────────────────────┘
                                    │ persisted event
                                    ▼
        ┌─────────────────────────────────────────────────────────┐
        │   Per-game in-memory State Machine (singleton registry)   │
        │  possession stage (possession.ts) · goal confirm/discard   │
        │  (goals.ts) · clock · StatusId · score · attack run        │
        └───────────────────────────┬─────────────────────────────┘
                                    │ on seq-gap detected
                                    ▼
        ┌─────────────────────────────────────────────────────────┐
        │  GameStreamGapDetected (typed in-process event)            │
        │  Phase 2: log-only listener · Phase 4: void+refund listener │
        └─────────────────────────────────────────────────────────┘

Restart path (RCVR-01/02): boot → for each status='live' game, replay its own
game_event rows (ORDER BY seq) through the SAME normalizer/state-machine code
path used live → reconnect SSE with Last-Event-ID = persisted stream_cursor →
verify first incoming Seq <= max(seq)+1 → on gap, self-heal + emit
GameStreamGapDetected.
```

### Recommended Project Structure
```
apps/gutcallfun-core/src/
├── modules/
│   └── ingest/
│       ├── ingest.module.ts
│       ├── fixtures/
│       │   ├── fixtures-cron.service.ts        # GAME-01: @Cron 1-min poller
│       │   └── txline-fixtures.client.ts        # thin fetch wrapper over /api/fixtures/snapshot
│       ├── stream/
│       │   ├── upstream.ts                      # ported near-verbatim (INGST-02)
│       │   ├── stream-manager.service.ts         # owns one live connection per live game, AbortController per game
│       │   └── replay-arm-cron.service.ts        # D-06: ~15s poller, flips scheduled replay games live
│       ├── replay/
│       │   ├── replay.ts                         # ported, maxGapMs override for pre-match (D-04)
│       │   ├── historical.client.ts              # GET /api/scores/historical/{fixtureId} (Source A)
│       │   └── replay-source.service.ts          # Source A/B selection + NDJSON capture read (Source B)
│       ├── persistence/
│       │   └── event-ingest.service.ts           # normalizer + per-game Mutex + orIgnore insert + stream_cursor flush
│       ├── state/
│       │   ├── possession.ts                     # ported near-verbatim (STAT-01)
│       │   ├── goals.ts                           # ported near-verbatim (STAT-01)
│       │   ├── game-state.registry.ts             # singleton Map<gameId, GameState>
│       │   └── game-state-rebuild.service.ts       # RCVR-01: replay own game_event rows on boot
│       └── events/
│           └── game-stream-gap.emitter.ts          # D-13 typed EventEmitter singleton
```

### Pattern 1: Idempotent event insert (INGST-03)
**What:** Insert every feed message into `game_event`, ignoring duplicates on `UNIQUE(game_id, seq)`.
**When to use:** Every persisted feed message, live or replay, including SSE Last-Event-ID resume re-delivery and replay-overlap re-runs.
**Example:**
```typescript
// Source: typeorm.io Insert Query Builder docs (orIgnore/orUpdate), cross-checked via WebSearch 2026-07-17
await this.dataSource
  .createQueryBuilder()
  .insert()
  .into(GameEventEntity)
  .values({
    gameId,
    type: parsed.Action,
    payload: parsed,
    actionId: parsed.Id ?? null,
    seq: parsed.Seq,
    confirmed: parsed.Confirmed ?? null,
    participant: parsed.Participant ?? null,
    statusId: parsed.StatusId ?? null,
    feedTs: new Date(parsed.Ts),
  })
  .orIgnore() // ON CONFLICT DO NOTHING (matches uq_game_event_seq)
  .execute();
```

### Pattern 2: Per-game serial processing (STAT-02)
**What:** Guarantee no interleaved-await state corruption when fast concurrent events arrive for the same game.
**When to use:** Wrap every event-processing call (normalize → persist → update state machine) for a given `gameId`.
**Example:**
```typescript
// Source: async-mutex README pattern (github.com/DirtyHairy/async-mutex), cross-checked via WebSearch 2026-07-17
import { Mutex } from 'async-mutex';

@Injectable()
export class GameMutexRegistry {
  private readonly mutexes = new Map<number, Mutex>();

  private forGame(gameId: number): Mutex {
    let m = this.mutexes.get(gameId);
    if (!m) { m = new Mutex(); this.mutexes.set(gameId, m); }
    return m;
  }

  async runExclusive<T>(gameId: number, fn: () => Promise<T>): Promise<T> {
    return this.forGame(gameId).runExclusive(fn);
  }
}
```

### Pattern 3: Two-clock discipline (STAT-03)
**What:** Match-time logic (debounce, run segmentation) uses feed `Ts` deltas; user-time logic (`expires_at`, answer lock — Phase 4) uses server wall clock.
**When to use:** Anywhere a duration comparison happens. Never mix the two clock sources in one comparison.
**Example:**
```typescript
// feed-time comparison (state machine internals, e.g. attack-run expiry from possession.ts)
const attackRunExpired = (nowFeedTs: number, lastDangerTs: number) =>
  nowFeedTs - lastDangerTs > ATTACK_GAP_MS; // both operands are feed Ts (ms epoch)

// wall-clock comparison (answer window authority — Phase 4, documented here for the seam)
const answerLocked = (expiresAt: Date) => Date.now() > expiresAt.getTime(); // server wall clock only
```

### Pattern 4: Clean shutdown of a blocked SSE read (INGST-04, RCVR)
**What:** `enableShutdownHooks()` alone does not stop a blocked `reader.read()` — the process can hang past SIGTERM.
**When to use:** Every long-lived stream connection.
**Example:**
```typescript
// Source: NestJS lifecycle-events docs pattern, cross-checked via WebSearch 2026-07-17
@Injectable()
export class StreamManagerService implements OnApplicationShutdown {
  private readonly controllers = new Map<number, AbortController>();

  connect(gameId: number, url: string, headers: HeadersInit) {
    const controller = new AbortController();
    this.controllers.set(gameId, controller);
    return fetch(url, { headers, signal: controller.signal });
  }

  async onApplicationShutdown() {
    for (const controller of this.controllers.values()) controller.abort();
    await this.flushAllStreamCursors(); // same-transaction guarantee, see INGST-04
  }
}
```

### Pattern 5: Two fixed-interval cron pollers, one module
**What:** Fixtures discovery (1 min) and replay-arm (~15s) are independent, fixed-interval jobs — no dynamic registration needed.
**Example:**
```typescript
// Source: NestJS @nestjs/schedule docs pattern, cross-checked via WebSearch 2026-07-17
@Injectable()
export class FixturesCronService {
  @Cron(CronExpression.EVERY_MINUTE)
  async discoverFixtures() { /* GAME-01 */ }
}

@Injectable()
export class ReplayArmCronService {
  @Cron('*/15 * * * * *') // 6-field cron, seconds granularity
  async armScheduledReplays() { /* D-06 */ }
}
```

### Anti-Patterns to Avoid
- **Rebuilding the SSE client from scratch or on an SSE library:** CLAUDE.md LOCKS porting `upstream.ts` as-is (native fetch/ReadableStream). Any new implementation risks re-learning goal confirm/discard timing and Seq-gap tolerance already solved against a 23,510-record corpus.
- **Treating `Action:"possession"` as a danger stage:** it is a ball-holder-change marker only (no `PossessionType`); classify by exact `Action` match against the four staged possession actions.
- **Treating each feed message as a new event:** dedup on `Id` — a goal's `Confirmed:false` can precede `Confirmed:true` by ~76s; a substitution/action can carry a `FollowsAction` link.
- **Inheriting the reference repo's `maxGapMs=5000` pre-match clamp unmodified:** contradicts the locked D-04 "no compression, no skip" pre-match requirement — must be an explicit code change during porting, not an oversight.
- **Assuming `/api/fixtures/snapshot` returns past fixtures by default:** it does not; `startEpochDay` must be set into the past to pull already-started/finished fixtures within its 30-day forward window (see D-09 gap below).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent duplicate-safe insert | Manual SELECT-then-INSERT or catch-unique-violation try/catch | `InsertQueryBuilder.orIgnore()` | Atomic `ON CONFLICT DO NOTHING`, race-free under concurrent SSE-resume + replay-overlap re-delivery |
| Per-game serial event ordering | Custom promise-chain / manual lock flag per gameId | `async-mutex` `Mutex` per key | Battle-tested release/timeout semantics; a hand-rolled flag risks deadlock on thrown errors mid-await |
| SSE reconnect/backoff/idle-watchdog | New SSE parsing/backoff implementation | Port `upstream.ts` as-is | Already solved against a 23,510-record empirical corpus (CLAUDE.md LOCK) |
| Cron scheduling | `setInterval`/`setTimeout` loops with manual drift correction | `@nestjs/schedule` `@Cron()` | Nest lifecycle-aware, locked stack choice, avoids drift and overlap-run bugs |
| Graceful shutdown ordering | Ad hoc `process.on('SIGTERM', ...)` | `app.enableShutdownHooks()` + `OnApplicationShutdown` (already wired in `main.ts`) | Standard hook ordering (`onModuleDestroy` → `beforeApplicationShutdown` → `onApplicationShutdown`); avoids double-cleanup races |

**Key insight:** almost everything genuinely hard in this phase (feed parsing edge cases, goal confirm/discard timing, backoff/jitter, possession classification) is *already solved* in the reference monitor repo per CLAUDE.md's explicit porting instruction — the risk in this phase is re-solving it worse, not under-tooling it. The only genuinely new infrastructure is the NestJS DI wiring (module boundaries, transactional persistence, per-game mutex) around that already-solved logic.

## Common Pitfalls

### Pitfall 1: Fixtures snapshot endpoint is forward-only
**What goes wrong:** GAME-01's fixtures cron only ever sees empty results for "past fixtures," because `/api/fixtures/snapshot?startEpochDay=<today>` (the naive call) only returns fixtures starting today or up to 30 days in the future.
**Why it happens:** The endpoint's contract is literally "fixtures starting at or within 30 days after the given day" [CITED: vendored txline-openapi.yaml, `/api/fixtures/snapshot` operation description] — there is no separate "historical fixtures list" endpoint.
**How to avoid:** Call the endpoint a second time (or instead) with `startEpochDay` set `PAST_FIXTURES_COUNT`-worth of days in the past (e.g., `today − 14`), so its 30-day-forward window includes fixtures whose `StartTime` has already elapsed; filter/sort client-side by `StartTime` descending, take the last N, and mark them `status='finished'` per D-09.
**Warning signs:** `game` table stays empty of "browsable past" rows despite the cron running every minute without errors.

### Pitfall 2: Historical replay source has a hard retention window
**What goes wrong:** `GET /api/scores/historical/{fixtureId}` (D-01 Source A) silently returns nothing for fixtures outside its window.
**Why it happens:** Retention is **exactly 2 weeks to 6 hours in the past** [CITED: txline-endpoints.md / vendored OpenAPI]. Fixtures more recent than 6h or older than 2wk return empty.
**How to avoid:** This is precisely why D-01 mandates Source B (captured NDJSON / own `game_event` rows) as a fallback — never assume Source A alone covers all demo material; verify each candidate fixture's `starts_at` against the window before relying on the historical fetch.
**Warning signs:** A chosen demo fixture (per the "confirmed goal + VAR overturn" pick in CONTEXT.md Specifics) returns an empty historical array at record time.

### Pitfall 3: Confirm/discard/amend messages are corrections, not new events
**What goes wrong:** Naively appending every message as an independent fact double-counts goals or misses a discard, corrupting resolution logic downstream (Phase 4) and the state machine's score.
**Why it happens:** `action_amend`/`action_discarded` retroactively modify or remove a previously sent action by its `Id` [CITED: message-reference.md]; a goal's `Confirmed:false` and later `Confirmed:true` share the same `Id`.
**How to avoid:** `game_event` still stores every raw message (append-only, replay-integrity requirement) — but the **state machine** (not the log) must dedup/reconcile on `Id`, matching the reference `goals.ts` anchor-to-earliest pattern.
**Warning signs:** Denormalized `score_p1`/`score_p2` on `game` jump inconsistently, or a discarded shot leaves a stale high-water mark (this specific case is Phase 4's WNDW-04 concern, but the state machine's `Id`-keyed bookkeeping must exist in Phase 2 to support it).

### Pitfall 4: `stream_cursor` written ahead of persisted events
**What goes wrong:** A crash between the cursor UPDATE and the event INSERT causes RCVR-02's resume-from-cursor to skip an event that was never actually persisted.
**Why it happens:** Easy to write cleanly-separated code where the cursor update happens in a different transaction (or after) the event insert, especially once batching ("every N events" per INGST-04) is introduced.
**How to avoid:** Cursor UPDATE must be in the **same transaction** as the event INSERT it corresponds to, and must never advance past the last successfully committed event's `seq`/frame id. Recommend N=1 (flush every event, same transaction) as the default for this phase — feed volume (tens to low-thousands of messages per full match) does not justify batching-for-perf risk against a correctness-critical recovery invariant; revisit only if profiling shows write pressure.
**Warning signs:** After a forced restart mid-stream, replayed state (RCVR-01) doesn't match what a fresh SSE resume (RCVR-02) delivers for the same gap.

### Pitfall 5: Blocked `reader.read()` survives SIGTERM
**What goes wrong:** `enableShutdownHooks()` fires `onApplicationShutdown`, but the process doesn't actually exit — a live SSE connection's `reader.read()` Promise is still pending.
**Why it happens:** [CITED, cross-referenced NestJS lifecycle docs] `app.close()`/shutdown hooks don't kill the process if intervals or long-lived streams are still open; only `onApplicationShutdown` runs, not process termination.
**How to avoid:** Use `AbortController` per live connection; call `.abort()` in `onApplicationShutdown` so `reader.read()` throws immediately and the reconnect loop observes a shutdown flag and exits instead of retrying.
**Warning signs:** Docker/Railway/Fly health checks show the process ignoring SIGTERM and requiring SIGKILL after the grace period.

### Pitfall 6: SL=1 vs SL=12 silent 60-second delay
**What goes wrong:** Everything "works" — events arrive, state updates — but every timestamp is ~60s stale, breaking the whole "live" premise of 5-second prediction windows (Phase 4) without any visible error.
**Why it happens:** TxLINE's service-level tier gates real-time (`SL=12`) vs 60s-delayed (`SL=1`) delivery; `SL=1` fails silently [CITED: txodds-api skill, verified live 2026-07].
**How to avoid:** Assert `SERVICE_LEVEL_ID=12` at startup (config validation); runtime-check `receivedAt − Ts > 55s` and warn/alert if consistently true.
**Warning signs:** Feed transit measured at seconds-to-minutes instead of the expected ~130–140ms.

### Pitfall 7: `Seq` resets across reconnects
**What goes wrong:** Gap detection (RCVR-02: "first incoming Seq verified ≤ max(seq)+1") false-positives after every reconnect if `Seq` is assumed globally monotonic.
**Why it happens:** `Seq` is a per-`ConnectionId` monotonic counter [CITED: sse-streaming.md] — expect resets when the reporter connection changes, independent of `Last-Event-ID` resume working correctly.
**How to avoid:** Track `ConnectionId` alongside `Seq`; only treat a `Seq` discontinuity as a true gap when `ConnectionId` is unchanged, or rely on `Last-Event-ID`/historical backfill semantics rather than raw `Seq` arithmetic across a reconnect boundary.
**Warning signs:** `GameStreamGapDetected` fires on every reconnect even when the server correctly backfilled via `Last-Event-ID`.

## Code Examples

Verified patterns from official/curated sources (see individual Pattern sections above for full listings):
- Idempotent insert via `InsertQueryBuilder.orIgnore()` — Pattern 1
- Per-game `async-mutex` serialization — Pattern 2
- Two-clock discipline (feed `Ts` vs wall clock) — Pattern 3
- `AbortController`-based clean shutdown of a blocked SSE reader — Pattern 4
- Two independent fixed-interval `@Cron()` pollers — Pattern 5

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| TypeORM `.onConflict('(col) DO NOTHING')` raw-SQL string | `.orIgnore()` / `.orUpdate(cols, target)` typed methods | Deprecated in recent TypeORM releases per GitHub issue tracker [CITED: typeorm/typeorm#8124, #12090] | Use the typed methods; the raw-string `.onConflict()` form still works in 0.3.31 but is on a deprecation path — no reason to use it for new code |

**Deprecated/outdated:** none relevant to this phase's locked stack beyond the above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Reference repo's `possession.ts`/`goals.ts`/`replay.ts` internal shapes (module summaries above) are accurate — content was retrieved via an AI-summarized web fetch of raw GitHub file contents, not a byte-for-byte read | Architecture Patterns, Don't Hand-Roll | If a summarized detail (e.g. exact `ATTACK_GAP_MS` value, exact function signatures) is subtly wrong, the planner should have the executing agent read the actual ported source file directly before finalizing task-level code, rather than trusting the summary verbatim |
| A2 | `@nestjs/event-emitter` vs native `EventEmitter` recommendation is a judgment call, not a locked decision | Standard Stack (Supporting), Alternatives Considered | Low risk either way — both are valid; if Phase 4's real listener needs wildcard/async features, switching to `@nestjs/event-emitter` later is a small, isolated change |
| A3 | Recommended `stream_cursor` flush cadence N=1 (every event) | Common Pitfalls #4 | If feed volume during finals-stage matches is much higher than assumed, N=1 could add write pressure — but no measured throughput data exists yet; treat as a starting default, not a hard requirement |

## Open Questions

1. **Exact byte-for-byte contents of `upstream.ts`, `possession.ts`, `goals.ts`, `replay.ts`**
   - What we know: Function signatures, constants, and high-level logic per AI-summarized fetches of the raw GitHub files (see Assumptions Log A1).
   - What's unclear: Exact TypeScript types, error-handling edge cases, and any helper functions not surfaced by the summary.
   - Recommendation: The executing agent (plan implementation) should `Read`/fetch these four files directly and port them literally, using this research's summaries only as an orientation map — not as a substitute for reading the actual source during implementation.

2. **Whether TxLINE credentials (`JWT`, `X-Api-Token`) are already present in the project's `.env`**
   - What we know: `.env` and `.env.example` exist at `apps/gutcallfun-core/.env(.example)`; file contents could not be read in this research session (permission-denied on gitignored env files, correctly enforced).
   - What's unclear: Whether `JWT`/`API_TOKEN`/`PAST_FIXTURES_COUNT` env vars are already populated or need to be added by the planner as new required config schema entries.
   - Recommendation: Planner should add `JWT`, `API_TOKEN`, `PAST_FIXTURES_COUNT` (and `SERVICE_LEVEL_ID` startup assertion) to `app-config.schema.ts` as required/validated fields regardless, per the existing fail-fast config pattern (Phase 1).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Ingest runtime (native fetch/ReadableStream, AbortController) | ✓ | v24.10.0 | — |
| npm | Package install | ✓ | 11.6.1 | — |
| Docker | Postgres 16 via docker-compose (Phase 1 dependency, reused here) | ✓ | daemon reachable | — |
| `docker-compose.yml` | Local Postgres for dev/testing ingest against real schema | ✓ present at repo root | — | — |
| TxLINE credentials (`JWT`, `API_TOKEN`) | Live SSE ingest + fixtures/historical calls | Unknown (file present, contents not readable in this session — see Open Question 2) | — | If absent, ingest/fixtures-cron tasks cannot be end-to-end verified against the live feed; replay Source B (captured NDJSON) still allows full pipeline testing without live credentials |

**Missing dependencies with no fallback:** none identified — all core tooling (Node, npm, Docker/Postgres) is present.
**Missing dependencies with fallback:** live TxLINE credentials, if absent, fall back to Source B (captured NDJSON replay) for pipeline verification; live SSE-specific tasks (INGST-01/02) would need a `checkpoint:human-verify` to confirm credentials before relying on live-feed testing.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Partial | This phase authenticates *to* TxLINE (INGST-01: guest JWT + `X-Api-Token`, 401→refresh-then-retry) — not user-facing auth (that's Phase 3/AUTH). Credentials sourced from git-ignored `.env` per CLAUDE.md. |
| V3 Session Management | No | No user sessions issued in this phase. |
| V4 Access Control | No | No user-facing endpoints in this phase (Phase 5 scope). |
| V5 Input Validation | Yes | Every feed message is untrusted external input: defensive `JSON.parse` (catch, log raw, continue — never crash the stream on malformed payload); unknown `Action`/`StatusId` values must be stored and ignored, never throw (INGST-03 explicit requirement). |
| V6 Cryptography | No | No cryptographic operations in this phase (wallet signature verification is Phase 3/AUTH). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Malformed/hostile JSON payload from an upstream feed (even a trusted vendor's feed should be treated defensively) | Denial of Service | try/catch around every `JSON.parse`; log raw payload, continue the stream — never let one bad message kill the connection (already the reference repo's pattern per sse-streaming.md gotcha table) |
| Credential leakage via logs | Information Disclosure | Never log `JWT`/`API_TOKEN` values; log only presence/expiry countdown, matching the existing `txodds-api` skill's startup-guard pattern |
| 401 retry storm against TxLINE | Denial of Service (self-inflicted, rate-limit risk) | On 401, stop and re-auth once — never loop-retry a dead JWT (explicit CRITICAL-severity gotcha in sse-streaming.md) |
| Query-string injection via `fixtureId` in stream/historical URLs | Tampering | Validate `fixtureId` as a positive integer before interpolating into any TxLINE URL (already a documented gotcha in the reference repo's security notes) |
| Unbounded per-game `Mutex` map growth (memory) | Denial of Service (resource exhaustion) | Bound the `Map<gameId, Mutex>` lifecycle to active/live games; evict entries for `finished`/`cancelled` games so a long-running process doesn't accumulate mutexes indefinitely across a tournament's worth of fixtures |

## Sources

### Primary (HIGH confidence)
- `.claude/skills/txodds-api/references/sse-streaming.md`, `auth-and-subscription.md`, `message-reference.md`, `txline-endpoints.md` — curated, verified-against-live-feed reference (2026-07) — HIGH confidence
- `.claude/skills/txodds-api/references/txline-openapi.yaml` — vendored OpenAPI 3.1 spec, directly grepped/read for `/api/fixtures/snapshot` operation and `Fixture` schema — HIGH confidence
- `initial-request-src/initial-db-structure.sql` — authoritative schema, read directly — HIGH confidence
- Existing codebase: `apps/gutcallfun-core/src/models/game/*.entity.ts`, `src/config/*`, `src/modules/core/database.module.ts`, `src/main.ts`, `package.json` — read directly — HIGH confidence
- `npm view <pkg> version` / `peerDependencies` / `scripts.postinstall` registry queries, run 2026-07-17 — HIGH confidence
- `gsd-tools query package-legitimacy check` — HIGH confidence (combines registry + repo + download-count signals)

### Secondary (MEDIUM confidence)
- WebSearch: NestJS `@nestjs/schedule` SchedulerRegistry/`@Cron` patterns — cross-referenced against docs.nestjs.com-derived community write-ups — MEDIUM
- WebSearch: TypeORM `InsertQueryBuilder.orIgnore()`/`.orUpdate()` — cross-referenced against typeorm.io official docs + GitHub issue/PR tracker — MEDIUM
- WebSearch: `async-mutex` vs `p-queue` for per-key serial processing — cross-referenced against each package's own README/npm page — MEDIUM
- WebSearch: `@nestjs/event-emitter` `EventEmitter2`/`@OnEvent` pattern — cross-referenced against docs.nestjs.com — MEDIUM
- WebSearch: NestJS `enableShutdownHooks`/`OnApplicationShutdown` graceful-shutdown pattern — cross-referenced against docs.nestjs.com lifecycle-events doc — MEDIUM
- WebFetch (AI-summarized): `github.com/mckrava/txodds-txline-api-monitor` raw `upstream.ts`, `possession.ts`, `goals.ts`, `replay.ts`, `package.json` — MEDIUM (summarized, not byte-exact — see Assumptions Log A1)

### Tertiary (LOW confidence)
- None used as authoritative — all WebSearch findings above were cross-checked against an official-docs source before inclusion.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified live via `npm view`; both new packages (`@nestjs/schedule`, `async-mutex`) passed package-legitimacy checks with clean signals
- Architecture: HIGH — nearly all decisions are already locked in CONTEXT.md/CLAUDE.md; research confirmed the TxLINE endpoint contracts those decisions depend on (fixtures window, historical retention) directly against the vendored OpenAPI spec
- Pitfalls: HIGH for feed-behavior pitfalls (curated, live-verified skill reference); MEDIUM for the two hand-crafted "Claude's Discretion" resolutions (mutex library, event-bus mechanism) — both are low-risk, easily swappable choices, not load-bearing architectural bets

**Research date:** 2026-07-17
**Valid until:** 2026-08-16 (30 days — stable stack; TxLINE feed behavior itself is vendor-controlled and could change without notice, but no near-term change was indicated in any source)
