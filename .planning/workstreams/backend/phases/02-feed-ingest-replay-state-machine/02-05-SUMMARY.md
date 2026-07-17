---
phase: 02-feed-ingest-replay-state-machine
plan: 05
subsystem: ingest
tags: [nestjs, sse, fetch, abortcontroller, txodds, txline]

# Dependency graph
requires:
  - phase: 02-feed-ingest-replay-state-machine
    provides: "Plan 03 (EventIngestService.processEvent(gameId, raw) — the source-agnostic pipeline entry point; Plan-03 N=1 same-transaction insert+cursor-flush); Plan 04 (TxlineHttpClient — shared TxLINE auth client, exported by FixturesModule)"
provides:
  - "upstream.ts: native fetch/ReadableStream SSE client ported near-verbatim (connectWithRetry, connectUpstream, parseSseBlock, buildStreamUrl, AUTH_EXPIRED sentinel) — idle watchdog, exponential backoff+jitter, Last-Event-ID resume, receivedAt-before-decode measurement gate"
  - "StreamManagerService: start(gameId)/stop(gameId) — one AbortController per live game, guarded against duplicate concurrent connections; feeds every message into EventIngestService.processEvent(gameId, raw) with no mode flag; one-time re-auth via TxlineHttpClient on AUTH_EXPIRED; OnApplicationShutdown abort-all"
  - "Filled StreamModule: imports PipelineModule + FixturesModule + forFeature([GameEntity]), exports StreamManagerService for the Plan-07 scheduler"
  - "TxlineHttpClient.getCredentials()/refreshAuth(): public seam so a long-lived stream consumer can drive its own fetch() with the current jwt/apiToken and trigger the shared one-time guest-JWT refresh"
