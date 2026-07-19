---
phase: 02-feed-ingest-replay-state-machine
plan: 04
subsystem: ingest
tags: [nestjs, typeorm, cron, txodds, txline, fetch]

# Dependency graph
requires:
  - phase: 02-feed-ingest-replay-state-machine (plan 01)
    provides: IngestModule scaffold, IngestSharedModule (@Global), fail-fast config schema with TXLINE_GUEST_JWT/TXLINE_API_TOKEN/PAST_FIXTURES_COUNT/SERVICE_LEVEL_ID
provides:
  - TxlineHttpClient (INGST-01) — shared authenticated fetch wrapper (Bearer JWT + X-Api-Token, 401 refresh-once/retry-once, positive-integer id guard)
  - TxlineFixturesClient — snapshot()/fetchUpcoming()/fetchPast() over GET /api/fixtures/snapshot, forward-only-endpoint workaround for past fixtures (D-09)
  - FixturesCronService (GAME-01) — @Cron(EVERY_MINUTE) upsert-by-fixture_id discovery, no competition filter, no live cap
  - Filled FixturesModule exporting TxlineHttpClient for reuse by Plans 05 (SSE) and 06 (historical replay)
affects: [02-05-stream-ingest, 02-06-replay-emitter, 02-07-recovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared authenticated TxLINE HTTP client (Bearer + X-Api-Token, 401 refresh-once/retry-once) reused across all TxLINE-calling plans"
    - "Forward-only snapshot endpoint worked around by anchoring startEpochDay in the past (todayEpochDay() - count)"
    - "Upsert-by-natural-key: status set only on INSERT, never overwritten on UPDATE, so a background cron never clobbers live/finished transitions owned by other services"

key-files:
  created:
    - apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.ts
    - apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts
    - apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.ts
    - apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.spec.ts
    - apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures-cron.service.ts
    - apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures-cron.service.spec.ts
  modified:
    - apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures.module.ts

key-decisions:
  - "fixtures-cron only sets game.status on INSERT, never on UPDATE — D-11 ('postponements arrive as updated starts_at') doesn't mention status, and overwriting status every minute would clobber live/finished transitions owned by the stream/replay-arm cron services built in later plans"
  - "DiscoveredFixture wraps the raw wire TxlineFixture with the intended GameStatus (SCHEDULED for fetchUpcoming, FINISHED for fetchPast) so FixturesCronService only upserts, never classifies"
  - "todayEpochDay() computed as Math.floor(Date.now() / 86_400_000) — matches txline-openapi.yaml's startEpochDay contract (a whole day number, not a date string)"

requirements-completed: [GAME-01, INGST-01]

coverage:
  - id: D1
    description: "TxlineHttpClient attaches Authorization: Bearer <jwt> and X-Api-Token: <token> on every request, sourced from validated ConfigService"
    requirement: "INGST-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts#Test 1: attaches Authorization Bearer and X-Api-Token headers on every request"
        status: pass
    human_judgment: false
  - id: D2
    description: "A 401 triggers exactly one guest-JWT refresh (POST /auth/guest/start) + one retry; a repeated 401 surfaces TxlineAuthExpiredError without a third attempt (no retry storm)"
    requirement: "INGST-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts#Test 2 + Test 3"
        status: pass
    human_judgment: false
  - id: D3
    description: "fixtureId (and any id interpolated into a TxLINE URL) is validated as a positive integer before interpolation, throwing before any network call"
    requirement: "INGST-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts#Test 4: buildFixtureUrl rejects 0/negative/non-integer fixtureId before any fetch call"
        status: pass
    human_judgment: false
  - id: D4
    description: "TxLINE credentials are never logged — only presence/outcome, never JWT/token values"
    verification:
      - kind: other
        ref: "grep -rniE \"guest_jwt|api_token|Bearer \" on txline-http.client.ts / txline-fixtures.client.ts / fixtures-cron.service.ts / fixtures.module.ts — no logger/console call emits a credential value"
        status: pass
    human_judgment: false
  - id: D5
    description: "fetchPast(N) anchors startEpochDay in the past to defeat the forward-only snapshot endpoint, returns the last N fixtures by StartTime desc, marked finished"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.spec.ts#Test 1 + Test 2"
        status: pass
    human_judgment: false
  - id: D6
    description: "fetchUpcoming(7) returns fixtures within the 7-day-ahead window, marked scheduled"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.spec.ts#Test 3"
        status: pass
    human_judgment: false
  - id: D7
    description: "No competition filter — every fixture TxLINE returns is kept"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.spec.ts#Test 4 + fixtures-cron.service.spec.ts#Test 2"
        status: pass
    human_judgment: false
  - id: D8
    description: "@Cron(EVERY_MINUTE) discoverFixtures upserts by fixture_id: an existing fixture updates in place, a new one inserts; an empty response completes with zero rows created and no crash"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures-cron.service.spec.ts#Test 1 + Test 3 + Test 4"
        status: pass
    human_judgment: false
  - id: D9
    description: "starts_at is stored as timestamptz from the fixture StartTime without timezone drift or truncation"
    verification: []
    human_judgment: true
    rationale: "PLAN.md flags this as verification: backstop — StartTime (epoch ms) is passed directly into `new Date(...)` against a `timestamptz` column with no intermediate string formatting, so no drift/truncation is introduced in code, but confirming zero drift end-to-end requires a live DB round-trip this plan's mocked-repository unit tests don't exercise."
  - id: D10
    description: "npm run build compiles cleanly and FixturesModule exports TxlineHttpClient for Plans 05/06 to reuse"
    verification:
      - kind: other
        ref: "cd apps/gutcallfun-core && npm run build (nest build) — passes; fixtures.module.ts exports: [TxlineHttpClient]"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-07-17
status: complete
---

# Phase 2 Plan 04: Fixtures Discovery + Shared TxLINE Auth Client Summary

**TxlineHttpClient (INGST-01, shared Bearer/X-Api-Token/401-refresh-once client) and a 1-minute fixtures discovery cron (GAME-01) that pulls both a 7-day upcoming window and the last N past fixtures — via a past `startEpochDay` anchor that defeats the forward-only snapshot endpoint — upserting real team names/metadata into `game` rows.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-07-17T21:00:00Z (approx.)
- **Completed:** 2026-07-17T21:30:00Z (approx.)
- **Tasks:** 2
- **Files modified:** 7 (1 modified, 6 created)

## Accomplishments
- Implemented `TxlineHttpClient` — the single authenticated TxLINE fetch wrapper this phase's remaining plans (SSE client, historical client) will reuse — with Bearer JWT + X-Api-Token headers on every call, a safe 401 refresh-once/retry-once flow (never a retry storm against a dead JWT), and a positive-integer guard on any id interpolated into a TxLINE URL
- Implemented `TxlineFixturesClient` with `snapshot()`, `fetchUpcoming(7)`, and `fetchPast(count)` — the latter deliberately anchors `startEpochDay` in the past so the endpoint's forward-only 30-day window still surfaces already-started/finished fixtures (RESEARCH Pitfall 1 / D-09), then filters/sorts/takes the last N client-side
- Implemented `FixturesCronService.discoverFixtures()` (`@Cron(EVERY_MINUTE)`), pulling both windows in parallel, upserting by `fixture_id` with no competition filter (D-10) and no live cap (D-12); each fetch is individually error-isolated so a TxLINE outage on one window never blocks the other or crashes the tick
- Filled `FixturesModule`: `TypeOrmModule.forFeature([GameEntity])` + `IngestSharedModule`, providing all three new services and exporting `TxlineHttpClient`

## Task Commits

Each task followed the RED → GREEN TDD cycle with separate commits:

1. **Task 1: Shared TxLINE HTTP/auth client** — `7a02fb9` (test, RED) → `c520096` (feat, GREEN)
2. **Task 2: Fixtures snapshot client + 1-minute discovery cron** — `9f88e62` (test, RED) → `7203db1` (feat, GREEN)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.ts` - shared authenticated TxLINE client (INGST-01)
- `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.spec.ts` - 4 tests: headers, 401 refresh-once/retry-once, retry-storm guard, fixtureId guard
- `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.ts` - `snapshot()`/`fetchUpcoming()`/`fetchPast()` over GET /api/fixtures/snapshot
- `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.spec.ts` - 5 tests: past-anchor request, last-N-desc, upcoming-window, no-filter, empty-safe
- `apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures-cron.service.ts` - `@Cron(EVERY_MINUTE)` upsert-by-fixture_id discovery (GAME-01)
- `apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures-cron.service.spec.ts` - 4 tests: update-vs-insert upsert, no-filter, empty-safe, configured PAST_FIXTURES_COUNT
- `apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures.module.ts` - filled stub: forFeature([GameEntity]) + IngestSharedModule, exports TxlineHttpClient

## Decisions Made
- `FixturesCronService` sets `game.status` only on INSERT, never on UPDATE. PLAN.md's `<action>` text described marking past fixtures `finished` and upcoming `scheduled` on every upsert, but D-11 explicitly scopes existing-row updates to `starts_at` ("postponements arrive as updated starts_at") without mentioning status — and this phase's later plans (stream ingest, replay-arm cron) will independently transition `game.status` to `live`/`finished` as matches actually play. A naive "always set status from the fetched window" would let this 1-minute cron silently revert a `live` game back to `scheduled` on its very next tick. Deferring status-on-update entirely to those later plans avoids that class of bug without needing any cross-service coordination in this plan. Classified as a Rule 1 (bug prevention) deviation — see below.
- `DiscoveredFixture` (a `TxlineFixture` plus the intended `GameStatus`) is computed inside `TxlineFixturesClient.fetchUpcoming`/`fetchPast` rather than inside the cron, so `FixturesCronService` only has to upsert, never classify which window a fixture came from.
- `todayEpochDay()` is a small exported helper (`Math.floor(Date.now() / 86_400_000)`) rather than inlined math, so both the client and its spec compute the anchor identically without duplicating the constant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `game.status` set only on INSERT, never overwritten on UPDATE in the fixtures cron**
- **Found during:** Task 2 (`FixturesCronService.discoverFixtures`)
- **Issue:** PLAN.md's task `<action>` describes the cron marking "past fixtures status='finished' and upcoming as scheduled" without qualifying insert-vs-update. Implemented literally, every 1-minute tick would re-assign `scheduled`/`finished` to every upserted row — including rows whose status had since been advanced to `live` by the stream-ingest/replay-arm cron services this phase's later plans add. That would silently revert a currently-live game back to `scheduled` on the very next fixtures-cron tick, breaking the live pipeline this phase exists to build.
- **Fix:** Set `status` only in the INSERT branch (`gameRepo.create({..., status: fixture.status})`); the UPDATE branch touches `starts_at`/names/metadata only, matching D-11's "postponements arrive as updated starts_at" scope exactly.
- **Files modified:** `apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures-cron.service.ts`
- **Verification:** `fixtures-cron.service.spec.ts` Test 1 asserts an existing row is `save`d without its status being forced back; `npm run build` + full `npx jest` suite pass.
- **Committed in:** `7203db1` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug-prevention)
**Impact on plan:** Necessary correctness fix — without it, this plan would introduce a latent bug that only manifests once Plans 05/06/07 (stream ingest, replay, recovery) are running concurrently with this cron. No scope creep: the fix only removes an unconditional overwrite, it adds no new behavior.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required

None for this plan's deliverables — `TXLINE_GUEST_JWT`/`TXLINE_API_TOKEN`/`PAST_FIXTURES_COUNT` config fields already exist from Plan 01. A real `.env` with actual TxLINE credentials is still required before this cron can be exercised against the live feed (unit tests here mock `TxlineHttpClient`/the repository entirely, so no live credentials were needed for verification).

## Next Phase Readiness
- `TxlineHttpClient` is exported from `FixturesModule` and ready for Plan 05 (SSE stream client) and Plan 06 (historical replay client) to inject without re-implementing auth.
- `FixturesCronService` is wired into the DI graph via `FixturesModule` → `IngestModule` → `AppModule`; no further wiring needed for GAME-01 to run once a live `.env` with real TxLINE credentials is present.
- No blockers for the next plan in this phase.

---
*Phase: 02-feed-ingest-replay-state-machine*
*Completed: 2026-07-17*

## Self-Check: PASSED

All 7 created/modified deliverable files verified present on disk; all 4 commits (`7a02fb9`, `c520096`, `9f88e62`, `7203db1`) verified in git log.
