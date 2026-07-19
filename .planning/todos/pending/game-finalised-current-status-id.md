---
title: Decide what game_finalised does to game.current_status_id
created: 2026-07-18
source: Phase 2 end-to-end replay verification (user-observed)
resolves_phase: 4
related_requirements: [RESL-05, STAT-01]
---

## What

RESL-05 (Phase 4) specifies `game_finalised` freezes the game: `status → finished`.
It is **silent on `game.current_status_id`**, which today goes stale.

## Observed

Full replay of fixture 18241006 (964 events) ended with:

| field | value |
|---|---|
| `game.status` | `live` (expected — RESL-05 is Phase 4, not yet built) |
| `game.current_status_id` | **5** |
| last event in log | seq 962, `game_finalised`, `status_id` = **100** |

The log correctly recorded `status_id=100`; the denormalized game column stayed at 5.

## Why it happens

`MessageNormalizer.lazyFillPatch()` only emits a patch for four actions —
`jersey`, `status`, `score_adjustment`, and confirmed `goal`. `game_finalised`
matches none, so it produces no game-row update.

Observed status_id progression: 1 (pre) → 2 (1H) → 3 (HT) → 4 (2H) → 5 (FT) → 100 (finalised).

## The decision to make

`100` looks like a **terminal sentinel**, not a period id, so blindly denormalizing
it into `current_status_id` may be wrong — it would break any consumer that reads
that column as "which period are we in". Options:

1. Leave `current_status_id` at the last real period (5) and let `status='finished'` be the terminal signal
2. Denormalize 100 as an explicit terminal marker
3. Add a separate `finalised_at` timestamp and leave both existing columns alone

Pick deliberately during RESL-05 implementation rather than inheriting whichever
behavior falls out of the code.

## Not a bug today

Phase 2 correctly persisted the event to the append-only log (INGST-03). Phase 2
never owned `game.status` transitions — the only one in its remit is
`scheduled → live` (SourceSchedulerService atomic claim), which works.
