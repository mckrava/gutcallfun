---
title: Phase 4 live loop shipped ahead of planning (2026-07-18 France–England demo)
created: 2026-07-18
source: Ad-hoc pre-match build, ~60 min before the 21:00 UTC kickoff of game id=20
related_requirements: [WNDW-01, WNDW-02, WNDW-03, RESL-01, RESL-02, RESL-03, RESL-04, ANSW-01, ANSW-02, LDRB-01]
resolves_phase: 4
accepted_gap: true
accepted_by: user decision, 2026-07-18 — GSD bypass explicitly authorized to hit a live-match window
---

> **SUPERSEDED — do not treat this file as current.** It was written mid-session,
> ~1h before kickoff, and stops before the live match ran. Several statements
> below were overtaken by events (the trigger rule changed twice afterwards, the
> goal rung was fixed, RESL-05 and the restart arm of RESL-04 landed).
>
> The authoritative record is
> **`.planning/quick/260718-lml-live-loop-shipped-during-live-match/260718-lml-SUMMARY.md`**,
> which supersedes this file and adds: live-match empirical results, the two
> trigger narrowings, goal-confirm deferral, orphaned-window sweep, game
> finalisation, the merged auth PRs, and the current test state.
>
> This file is kept only for the mid-session snapshot it represents.

## What happened

Phase 4 (and part of Phase 5) was implemented directly on `develop` **without** a GSD
phase directory, plan, or research pass, to make the live loop demoable against a real
match kicking off the same evening. The user authorized the bypass and asked that the
work be recorded so GSD reconciles it later rather than discovering undocumented drift.

**There is still no `phases/04-*` directory.** When Phase 4 is formally planned, it must
be written as *reconciliation of already-shipped code*, not greenfield.

## What shipped

**Real DB persistence** replacing Phase 02.1 fixtures (commits `921804d`, `7253284`, `0a2994a`):
`POST /users`, `GET /games`, `GET /games/:id`, `POST /games/:id/join`, `POST /answers`,
`GET /games/:id/questions`. All frozen 02.1 DTO shapes preserved exactly (02.1/D-05 honored).

**Live question engine** in new `src/modules/live/`, plus `src/modules/realtime/` switched
from the mock timer to real emissions (`is_mock: false`, `fake-cycle.service.ts` deleted).
Hook added to `EventIngestService` post-commit, following the existing typed-EventEmitter
pattern from `game-stream-gap.emitter.ts` (02/D-13 seam style, no new dependency).

Honored as locked: WNDW-01 trigger (`attack_possession` edge, `StatusId ∈ {2,4,7,9}`),
one-open-window (`uq_gq_one_open_per_game` 23505 caught, never crashes ingest), 5/7/15/100
ladder with `base_gain` read back per-instance, `(game_id, action_id, type)` incident
matching, append-only event log, idempotent resolution (RESL-03), server-wall-clock
`expires_at` (ANSW-01/STAT-03), no `user_score_profile` writes (no decision exists).

## Deviations from LOCKED decisions — all deliberate, all need reconciliation

