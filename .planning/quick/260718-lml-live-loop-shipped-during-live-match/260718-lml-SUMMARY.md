---
phase: quick-260718-lml
plan: 260718-lml
subsystem: live, ingest, api, realtime
tags: [nestjs, typeorm, socket.io, txline, live-loop, questions, resolution, points]

# Dependency graph
requires:
  - phase: 02-feed-ingest-replay-state-machine
    provides: EventIngestService (INGST-03/04/05), GameStateMachine/possession.ts/goals.ts (STAT-01), SourceSchedulerService (scheduled->live), StreamManagerService (INGST-02), GameStreamGapEmitter (D-13 seam)
  - phase: 02.1-placeholder-api-surface-fake-realtime-contract
    provides: frozen REST DTOs + WS wire contract (D-05), RealtimeGateway, room naming, game_question_outcome ladder seed
provides:
  - src/modules/live/ — real prediction loop (window open -> WS push -> high-water resolution -> points -> WS push)
  - Real TypeORM persistence behind users/games/join/answers/questions (replacing 02.1 fixtures)
  - GameFinalisationService — game_finalised -> status='finished' + stream release (RESL-05, online path)
  - OrphanedWindowSweeper — boot-time void of windows orphaned by restart (RESL-04, restart arm only)
affects: [phase-04-live-windows-resolution, phase-05-real-state-machine-wiring, demo-replay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Typed native node:events emitter wrappers (LiveFeedEmitter / LiveBroadcastEmitter) as cross-module seams — mirrors GameStreamGapEmitter, zero new pub/sub dependency"
    - "Post-commit hook out of EventIngestService: live logic never participates in the ingest transaction and can never stall it"
    - "Per-window high-water rung DERIVED on demand rather than stored as a running max, so a discard genuinely lowers it"
    - "SchedulerRegistry + .unref() + OnModuleDestroy for every window timer (open-handles discipline)"

key-files:
  created:
    - apps/gutcallfun-core/src/modules/live/ (live-engine, question-window, question-resolution, live-window.registry, live-state, live-payload.mapper, live.constants, events/)
    - apps/gutcallfun-core/src/modules/live/orphaned-window.sweeper.ts
    - apps/gutcallfun-core/src/modules/ingest/persistence/game-finalisation.service.ts
  modified:
    - apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.ts (post-commit hook + returns inserted event id)
    - apps/gutcallfun-core/src/modules/realtime/realtime.gateway.ts (fake cycle -> real emissions)
    - apps/gutcallfun-core/src/modules/api/{users,games,answers}/ (fixtures -> TypeORM)
  deleted:
    - apps/gutcallfun-core/src/modules/realtime/fake-cycle.service.ts (+ spec)
    - apps/gutcallfun-core/src/modules/api/{users,games,answers}/*.service.spec.ts (mock-era contract)
---

# Live loop shipped during a live match, outside GSD

**Date:** 2026-07-18 evening → 2026-07-19 early morning
**Trigger:** ~1 hour before the 21:00 UTC kickoff of game id=20 (France 3–4 England, `fixture_id` 18257865), the user asked for the minimum end-to-end path needed to test the backend against a real match.
**GSD bypass:** explicitly authorized by the user, with the condition that everything be recorded so GSD can reconcile later. **This document is that record.**

There is still no `phases/04-*` directory. When Phase 4 is planned, it must be written as **reconciliation of already-shipped code**, not greenfield.

> Decision ids are PHASE-SCOPED, not global. Phase 02 has D-01…D-13; Phase 02.1 has a separate D-01…D-07. Cite as "02/D-13" or "02.1/D-05".

## Commits (chronological, all on `develop`)

| Commit | What |
|---|---|
| `087df08` | live prediction engine — attack-triggered windows, high-water resolution |
| `0ae1df2` | post-commit live-loop hook from EventIngestService |
| `9bb28b3` | wire LiveModule + optional fallback-timer env var |
| `921804d` | `POST /users` real TypeORM persistence |
| `7253284` | games list/detail, join, questions — real TypeORM reads |
| `0a2994a` | `POST /answers` real persistence + validation |
| `9da8b98` | replace fake WS cycle with real live-loop emissions |
| `59efb26` | defer resolution on unconfirmed goal so the 100-point rung can fire |
| `9786119` | docs: first deviation record |
| `fbffd81` | tune: inter-window cooldown 20s → 10s |
| `48a7b83` | fix: void windows orphaned by restart (RESL-04, restart arm) |
| `5858ce8` | fix: open windows only on ascending edges into `attack_possession` |
| `268a0cd` | fix: treat set-piece restarts as returning the ladder to `safe` |
| `e8d8db8` | feat: finalise game on `game_finalised`, release SSE source (RESL-05) |
| `4041b63` | fix(test): real `InsertResult` shape in query-builder mock |
| `871ed45` | fix(test): leaderboard spec + WS e2e vs DB-backed/authed gateway |

Also merged in this window (**not ours** — from the UI developer): PR #1 `solana-auth`, PR #2 `connect-ui-api`. See "Merged PRs" below.

## What now works end to end

Real TxLINE SSE → `game_event` persisted → state machine → **window opens on an attack** → WS `question` push → user answers via REST → **high-water resolution** → points written to `user_game_answer` → WS `resolution` push. Auto-start (`scheduled`→`live`) and auto-finalise (`game_finalised`→`finished`) both work unattended.

Proven against a real match, not a replay.

## Live-match empirical results (game 20, 880 events, 69 windows, 68 resolved)

Final outcome distribution:

| Outcome | Count | Share | base_gain |
|---|---|---|---|
| `fizzles` | 39 | 57.4% | 5 |
| `danger` | 18 | 26.5% | 7 |
| `shot` | 8 | 11.8% | 15 |
| `goal` | 3 | 4.4% | 100 |

**The goal rung fired 3×** — only because of the deferral fix. Measured confirm lag on the first goal was **79s** against a 12s window, almost exactly the ~76s median the research predicted. Without deferral all three would have paid `shot` (15).

**Trigger tuning was measurably effective:** `fizzles` share was **73%** (16/22) in the first half and **57.4%** final, after the ascending-edge + set-piece-reset changes.

Feed shape observed (useful for Phase 4 planning):
- 64 `attack_possession` events but only **28 attack edges** — repeats within a run are the majority.
- `safe → high_danger` (skipping attack) occurred **2×**; `safe → danger` never.
- **9 descending edges** (`high_danger→attack` 6, `danger→attack` 3) — these opened fizzle-bound windows before the fix.
- 8 attacks immediately followed a set piece; only 3 opened a window before the fix.
- `StatusId` stayed 2 then 4 throughout play; the `{2,4,7,9}` gate never mis-fired.

## Deviations from LOCKED decisions — ALL need reconciliation

| # | Locked rule | Shipped instead | Why |
|---|---|---|---|
| 1 | **WNDW-03** close rule: soft terminals stamp `pendingCloseAt`, attacking-team pressure within 12s cancels, expiry ≥12s past stamp finalizes at stamp time | Flat 12s timer from window open, resolving to accumulated high-water rung | Not buildable in the time available. High-water accumulation itself IS faithful. |
| 2 | **WNDW-01** trigger: "window opens when possession first enters `attack_possession`" | **Narrowed twice.** (a) ascending edges only — prior stage must be `safe` or null; (b) set-piece restarts (`free_kick`/`corner`/`throw_in`/`goal_kick`/`kickoff`) reset the tracked stage to `safe` | Descending edges opened fizzle-bound windows on fading attacks. Set pieces froze the stage at the `high_danger` that earned the free kick, suppressing genuinely new attacks. Both changes are data-driven (see above) but neither is in any decision record. |
| 3 | **RESL-02** goal flow: `open → pending_confirmation`, confirm resolves, ~5-min timeout adjudicates from `Score` of latest events | Deferred resolution: unconfirmed+undiscarded goal in-window re-arms a ~5s poll up to a **90s hard cap**; confirm → `goal`/100, discard → highest non-goal rung, cap → highest non-goal rung + WARN. The DB `pending_confirmation` state IS used. | Needed or the 100-point rung never fires. Partial step *toward* RESL-02. **No 5-min `Score`-field adjudication** — a goal confirming later than 90s is missed and pays the non-goal rung. |
| 4 | **RESL-01** `awarded_points = round(base_gain × reward_multiplier)` with adjacency partial credit via `ladder_position` \|Δ\|=1 | Multiplier flat 1 (correct) / 0 (wrong). **No adjacency partial credit.** | Exact partial-credit value was never decided — brief says "e.g. 0.5", illustrative only. Deliberately not invented. |
| 5 | **RESL-04** void policy: refund for window open/pending across seq gap, reconnect, `suspend`/`disconnected`, **or server restart with unrecovered hole** | **Only the restart arm implemented** (`OrphanedWindowSweeper`). Seq-gap, reconnect and suspend arms absent. | Time. The 02/D-13 `GameStreamGapDetected` seam and its log-only listener are untouched and still the right home for the rest. |
| 6 | **RESL-05** `game_finalised` freezes the game: status → finished, no new windows | Status + stream release implemented. **Window-freezing deliberately NOT implemented** — once the stream is released no further events arrive, so `maybeOpen` cannot be called; only `disconnected`/`comment` can still land and neither opens a window. | Guarding an unreachable path. Documented rather than coded. |
| 7 | 02.1/D-05 frozen wire contract | Honored exactly. `is_mock` flipped to `false`; all event names, room naming and field names unchanged. | — |

## Values chosen by feel — NO decision backs these

- **`OPEN_COOLDOWN_MS = 10_000`** (started 20s, tuned live). The brief explicitly calls an inter-window cooldown "a one-line config knob — decide by feel" and fixes no number. **Do not conflate with WNDW-03's 12s debounce**, which is a window-CLOSE rule measured in event `Ts` deltas; this is wall-clock and governs window OPENS.
- **`RESOLVE_AFTER_MS = 12_000`** — the flat window length standing in for WNDW-03.
- **`GOAL_CONFIRM_GRACE_MS = 90_000`** / **`GOAL_CONFIRM_POLL_MS = 5_000`**.
- **`current_status_id = 100`** written explicitly on finalisation. **This resolves the open sub-decision in `game-finalised-current-status-id.md` (its option B, terminal sentinel).** Chosen because `game_finalised` carries `StatusId: null` in 2 of 20 recorded matches, so copying the event's own value would leave those stale. That todo can be closed once ratified.

New optional env var **`LIVE_QUESTION_FALLBACK_TIMER_MS`** (unset = off) opens a window if none has opened for a live game in that many ms. Deliberately optional so it cannot become a second required-boot trap. Not in `.env.example`.

## Bugs found and fixed during the session

1. **First attack of a match suppressed** — fallback-timer baseline shared a map with the cooldown, so first contact looked like a recent open. Split into `firstSeenAt` / `lastOpenedAt`.
2. **Discarded goal still paid 100** — resolution fired immediately on a confirmed goal, closing the window before the discard could land. Removed; the timer is now the single resolution path.
3. **Stale-stage suppression after set pieces** — see deviation 2b. Found by the user watching the live UI, not by any test.
4. **Orphaned windows blocked the entire loop** — a window open when the process dies stays `state='open'` forever, and `uq_gq_one_open_per_game` (partial unique index) then prevents every subsequent window for that game. Observed live: **11 minutes, healthy feed (383 events, 2s fresh), zero new questions.** The `GOAL_CONFIRM_GRACE_MS` cap cannot help — same in-process timer, dies too. Fixed by `OrphanedWindowSweeper`.
5. **Nothing ever set `status='finished'`** — `fixtures-cron` sets status only on INSERT (excludes it from updates to avoid clobbering concurrent writers); `source-scheduler` only does `scheduled→live`. Game 20 sat `live` for ~7h after full time, and `GameStateRebuildService` re-opened a real TxLINE stream for it on **every boot**. Fixed by `GameFinalisationService`.

### Verified feed facts (from `initial-request-src/txodds-api-snapshots`, 20 recorded matches)

- `game_finalised` occurs **exactly once per fixture**.
- It carries `StatusId: 100` in **18 of 20** cases and **`null` in 2**. → **Match on `Action`, NEVER on `StatusId === 100`** or ~10% of matches are silently missed.
- The feed's `GameState` field still reads `"scheduled"` on the finalisation record — unusable.
- Only `disconnected` (15×) and `comment` (1×) ever follow it, max 2 trailing records → safe to treat as terminal.

## Test coverage state

**Green:** 27/27 unit suites, 200/200 tests (post-merge, verified).

**Regressions accepted:**
- `users`/`games`/`answers` `.service.spec.ts` were **deleted**, not replaced — they asserted the mock-era contract (`new GamesService()` with no args, "nothing persisted (D-05)") and could not compile against repository injection. **The five now-real endpoints have zero unit coverage.**
- **`src/modules/live/` has no unit tests at all.** The entire question/resolution engine is verified only by scratch e2e scripts that were not committed.
- `leaderboard.service.spec.ts` was rewritten (`871ed45`) to test app-layer behaviour (rank arithmetic, bigint→number coercion, pagination) rather than DB ordering.
- `realtime.e2e-spec.ts` lost its heartbeat test (obsolete: fake cycle deleted, asserted `is_mock: true`) and gained a **ticketless-connection-rejected** test — closing the negative-path gap `ws-handshake-origin-not-enforced.md` named.

**BROKEN — full e2e suite does not pass.** Crashes at `StreamManagerService.onApplicationShutdown` (`stream-manager.service.ts:100`), surfacing as `QueryFailedError: Connection terminated`. **Pre-existing on `develop` before any merge** — see `stream-abort-unhandled-rejection-and-e2e-open-handles.md`. Until fixed, e2e cannot tell you whether ingest works.

## Merged PRs (UI developer — not our work)

PR #1 `solana-auth`, PR #2 `connect-ui-api`. Reviewed before merge; merge was conflict-free and did not revert any live-loop work. Material effects on backend development:

- **Global auth.** `{ provide: APP_GUARD, useClass: JwtAuthGuard }` — every route needs a Bearer token unless `@Public()`. Reads are public; **all writes are not**.
- **`JWT_ACCESS_SECRET` is required to boot** (min 32 chars, no default, `.env` gitignored). Generate with `openssl rand -base64 48`.
- **WS handshake requires a single-use ticket** (`handshake.auth.ticket`), minted by `POST /auth/ws-ticket`. This **closes `ws-handshake-origin-not-enforced.md`** — that todo can be resolved.
- **`POST /users` no longer exists** — replaced by `POST /auth/register` + SIWS challenge/verify.
- **`user_id` removed from `POST /answers` and `POST /games/:id/join`** bodies (comes from session). With `forbidNonWhitelisted`, still sending it → **400**.
- 7 new deps (`@nestjs/jwt`, `@nestjs/passport`, `@nestjs/throttler`, `bs58`, `passport`, `passport-jwt`, `tweetnacl`) — `npm install` required.
- Migration `AddAvatarEmoji` — additive `user.emoji` / `squad.emoji`, `IF NOT EXISTS`, reversible.
- **`/dev/live/:gameId/{snapshot,question,resolve,goal,play}`** simulator, fail-closed behind `ENABLE_DEV_SIM === 'true'`. ⚠️ It emits wire events **directly** via `emitToGame` — it fakes the OUTPUT and never exercises ingest, trigger rules, accumulation or resolution. **Useless for backend verification; use replay for that.**
- **`dotenv` is imported by `main.ts` but undeclared** — resolves only transitively via `@nestjs/config`. Should be a direct dependency.
- In-memory nonce/refresh/ws-ticket stores → every restart logs out every user.

## Known-broken / open items

1. **e2e suite crash** (`stream-manager.service.ts:100`) — highest priority; blocks safe ingest work.
2. **Offline game finalisation** — a match ending while the process is down is never seen and stays `live` forever. This is what actually happened to game 20. Needs reconciliation from fixtures discovery (authoritative) or `stream_cursor_at` staleness (simpler). **Not implemented.**
3. **RESL-04 remaining arms** — seq gap, reconnect, suspend/disconnected.
4. Unit coverage for `src/modules/live/` and the five real endpoints.
5. `dotenv` undeclared.
6. CI is **entirely leftover from another project** — `docker-images-build-publish.yml` builds `polymarket-analytics-*` from `apps/markets-analytics-*/Dockerfile`, which do not exist (repo has no Dockerfiles). Triggers only on push to `main`/`develop`, never on PRs. **There is no test gate anywhere.**
7. `WEB_APP_ORIGIN` is now dead config (both REST and WS CORS are `origin: '*'`) but is still hard-required to boot.
8. Local branch `fix/pr-test-regressions` can be deleted — `871ed45` is merged.

## Reconciliation checklist for whoever plans Phase 4

1. Write phase docs against shipped code; do not assume greenfield.
2. Ratify or replace each of deviations 1–6 above.
3. Ratify or change `OPEN_COOLDOWN_MS` (10s), `RESOLVE_AFTER_MS` (12s), `GOAL_CONFIRM_GRACE_MS` (90s).
4. Decide the adjacency partial-credit multiplier and implement `reward_multiplier` properly.
5. Close `game-finalised-current-status-id.md` (option B was taken) and `ws-handshake-origin-not-enforced.md` (closed by WS tickets).
6. Decide `user_score_profile` / `squad_score_profile` write semantics — still **no decision exists**, nothing writes them, and the FK direction is counterintuitive (`user.score_profile` points AT the profile row). LDRB-01 sums `awarded_points` directly, so nothing depends on them yet.
7. Decide which `game_event` row `resolution_event_id` should point at for soft-terminal expiry and timeout adjudication — still undecided.
8. Restore the deleted unit coverage.