affects: [02-06-replay-emitter, 02-07-recovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget message dispatch from a synchronous SSE onEvent callback into an async, per-game-mutex-serialized processEvent call — correctness relies on GameMutexRegistry.runExclusive (Plan 03) queuing in call order, not on awaiting here"
    - "AbortController-per-key Map (Map<gameId, AbortController>) registered synchronously at the top of start(), before any await — makes the duplicate-connection guard race-free even when start() is called twice back-to-back without awaiting the first call"
    - "Always re-read Last-Event-ID (game.stream_cursor) and fixtureId from the DB on every (re)connect attempt inside runConnection, rather than caching them in a closure — game.stream_cursor stays the single source of truth across the one-time re-auth reconnect"
    - "onApplicationShutdown performs no DB write of its own — the INGST-04 SIGTERM cursor-flush guarantee is proven to be inherited for free from Plan 03's N=1 same-transaction design (documented inline + proven against real Postgres in this plan's spec)"

key-files:
  created:
    - apps/gutcallfun-core/src/modules/ingest/stream/upstream.ts
    - apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.ts
    - apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts
  modified:
    - apps/gutcallfun-core/src/modules/ingest/stream/stream.module.ts
    - apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.ts
    - apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts

key-decisions:
  - "upstream.ts adaptations kept to exactly two: (1) removed the reference repo's local ./constants.ts import in favor of an inlined DEFAULT_STREAM_ENDPOINT constant (matches the txodds-api skill's verified origin), (2) added ConnectWithRetryOptions.initialLastEventId so the very FIRST connect attempt of a connectWithRetry() call can seed Last-Event-ID from a persisted cursor, not only across reconnects within one call. Idle watchdog, exponential backoff, AUTH_EXPIRED sentinel, and the receivedAt-before-decode measurement gate are byte-for-byte unchanged."
  - "Comments describing why the eventsource package is avoided were reworded to never contain the literal substring 'eventsource' (case-insensitively) anywhere in upstream.ts — the plan's own acceptance criterion greps for that exact string and a rationale comment mentioning the forbidden package by name would have been a false positive."
  - "StreamManagerService always re-fetches the game row (fixtureId + stream_cursor) from the DB at the START of every connect/reconnect attempt (including the one-time AUTH_EXPIRED re-auth retry) instead of caching values from the initial start() call — keeps game.stream_cursor as the single source of truth per RESEARCH's Last-Event-ID guidance, and means a partially-advanced cursor from a session that later hit AUTH_EXPIRED is still picked up correctly on the re-auth reconnect (safe either way given the pipeline's idempotent orIgnore insert)."
  - "start(gameId)/stop(gameId) are synchronous (return void), not Promise<void> — the duplicate-connection guard (Map.set) and the background connection kickoff both happen before any await, so two back-to-back synchronous start(gameId) calls are race-free without needing the caller to await the first one. A scheduler (Plan 07) can call start() and move on to the next due game immediately."
  - "Deviation: extended TxlineHttpClient (outside this plan's declared files_modified) with getCredentials()/refreshAuth() — request()/doRequest() always awaits response.json(), which would buffer the SSE body forever; the shared client's jwt/apiToken fields were otherwise private with no reuse seam. refreshAuth() delegates to the exact same private refresh logic the 401 path already uses (single source of truth, INGST-01)."

requirements-completed: [INGST-02, INGST-01, RPLY-02]

coverage:
  - id: D1
    description: "upstream.ts (native fetch/ReadableStream SSE client) ported near-verbatim: idle watchdog, exponential backoff+jitter, Last-Event-ID resume, AUTH_EXPIRED sentinel, receivedAt-before-decode measurement gate. Compiles; no eventsource package; no hardcoded credentials."
    requirement: "INGST-02"
    verification:
      - kind: other
        ref: "cd apps/gutcallfun-core && npm run build (nest build) — passes"
        status: pass
      - kind: other
        ref: "grep -niE eventsource apps/gutcallfun-core/src/modules/ingest/stream/upstream.ts — zero matches"
        status: pass
      - kind: other
        ref: "grep -niE credential-token-pattern scan across new stream/*.ts files — zero matches"
        status: pass
    human_judgment: false
  - id: D2
    description: "start(gameId) opens exactly one AbortController-backed connection per game; a second start(gameId) call for the same game while one is active is a no-op (INGST-02 concurrency edge)."
    requirement: "INGST-02"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts#start(gameId) called twice yields exactly one active connection (INGST-02 concurrency edge)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Last-Event-ID is sourced from the persisted game.stream_cursor on connect; every received message is handed to EventIngestService.processEvent(gameId, raw) with exactly two arguments — no mode/source flag ever added (RPLY-02)."
    requirement: "RPLY-02"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts#reads Last-Event-ID from game.stream_cursor and forwards each message to EventIngestService.processEvent(gameId, raw) with no extra mode argument (RPLY-02)"
        status: pass
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts#does not crash and does not call processEvent when a data block fails JSON.parse (defensive, never crash the stream)"
        status: pass
    human_judgment: false
  - id: D4
    description: "onApplicationShutdown aborts every active per-game AbortController; stop(gameId) aborts only that game's connection, leaving others untouched (INGST-04 shutdown seam, RESEARCH Pitfall 5)."
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts#onApplicationShutdown aborts every active per-game AbortController (INGST-04 shutdown seam, RESEARCH Pitfall 5)"
        status: pass
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts#stop(gameId) aborts that game only, leaving other active connections untouched"
        status: pass
    human_judgment: false
  - id: D5
    description: "On AUTH_EXPIRED, StreamManagerService re-authenticates exactly once via TxlineHttpClient.refreshAuth() and retries the connection exactly once more; a second AUTH_EXPIRED is never retried again (INGST-01, T-02-05-02 DoS mitigation)."
    requirement: "INGST-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts#re-authenticates exactly once via TxlineHttpClient.refreshAuth() on AUTH_EXPIRED and never loops a second time (INGST-01, T-02-05-02)"
        status: pass
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts#Test 5 + Test 6 (getCredentials/refreshAuth)"
        status: pass
    human_judgment: false
  - id: D6
    description: "After driving one event through the REAL Plan-03 EventIngestService.processEvent and then invoking StreamManagerService.onApplicationShutdown(), the persisted game.stream_cursor equals (never exceeds) the max committed game_event.seq — the N=1 same-transaction design inherited from Plan 03 satisfies the SIGTERM cursor-flush invariant with no extra write in this plan's shutdown hook."
    verification:
      - kind: e2e
        ref: "apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts#leaves game.stream_cursor equal to (never ahead of) the last committed game_event seq after onApplicationShutdown aborts controllers (real Postgres, docker-compose)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A blocked reader.read() is genuinely interrupted by controller.abort() during a real network stall, not just a mocked-fetch AbortSignal propagation (RESEARCH Pitfall 5 boundary)."
    verification: []
    human_judgment: true
    rationale: "PLAN.md itself flags this must_have as `verification: backstop`. The mocked-fetch unit tests prove the AbortSignal reaches connectWithRetry and the connection promise resolves on abort — but they cannot exercise a genuinely blocked OS-level socket read against the real TxLINE origin. This is the standard Fetch/undici AbortController contract (well-established platform behavior, not custom code in this plan) and is best confirmed by an operator observing a real SIGTERM during a live connection, which requires live TxLINE credentials this worktree does not have (see D8)."
  - id: D8
    description: "Live-feed end-to-end SSE ingest against REAL TxLINE credentials (this worktree only has placeholder TXLINE_GUEST_JWT/TXLINE_API_TOKEN in its git-ignored .env)."
    verification: []
    human_judgment: true
    rationale: "PLAN.md's own <verification> section designates this best-effort/non-blocking: 'if credentials are absent, pipeline correctness is already proven via the replay Source-B path (Plan 03 e2e + Plan 06); note this in the SUMMARY as a human-check follow-up rather than blocking.' Full pipeline correctness (idempotent insert, state machine, gap detection) is already proven end-to-end via Plan 03's real-Postgres 20x replay e2e — this item is specifically about the live TxLINE origin responding correctly to our exact headers/backoff/watchdog against production infrastructure, which needs real credentials to observe."

# Metrics
duration: 35min
completed: 2026-07-17
status: complete
---

# Phase 2 Plan 05: Live SSE Ingest (StreamManagerService) Summary

**Ported `upstream.ts` (native fetch/ReadableStream SSE client — Last-Event-ID resume, 30s idle watchdog, exponential backoff, AUTH_EXPIRED sentinel) wrapped in `StreamManagerService`: one authenticated, resumable, cleanly-abortable connection per live game, feeding the identical `EventIngestService.processEvent(gameId, raw)` entry point replay uses (RPLY-02), with one-time re-auth on token expiry and AbortController-based clean shutdown (INGST-04).**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-17T21:22:00Z (approx.)
- **Completed:** 2026-07-17T21:37:45Z
- **Tasks:** 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `upstream.ts` (Task 1): near-verbatim port of the battle-tested TxLINE SSE client — `connectWithRetry` (idle watchdog, exponential backoff+jitter, Last-Event-ID resume, AUTH_EXPIRED short-circuit), `connectUpstream` (one-shot variant, kept for reference-repo fidelity), `parseSseBlock`, `buildStreamUrl`. Only two adaptations: an inlined default endpoint (dropping the reference repo's local `./constants.ts` import) and an `initialLastEventId` seam so the first connect attempt can resume from a persisted cursor.
- `StreamManagerService` (Task 2): `start(gameId)`/`stop(gameId)` with one `AbortController` per live game, duplicate-connection guard, DB-sourced Last-Event-ID + fixtureId on every (re)connect attempt, fire-and-forget message dispatch into the mutex-serialized `EventIngestService.processEvent(gameId, raw)`, one-time re-auth via `TxlineHttpClient.refreshAuth()` on AUTH_EXPIRED, and `OnApplicationShutdown` abort-all with an inline proof that no separate stream_cursor flush write is needed (Plan 03's N=1 same-transaction design already guarantees it).
- `StreamModule` filled: imports `PipelineModule` + `FixturesModule` + `TypeOrmModule.forFeature([GameEntity])`, exports `StreamManagerService` for the Plan-07 scheduler. No `@Cron` in this plan's files (D-02 one-scheduler rule preserved).
- `TxlineHttpClient` extended with `getCredentials()`/`refreshAuth()` — the minimal public seam a long-lived SSE consumer needs without duplicating the shared client's auth logic.
- `stream-manager.service.spec.ts`: 6 mocked unit tests (duplicate-connection guard, Last-Event-ID + mode-flagless processEvent forwarding, defensive JSON.parse, shutdown abort-all, one-time re-auth, per-game stop isolation) plus 1 real-Postgres integration test proving the INGST-04 SIGTERM cursor-flush invariant against the real Plan-03 persistence path.

## Task Commits

Each task was committed atomically (Task 2 followed the RED → GREEN TDD cycle):

1. **Task 1: Port upstream.ts (native SSE client) verbatim** — `1ac9dd0` (feat)
2. **Task 2: StreamManagerService — per-game connection, resume, clean shutdown** — `69c3457` (test, RED) → `7e68902` (feat, GREEN)

**Deviation commit (Rule 3, prerequisite for Task 2):** `0bbae7c` (fix) — extended `TxlineHttpClient` with `getCredentials()`/`refreshAuth()`.

**Plan metadata:** (this SUMMARY commit)

_Note: no REFACTOR commit was needed — GREEN implementation required no cleanup pass._

## Files Created/Modified
- `apps/gutcallfun-core/src/modules/ingest/stream/upstream.ts` - ported SSE client (INGST-02)
- `apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.ts` - `start`/`stop`/`onApplicationShutdown` (INGST-02/04, RPLY-02)
- `apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.spec.ts` - 7 tests (6 mocked unit + 1 real-Postgres)
- `apps/gutcallfun-core/src/modules/ingest/stream/stream.module.ts` - filled stub: imports PipelineModule/FixturesModule, exports StreamManagerService
- `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.ts` - added `getCredentials()`/`refreshAuth()`
- `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts` - 2 new tests for the additions

## Decisions Made
- Kept upstream.ts adaptations to the minimum needed for NestJS injection (endpoint constant + `initialLastEventId`) — everything else (watchdog/backoff/AUTH_EXPIRED/measurement gate) is byte-for-byte the reference implementation.
- Reworded rationale comments to avoid the literal substring "eventsource" anywhere in upstream.ts, since the plan's own acceptance grep checks for zero matches (case-insensitive) and a comment merely explaining why the package is avoided would otherwise false-positive that check.
- `start`/`stop` are synchronous (`void`), not `Promise<void>` — the duplicate-connection guard registers in the `Map` before any `await`, so back-to-back synchronous calls from a future scheduler are race-free without requiring the caller to await the first call.
- Always re-read `game.stream_cursor`/`fixtureId` from the DB at the top of every (re)connect attempt inside `runConnection`, rather than caching from the initial `start()` call — keeps the persisted cursor as the single source of truth even across the one-time AUTH_EXPIRED re-auth reconnect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended TxlineHttpClient with getCredentials()/refreshAuth()**
- **Found during:** Task 2 design (StreamManagerService needs raw jwt/apiToken values and a re-auth trigger)
- **Issue:** The plan's own key_links state "StreamManagerService injects ... TxlineHttpClient (from FixturesModule, Plan 04) — for auth", but `TxlineHttpClient`'s `jwt`/`apiToken` fields are private and its only public method (`request()`) always awaits `response.json()`, which would buffer the SSE body forever instead of exposing a `ReadableStream`. There was no existing seam to reuse the shared client for a long-lived stream connection.
- **Fix:** Added two small, non-behavior-changing public methods: `getCredentials()` (returns the current in-memory `{jwt, apiToken}`) and `refreshAuth()` (delegates to the exact same private refresh logic `doRequest()`'s 401 path already uses — single source of truth for the guest-JWT refresh call). Neither logs credential values.
- **Files modified:** `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.ts`, `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts`
- **Verification:** 2 new unit tests pass; `npm run build` compiles; full 93-test suite passes with no regressions.
- **Committed in:** `0bbae7c` (fix)

**2. [Rule 3 - Blocking] Created a local, git-ignored `.env` for this worktree**
- **Found during:** Task 2 verify step (`npx jest src/modules/ingest/stream/stream-manager.service.spec.ts`)
- **Issue:** This worktree (spawned fresh for Plan 05) has no `.env` — untracked/git-ignored files from the main checkout are not copied into a linked git worktree, the same gap Plan 03's and Plan 01's SUMMARYs documented for their own worktrees. Both the top-level `import { AppModule }` (used by this spec's real-Postgres describe block) and `npm run build` require a config-valid `.env` to exist, since `AppConfigModule`'s fail-fast `validate()` runs at module-import time.
- **Fix:** Wrote a local `apps/gutcallfun-core/.env` (confirmed git-ignored via `git check-ignore -v`) pointing `DATABASE_URL` at the already-running docker-compose Postgres (`127.0.0.1:5488`, credentials read from the tracked, non-secret `docker-compose.yml`), plus placeholder (non-real) `TXLINE_GUEST_JWT`/`TXLINE_API_TOKEN` and `SERVICE_LEVEL_ID=12`. No real TxLINE credentials were used or committed.
- **Files modified:** `apps/gutcallfun-core/.env` (git-ignored, not committed — will not appear in any commit)
- **Verification:** `npx jest src/modules/ingest/stream/stream-manager.service.spec.ts` (7/7 pass, including the real-Postgres INGST-04 test) and the full suite (`npx jest`, 93/93 pass) both succeed against the real Postgres container.
- **Committed in:** N/A (git-ignored file, never staged)

---

**Total deviations:** 2 auto-fixed (1 blocking API-extension necessary to satisfy the plan's own stated integration, 1 blocking/environment-only with no committed change)
**Impact on plan:** No production logic beyond the two additive TxlineHttpClient methods was affected. Both fixes were necessary to complete the plan as specified; neither introduces scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required

None for this plan's deliverables — `StreamManagerService`/`StreamModule` are complete and wired into the DI graph via `IngestModule` (already imported `StreamModule`, pre-existing from an earlier plan's scaffold). A real `.env` with actual TxLINE credentials (`TXLINE_GUEST_JWT`, `TXLINE_API_TOKEN`) is still required before this plan's live-feed path can be exercised against the real TxLINE origin (see coverage item D8) — unit tests here mock `connectWithRetry`/`EventIngestService` entirely, and the one real-DB test only exercises the persistence path, not the live network connection.

## Next Phase Readiness
- `StreamManagerService.start(gameId)`/`stop(gameId)` are the frozen, callable entry points Plan 07's is_replay source-switch scheduler will invoke for non-replay games (D-02) — no further ingest-side changes needed for Plan 07 to wire scheduling on top.
- `EventIngestService.processEvent(gameId, raw)` now has both of its intended callers implemented: Plan 03 proved it via replay-style direct calls; this plan proves the live SSE path calls the identical two-argument contract with no mode flag (RPLY-02 confirmed observably, not just by code review).
- `TxlineHttpClient.getCredentials()`/`refreshAuth()` are available for Plan 06 (historical replay client, Source A) to reuse if it needs raw credentials rather than JSON responses.
- Live-feed correctness against the real TxLINE origin (D8) and the genuinely-blocked-socket abort behavior (D7) remain human-check follow-ups per the plan's own verification section — not blocking, since full pipeline correctness is already proven via Plan 03's real-Postgres replay e2e.
- No blockers for Plan 06/07.

---
*Phase: 02-feed-ingest-replay-state-machine*
*Completed: 2026-07-17*

## Self-Check: PASSED

All 6 created/modified deliverable files verified present on disk; all 4 commits (`1ac9dd0`, `0bbae7c`, `69c3457`, `7e68902`) verified in `git log`.
