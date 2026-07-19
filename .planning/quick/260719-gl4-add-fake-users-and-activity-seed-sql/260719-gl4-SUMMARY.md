---
quick_id: 260719-gl4
status: complete
date: 2026-07-19
---

# Summary — Fake leaderboard seed

## Delivered

`apps/gutcallfun-core/scripts/seed-fake-leaderboard.sql` — one idempotent,
transactional file, no app code touched.

## Verified against the live local DB

Applied twice with `ON_ERROR_STOP=1`. Both runs produced identical row counts
and identical scores:

| | rows |
|---|---|
| fake users (+ score profiles) | 50 |
| seeded squads | 3 (ids 901–903) |
| squad_participant | 36 seeded + 8 into real squad 1 |
| user_game | 143 |
| user_game_answer | 4509 |

Eligible games discovered dynamically: 4 finished games with resolved
questions (20, 24, 25, 26). Game 27 is excluded automatically — it is still
`live`.

Resulting global board spread: top 613 pts → mid ~200 → tail ~40. Top five
identical on both runs (first_touch_finn 613, press_trigger 595,
switch_play_sia 576, rabona_rosa 557, late_runner_lu 541), confirming the md5
hashing is deterministic.

Squad boards populate: 901 = 4556 pts, 902 = 4367, 903 = 1044. Real squad 1
now shows 9 members with the real `local_max_1` at 30 pts among 8 fake rivals.

Real data untouched: `local_max_1` 45 pts / 4 games, `smoke_maxim` 0 / 2,
`t_mrqud2vy9957` 0 / 1 — unchanged before and after.

## Notes / deviations

- Squad 1's `ssp_1` counter is deliberately left at its pre-seed value; the
  seed does not mutate real rows beyond adding members. The derived board is
  correct regardless since nothing ranks on that counter. Documented inline.
- The "stuff real squad 1" behavior is in a clearly-marked optional block that
  can be deleted without affecting the rest of the seed.
