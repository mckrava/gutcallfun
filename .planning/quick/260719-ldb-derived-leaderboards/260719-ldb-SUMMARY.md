---
phase: 5
plan: none — shipped outside GSD flow, to be reconciled
subsystem: scoring
tags: [leaderboard, scoring, squads, derived-aggregates, ui-contract]
requires: [LDRB-01, RESL-01, RESL-03]
provides: [leaderboard-four-scopes, squad-average-standing, derived-score-reads]
affects:
  - apps/gutcallfun-core/src/modules/api/leaderboard/
  - apps/gutcallfun-core/src/modules/scoring/score-aggregate.service.ts
  - apps/gutcallfun-core/src/modules/api/squads/squads.service.ts
  - apps/gutcallfun-core/src/modules/api/users/users.service.ts
  - apps/gutcallfun-ui/src/services/api/ (types, endpoints, hooks, queryKeys)
  - apps/gutcallfun-ui/src/components/shell/ (RealDataBridge, MatchSquadBridge)
  - apps/gutcallfun-ui/src/services/adapters/squads.ts
tech-stack: [nestjs-11, typeorm-0.3.31, postgres-16, next, react-query]
key-files:
  - apps/gutcallfun-core/src/modules/api/leaderboard/leaderboard.service.ts
  - apps/gutcallfun-core/src/modules/scoring/score-aggregate.service.ts
date: 2026-07-19
---

# Leaderboards: four scopes, derived from the answer log

Third session shipped outside the GSD flow, same understanding as
[[260718-lml-SUMMARY]] and [[260719-scp-SUMMARY]]: build fast now, reconcile
into phase docs later.

## THE TRADEOFF — this is the thing to remember

**Every leaderboard and every displayed score total is now DERIVED at query
time from `user_game_answer`. Nothing ranks on the `*_score_profile`
counters.** The full rationale is duplicated in a header comment at the top of
`leaderboard.service.ts` so it is unmissable at the code.

Chosen because:

1. **One source of truth.** A cached counter and a derived board *will* diverge
   (a missed increment, a replayed resolution, a void). When they do, the same
   player shows two different scores on two screens mid-demo.
2. **Four boards, one query.** Game- and squad-scoped totals have no counter to
   read anyway. Caching them means a `user_squad_score_profile` table, a second
   write path, a second backfill, and a second idempotency guard.
3. **Self-healing.** Points awarded before the counters existed — the entire
   France–England match — appear immediately. This **closes open item #1 of
   [[260719-scp-SUMMARY]]** ("historical points were NOT backfilled") without a
   migration: derived reads do not care that the counters missed them.

Accepted costs:

- **Full aggregate scan per request.** Deliberate. Hackathon scale is one match,
  ~68 questions, tens of users, and `idx_uga_leaderboard (game_id, user_id)`
  already covers the game-scoped case. At real scale this becomes a
  materialized view or a rollup refreshed at resolution — **do not reach for
  that now.**
- **`user_score_profile.total_points` is now decorative.** Still written by
  `applyResolutionPoints` at resolution, still has its row served for the `id`
  field, but nothing reads its value. It is a cache with no readers. Either
  delete the write path or keep it as a cross-check; **do not** let a future
  reader start trusting it without re-reading this note.

## The four boards

`GET /leaderboard?game_id=&squad_id=` — both filters independently optional.

| game_id | squad_id | board |
|---|---|---|
| — | — | global, every user |
| — | set | global, one squad's active members |
| set | — | one game, every participant |
| set | set | one game, one squad — the live in-match board |

Response envelope unchanged (`{items,total,limit,offset}` with
`user_id/handle/emoji/image/total_points/rank`), so the existing global caller
kept working untouched.

Two shape decisions that are load-bearing:

- **Participants come from the joiner set, not the answer set.** A player who
  joined but has not scored appears at zero. Otherwise they cannot find
  themselves on the live board until their first correct answer.
- **Squad attribution lives in the LEFT JOIN's ON clause, never in WHERE.**
  In WHERE it would *drop* squad members with no qualifying answer instead of
  scoring them zero — they would vanish from their own squad's board rather
  than sit at the bottom of it. Pinned by a spec assertion.

## Decisions taken

