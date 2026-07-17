# Phase 2: Feed Ingest, Replay & State Machine - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

A source-agnostic pipeline turns live or replayed TxLINE events into a trusted append-only `game_event` log and an accurate in-memory per-game state machine, recoverable across restarts. Includes: fixtures cron (GAME-01), SSE client (ported `upstream.ts`), replay emitter, idempotent event persistence, per-game state machines (ported `possession.ts`/`goals.ts`), and restart recovery. Excludes: prediction windows/resolution (Phase 4), REST/WS surface (Phase 5), wallet auth (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Replay source & emitter (consolidated design ADOPTED — see Specifics)
- **D-01:** Two-source model. Source A (primary): historical fetch at runtime from `/api/scores/historical/{fixtureId}` (serves fixtures ≥6h–2w old, full log in one fetch), cached **in-memory only** per process. Source B (fallback): captured NDJSON files / own `game_event` rows fed through the same source-agnostic emitter (ordered raw-event array in). Source B is also the RCVR-01 boot-recovery path — build once, use twice.
- **D-02:** `is_replay` switches ONLY the source. One scheduler rule for all games: `starts_at <= now() AND status='scheduled'` → start the game's source (SSE for live, emitter for replay). Everything downstream (normalizer, persistence, state machine, later phases) is replay-unaware. No mode flags leak past the source boundary. **HARD CONSTRAINT (user-stated): a running replay must never affect live-game ingest — live + replay games coexist in one process with per-game isolation.**
- **D-03:** Timestamp rebasing: `delta = now() − firstEvent.Ts` added to every event's Ts. Live path is a passthrough (delta never touches naturally-started games). `expires_at`/answer-TTL semantics stay on server wall clock even in replay — correct because rebasing + 1× pacing aligns event time with wall time.
- **D-04:** Pacing: original inter-event gaps ÷ speed. Default speed=1 (script arg override). **speed>1 is a headless-testing configuration only, never user-facing** (a 5s window spans 100s of match time at 20×). Pre-match segment plays at **full original pacing** (no compression, no skip).
- **D-05:** No dependency on TxLINE VirtualFixture (absent from OpenAPI, unverified) and no dependency on TxLINE uptime on recording night (Source B covers).

### Replay arming & demo control surface
- **D-06:** Replay creation is a dev/admin action, NOT the fixtures cron. Primary tooling: tsx script `npm run replay:create -- <fixtureId> [--speed N]`. Additionally (user's chosen demo surface): **manual DB flip must work** — scheduler polls (~15s) for `is_replay=true AND status='scheduled' AND starts_at<=now()`; a single UPDATE (`is_replay=true, status='scheduled', starts_at=now()+~3min`) arms a replay on an existing past-game row.
- **D-07:** Auto-wipe on replay start: the starter wipes that game's prior `game_event` rows and resets denormalized score/state before emitting, so re-flipping the same row for take #2 never collides with `UNIQUE(game_id, seq)`. Replay rows are disposable by definition; append-only discipline applies to live games.
- **D-08:** `starts_at = now() + ~3 min` choreography: fixture list renders the replay as genuinely upcoming, giving time to record the browse/join segment before the scheduler fires.

### Fixtures discovery
- **D-09:** Reality note: the feed currently has NO live or upcoming fixtures. Discovery must ALSO pull past games: last N fixtures (env `PAST_FIXTURES_COUNT`, default 20) into `game` rows (status finished, real team names/metadata, never ingested) as browsable replay source material.
- **D-10:** No competition filter — take every soccer fixture TxLINE returns (feed is sparse; everything is potential demo material).
- **D-11:** Upcoming window: 7 days ahead. Upsert-only by `fixture_id` (GAME-01 create/update); vanished fixtures left as-is (no delete/reconcile logic); postponements arrive as updated `starts_at`.
- **D-12:** When live fixtures reappear: ingest ALL discovered live games — no allowlist, no cap.

### Seq-gap consequence seam (Phase 4 boundary)
- **D-13:** Ingest emits a typed in-process event on gap detection — `GameStreamGapDetected {gameId, expectedSeq, actualSeq, at}`. Phase 2 ships a log-only listener; Phase 4 replaces the listener body with real void+refund + goal adjudication. Same seam is reused for restart-hole detection (RCVR-02). Contract fixed now, zero ingest rework later.

### Claude's Discretion
- Event-bus mechanism for D-13 (plain typed emitter vs Nest event emitter) — planner/researcher choose the lightest thing consistent with the locked stack.
- `stream_cursor` flush cadence "every N events" (INGST-04) — pick N during planning.
- Scheduler poll interval exact value (~15s guidance).
- State-machine debug logging verbosity.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### TxLINE API & feed behavior
- `.claude/skills/txodds-api/SKILL.md` — Full Scores Product API v1.0 reference: auth chain (guest JWT → on-chain subscribe → API token), SSE stream, historical fixtures, message schema (goal, possession ladder, cards, VAR, status, lineups), verified live-feed behavior. Resolves the open TxODDS auth-endpoint gap noted in STATE.md.
- `github.com/mckrava/txodds-txline-api-monitor` (external repo) — Port source for `upstream.ts` (SSE client), `possession.ts`, `goals.ts` (state machine), `replay.ts` (emitter). CLAUDE.md LOCKS porting these as-is: native fetch/ReadableStream parser, AUTH_EXPIRED sentinel, receivedAt-before-decode ordering.

### Schema & stack
- `initial-request-src/initial-db-structure.sql` — Authoritative schema (gitignored, on disk at main checkout). `game.is_replay` + partial unique index `game(fixture_id) WHERE NOT is_replay` = one live game per fixture, unlimited replay rows.
- `.claude/CLAUDE.md` — LOCKED stack pins (typeorm 0.3.31, @nestjs/schedule for cron, no eventsource lib), security rules (never commit TxODDS tokens), game-economy locks.

### Phase context
- `.planning/workstreams/backend/ROADMAP.md` §Phase 2 — Goal + 5 success criteria (the verification contract).
- `.planning/workstreams/backend/REQUIREMENTS.md` — GAME-01, INGST-01..05, RPLY-01..03, STAT-01..03, RCVR-01..02 full texts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/gutcallfun-core/src/config/` — `@Global()` fail-fast AppConfig module (Phase 1); new env vars (TxLINE JWT/API token, PAST_FIXTURES_COUNT) extend `app-config.schema.ts`.
- `apps/gutcallfun-core/src/db/data-source.ts` + `src/modules/core/database.module.ts` — shared DataSource; repositories for `game`/`game_event` come from `TypeOrmModule.forFeature`.
- `apps/gutcallfun-core/src/models/game/*` — 12 entities describing the authoritative schema; `game_event` has promoted columns + raw jsonb payload; `game` has `is_replay`, `stream_cursor` support fields per schema.

### Established Patterns
- Entities describe, never generate, schema (`synchronize:false`, empty-diff gate) — any new columns require a raw-SQL migration transcribed from the authoritative SQL (none expected this phase).
- Config-then-database module import order in `app.module.ts`; `enableShutdownHooks()` already wired — SIGTERM path exists for INGST-04 cursor flush.
- Known review debt (01-REVIEW.md, advisory): floating `bootstrap()` promise, config duplication, phantom `dotenv` dep — don't compound these patterns in new code.

### Integration Points
- New ingest module registers alongside `DatabaseModule` in `app.module.ts`; `@nestjs/schedule` cron (locked choice) for the 1-min fixtures poll and the ~15s replay-arm scheduler.
- SSE ingest must run in exactly one long-lived process (deployment shape is single-process — no adapter/locking needed).

</code_context>

<specifics>
## Specific Ideas

- User supplied a consolidated replay-mode design (from a prior session) — adopted in full in D-01..D-08. Key demo choreography: create/arm replay → record fixture list showing upcoming match → join → scheduler fires at `starts_at` → match goes live → record. Pick source material deliberately: the user's 19 captured matches include one with three disallowed goals and one shootout; **ideal 5-min demo reel = a match with a confirmed goal + a VAR overturn in the first half**.
- Demo video is judged primarily and recorded July 18 — mockups are auto-DQ; what's on screen must be the production pipeline processing real match data. Answers/points/leaderboard during replay are real rows.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Android recording for Vibration API haptics remains a NICE-list item tracked in STATE.md deferred table, not a Phase 2 concern.)

</deferred>

---

*Phase: 02-feed-ingest-replay-state-machine*
*Context gathered: 2026-07-17*