| # | Locked rule | What shipped | Why |
|---|---|---|---|
| 1 | **WNDW-03** close rule: soft terminals stamp `pendingCloseAt`, attacking-team pressure within 12s cancels, expiry ≥12s past stamp finalizes at stamp time | Flat `RESOLVE_AFTER_MS` 12s timer from window open, resolving to accumulated high-water rung | Full close rule was not buildable in the time available. High-water accumulation itself is faithful. |
| 2 | **RESL-02** goal flow: `open → pending_confirmation`, `(game_id, action_id, type='goal', confirmed=true)` resolves as goal, ~5-min timeout adjudicates from `Score` of latest events | Deferred resolution: an unconfirmed, undiscarded goal in-window re-arms the timer (~5s poll) up to a 90s hard cap; confirm → `goal`/100, discard → highest non-goal rung, cap → highest non-goal rung + warning | Needed because ~76s median confirm lag vs a 12s window meant the 100-point rung would never fire. Partial step *toward* RESL-02, not a replacement. Question stays `state='open'` while deferred — the real `pending_confirmation` state is not used, and there is no 5-min `Score`-field adjudication. |
| 3 | **RESL-01** `awarded_points = round(base_gain × reward_multiplier)` with adjacency partial credit via `ladder_position` \|Δ\|=1 folded into `reward_multiplier` | Multiplier flat 1 (correct) / 0 (wrong). No adjacency partial credit. | The exact partial-credit value was never decided — brief says "e.g. 0.5", illustrative only. Deliberately not invented. |
| 4 | **RESL-04** void policy: refund answers for any window open/pending across seq gap, reconnect, `suspend`/`disconnected`, or restart with unrecovered hole | **Not implemented at all.** `void` WS event still never emitted. | Cut for time. **This is marked v1-required, not deferred** — nothing in the planning artifacts makes it optional. The 02/D-13 `GameStreamGapDetected` seam and its log-only listener still exist, unchanged, ready for the real body. |
| 5 | — | `resolution` is a room broadcast carrying the correct-pick award and `successful_outcome: true` (matching the mock's frozen shape); per-user results live on `user_game_answer` | Frozen 02.1 DTO has no per-user addressing. Needs a real decision when the socket becomes user-scoped. |

Cooldown between windows: 20s wall clock. **No decision exists for this** — the brief calls
an inter-window cooldown "a one-line config knob — decide by feel". 20s was picked by feel
and should be ratified or changed. Note this is *not* WNDW-03's 12s debounce; do not conflate.

New optional env var `LIVE_QUESTION_FALLBACK_TIMER_MS` (unset = off) opens a window if none
has opened for a live game in that many ms. Deliberately optional so it cannot become a
second required-boot trap alongside `WEB_APP_ORIGIN`. Not in `.env.example`.

## Test coverage regressions

- **Three spec files deleted**: `users`/`games`/`answers` `.service.spec.ts`. They asserted the
  mock-era contract (`new GamesService()` with no args, "nothing persisted (D-05)", fixture
  determinism) and could not compile against repository injection. Recoverable from git
  history; **they were not replaced**. The five now-real endpoints have zero unit coverage.
- `fake-cycle.service.spec.ts` deleted alongside its subject (correct).
- No tests written for `src/modules/live/` at all — the entire question/resolution engine is
  unit-untested. Verified only by a scratch end-to-end script, not committed.
- Pre-existing type errors remain in `fixtures-cron.service.spec.ts` and `replay.spec.ts`
  (predate this work; `tsconfig.build.json` excludes specs and is clean).

## Also changed

- Gateway CORS opened to `origin: '*'` (was `process.env.WEB_APP_ORIGIN`), matching `main.ts`.
  This makes [[ws-handshake-origin-not-enforced]] strictly worse: that todo says the gap becomes
  "a genuine vulnerability the moment the gateway serves real per-user state", and the socket now
  carries real questions, resolutions and points. Still `resolves_phase: 5`, still blocking for it.
- `WEB_APP_ORIGIN` is now dead config but remains hard-required to boot by `app-config.schema.ts`.

## Reconciliation checklist for whoever plans Phase 4

1. Write the phase docs against shipped code; do not assume greenfield.
2. Decide each of the five deviations above: ratify, or implement the locked rule.
3. RESL-04 void/refund is the largest correctness gap — treat as blocking for real play.
4. Ratify or change the 20s inter-window cooldown; record it.
5. Decide the adjacency partial-credit multiplier and implement `reward_multiplier` properly.
6. Restore unit coverage for the five endpoints and write it for `src/modules/live/`.
7. Resolve the still-open questions the research pass flagged as having no decision:
   `resolution_event_id` target row for soft-terminal expiry and timeout adjudication;
   `user_score_profile`/`squad_score_profile` write semantics (note the reversed FK direction);
   `game.current_status_id` on `game_finalised` (see [[game-finalised-current-status-id]]).