**D-C: squad standing is an AVERAGE with a players-only denominator.**
`avg_points` = points earned for the squad, averaged over members who have
played **at least one game for this squad** — not the full roster. Chosen by
the user over the literal "all participants" reading so that recruiting members
who never play cannot dilute the score.

Cost to accept: a one-member squad that got lucky can out-average a deep one.
Harmless while nothing ranks squads *against each other*; **if a squad-vs-squad
board is ever added it needs a minimum-players floor.** A member who joined for
the squad but never answered counts as a zero — they showed up, so they are a
player.

`SquadScoreProfileResponseDto` gained `avg_points` and `players_count`;
`total_points` remains the SUM (honest name, still useful), so this was
additive and broke no client.

**D-D: solo participants are excluded from squad-scoped boards, by design.**
`user_game.squad_id` is nullable — a user may join a game with no squad. Those
users appear on both unscoped boards and on no squad board. They earned points
for themselves; there is no squad to credit. Proven explicitly (proof step 2:
carol scores 100 solo and is absent from S1's board).

## Squad member points changed meaning

`GET /squads/:id/participants` previously returned each member's **lifetime**
`user_score_profile.total_points`. It now returns points earned **for this
squad**. The old behaviour meant squad standings ranked members by points they
had earned for *other* squads. No UI change was needed — `SquadDetailScreen`
reads the same field.

## UI changes

**The critical one: the UI never sent `squad_id` on join.** `JoinGameBody`
allowed it, the endpoint and hook forwarded it, but `RealDataBridge` called
`joinGame.mutate({})` while the chosen squad sat in the client-side store as
`matchSquadId`. Every `user_game.squad_id` was therefore NULL and **every
squad-scoped board would have returned empty**. Now wired.

Note the sharp edge, also in the code comment: join is idempotent and the row is
written once, so **picking a squad after joining does not backfill it** — the
user stays solo for that game.

**The in-match squad panel was ranking by lifetime points.**
`MatchSquadBridge` fed `squadToMatchPanel` from `/squads/:id/participants`, so a
squadmate who did nothing tonight could sit at #1 all match. It now reads
`GET /leaderboard?game_id&squad_id`. `RealDataBridge` publishes `liveGameId` to
the store so the panel can scope to the live game; if either id is missing the
panel gets **no** rows rather than lifetime ones (a squad-only query would
silently reintroduce the bug).

`squadToMatchPanel` now takes a `RankableMember` shape satisfied by both
`SquadParticipant` and `LeaderboardEntry`, preferring the server's `rank` when
present.

## Verification

- **216/216 unit tests pass** (up from 212), `tsc` clean in BOTH apps, eslint
  clean on every file changed here.
- **12/12 checks against real Postgres**, running the actual services (not a
  hand-copy of their SQL) inside a rolled-back transaction. Fixture: two squads,
  a solo joiner, a joiner who never answered, and a user with points in two
  games for two different squads. Confirms all four scopes, ties sharing a rank,
  solo exclusion, the players-only average, and that a user's points earned for
  S2 do **not** appear on S1's board.
- The leaderboard spec was rewritten: the old one constructed the service with a
  `Repository` mock, which stopped existing when the service moved to
  `DataSource`.

## Follow-up: /rankings showing mock rows

Reported after the above shipped. The API was ruled out first: `GET /leaderboard?limit=50`
returns 84 / 25 / 0 for the three registered users (109 total, matching the DB
exactly), both direct and through the Next BFF proxy, verified with a headless
Chrome session that also captured the browser's own request log.

Four real defects found, all in the UI:

1. **Lost store notification at mount (the likely cause).** `MatchController`
   subscribes to the real-data store in `componentDidMount`, but React runs
   CHILD effects before a parent's `componentDidMount`. Any `setRealData` the
   bridges fire in that window notifies nobody, and the controller keeps
   rendering mock constants until some unrelated re-render. React-query serving
   a cached page synchronously (staleTime is 30s) lands squarely in that window.
   Fixed by forcing one catch-up render after subscribing if the store is
   already non-empty.
2. **"AROUND YOU" divider rendered over nothing.** With only 3 users the board
   is 3 medal rows and the section below is legitimately empty — a bare divider
   over blank space reads as an unfinished screen. Now hidden when empty.
3. **The "you" highlight was dead on the global board.** `RealDataBridge` called
   `leaderboardToRankRows(items)` without `meId`, so the caller's own row
   rendered like everyone else's. Now passes `me.data?.id`.
4. **A duplicate global leaderboard request**, introduced by this session's
   `MatchSquadBridge`: passing `undefined` for "scope not known yet" silently
   fetched the GLOBAL board. `useLeaderboard` gained an `enabled` option and the
   bridge gates on it. Confirmed gone from the browser request log.

**Not conclusively reproduced:** the headless session cannot authenticate
(wallet signature), so it lands on sign-in rather than `/rankings`. Defect 1 is
a genuine race that produces exactly the reported symptom, but whether it is
what the user hit is unconfirmed — if mock rows persist after these fixes, the
next step is the browser console on an authenticated session.

## Follow-up 2: three different point totals on three screens

Reported symptom: game page "YOUR POINTS" 30, `/rankings` 25, `/profile` 45.

**No scoring bug — the backend agreed with itself throughout.** DB truth for the
reporting user (`local_max_1`):

| game | status | points |
|---|---|---|
| 27 | live | 30 |
| 26 | finished | 15 |
| 24 | finished | 0 |
| | **total** | **45** |

So 30 (this game) and 45 (lifetime) were both correct and are different
questions. `GET /leaderboard` returned 45 at the same moment. The 25 on
`/rankings` was a **stale react-query cache** — it is exactly the value the
endpoint returned earlier in the same session, before more points landed.

**Cause:** on every WS `resolution`, `LiveMatchBridge` invalidated only
`queryKeys.answers.all`. That is why the in-game counter tracked correctly while
every other points surface froze at whatever it fetched when its screen first
mounted. With `staleTime: 30_000` and `refetchOnWindowFocus: false`, nothing
else ever refetched. `/profile` looked right purely because it mounted later
than `/rankings`.

This got worse — not caused — by the move to derived reads: previously every
surface read the same stale-but-consistent counter, so they at least agreed with
each other while all being wrong.

**Fix:** the resolution effect now also invalidates `leaderboardAll` (a new
prefix key matching every scope at once), `users.myScoreProfile`, and
`squads.all` (participant rows carry squad-scoped points; the squad profile
carries the average). A resolution changes all of them simultaneously because
they are all derived from `user_game_answer`.

## Follow-up 3: "Choose squad" never reached the backend

Reported: picking a squad on the game page showed as selected in the UI, but
`user_game.squad_id` stayed NULL.

**Confirmed — the flow sent no request at all.** `SquadModal` only ran
`setRealData({ matchSquadId: sq.id })`, a client-store write. The one place that
ever transmitted `squad_id` was the initial join in `RealDataBridge`, which has
already fired by the time the picker is opened. And even a re-join would not
have helped: `GamesService.join` returned early on an existing row without
touching `squad_id`.

This is the sharp edge flagged in the join comment when `squad_id` was first
wired — now closed properly rather than left as a caveat.

**Backend.** `join()` now updates the association when a squad is supplied and
differs. Omitting `squad_id` never clears an existing one — the UI re-joins with
an empty body on every page load, and treating that as "no squad" would wipe the
association on refresh.

**CONSEQUENCE, deliberate:** squad attribution is derived at READ time from
`user_game.squad_id`, so changing it **retroactively moves every point already
earned in that game** to the new squad. That matches "who am I playing this
match for", but it is not an append-only trail. If per-answer attribution is
ever needed, `squad_id` must be denormalized onto `user_game_answer` at
resolution instead. Noted at the method.

**UI.** The picker now calls the join mutation, sets local state optimistically
for a responsive close, then trusts the server's returned `squad_id` and
invalidates the leaderboard + participants.

**Verified: 13/13 against real Postgres**, running the actual `GamesService` in
a rolled-back transaction — initial solo join, the pick that used to be dropped,
switching squads, a page-reload re-join not clearing the squad, and re-picking
the same squad being a no-op. Two invariants pinned alongside: exactly one
`user_game` row throughout, and `games_played` counted once (the re-join path
must not re-increment it).

## Follow-up 4: squad pick lost on refresh (server state the UI could not read)

Reported after deploying to a remote server: picking a squad persisted to
`user_game.squad_id` and showed correctly, but a page refresh showed no squad
even though the DB row was right.

**The DB was correct; the UI simply never asked.** `matchSquadId` lives in a
module-level client store that resets on every page load, and no endpoint
exposed the caller's own `user_game` row — `GET /games/:id/participants` returns
`user_id/handle/emoji/image/joined_at` with no `squad_id`. So the selection was
write-only from the client's perspective.

This is the gap left open when follow-up 3 made the pick persist: it fixed the
write path without adding the corresponding read.

**New `GET /games/:game_id/me`** returns `{ joined, user_game }` for the caller.
An envelope rather than a bare row or a 404: not-joined is a normal state on
every page load, and modelling it as an error means console noise and a
react-query retry for every unjoined visitor.

`RealDataBridge` hydrates `matchSquadId` from it, but **only into an empty
slot** — a pick made during the session always wins over a stale server read.
`SquadModal` invalidates the `/me` key after a successful pick so the next load
restores the new squad rather than the previous one.

**Verified: 6/6 against real Postgres** — not-joined, joined-solo, the refresh
case itself, caller scoping (another user's participation is not leaked), and a
404 for an unknown game.

Also corrected a comment in `RealDataBridge` that still claimed a later squad
pick could not backfill the join — untrue since follow-up 3.

## Follow-up 5: `_rsc` navigation storm / slow page transitions

Reported from the remote deploy: transitions crawl, console full of repeated
`/live?_rsc=...` requests. `_rsc` is Next's RSC payload fetch, so this is
`router.push` firing in a loop — not a data problem.

Three compounding causes, all fixed:

1. **`syncRoute` re-issued an in-flight navigation.** It ran on EVERY
   `componentDidUpdate` — including every `forceUpdate` from the real-data store
   — and `router.push` is not instant: Next fetches the RSC payload before
   `pathname` updates. So each update re-pushed the same route while the first
   was still in flight, and each returned payload re-rendered the tree into
   another update. Now tracks the requested route and skips until `pathname`
   catches up.

2. **A write storm feeding it.** `RealDataBridge`'s games effect listed
   `joinGame` as a dependency, but `useMutation` returns a NEW object every
   render, so the effect re-ran on every render and wrote to the store each
   time. Moved to a ref (assigned in an effect — a render-phase ref write is
   unsafe under concurrent rendering).

3. **No-op writes still notified.** `setRealData` always notified subscribers,
   so writing an identical value still forced a render and another route sync.
   Now skips when every key in the patch is `Object.is`-equal to current. Catches
   the repeating cases (`liveGameId`, `matchSquadId`, `liveDispPts`); freshly
   built arrays still notify.

**Measured with headless Chrome, 10s window on the same page: 8 `_rsc` requests
before, 1 after** — and that was the unauthenticated sign-in screen, where the
loop is weakest. The authenticated `/live` flow drives constant store writes
from the WS stream, so the real-world multiplier was far higher.

Causes 1 and 2 pre-date this session's work; the extra store writes added for
liveGameId and squad hydration increased the pressure on an already-looping
path rather than creating it.

## Open / deliberately not done

1. **`applyResolutionPoints` now has no readers.** Decide whether to delete the
   write path or keep the counters as a cross-check. Superseded parts of
   [[260719-scp-SUMMARY]] accordingly — its open item #1 (historical backfill)
   is now **closed by derivation**, not by migration.
2. **No "my rank" endpoint.** `useRecapData` finds the user's global rank by
   scanning the first 100 rows client-side; a user outside that page renders
   "—". A `GET /leaderboard/me` would fix it cheaply.
3. **Squad-vs-squad board does not exist** and would need a minimum-players
   floor before `avg_points` is safe to rank on (D-C).
4. **RESL-04 void/refund still has no inverse.** Derived reads make this much
   less dangerous — voiding an answer's `awarded_points` corrects every board
   automatically — but the counters would still drift.
5. **7 pre-existing prettier errors** in files untouched here
   (`leaderboard-entry.dto.ts`, `squad-response.dto.ts`, `squads.controller.ts`,
   `create-user.dto.ts`, `user-response.dto.ts`). Left alone as out of scope;
   `eslint --fix` clears all 7.
