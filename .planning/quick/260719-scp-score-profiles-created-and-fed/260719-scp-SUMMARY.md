---
phase: 4
plan: none — shipped outside GSD flow, to be reconciled
subsystem: scoring
tags: [score-profile, leaderboard, squads, users, resolution, migration]
requires: [LDRB-01, RESL-01, RESL-03]
provides: [user-score-profile-lifecycle, squad-score-profile-lifecycle, leaderboard-real-data]
affects:
  - apps/gutcallfun-core/src/modules/scoring/
  - apps/gutcallfun-core/src/modules/api/users/users.service.ts
  - apps/gutcallfun-core/src/modules/api/squads/squads.service.ts
  - apps/gutcallfun-core/src/modules/api/games/games.service.ts
  - apps/gutcallfun-core/src/modules/live/question-resolution.service.ts
  - apps/gutcallfun-core/src/db/migrations/BackfillScoreProfiles1790100000000.ts
  - package.json (root)
tech-stack: [nestjs-11, typeorm-0.3.31, postgres-16]
key-files:
  - apps/gutcallfun-core/src/modules/scoring/score-profile.service.ts
date: 2026-07-19
---

# Score profiles: created on registration, fed by resolution

Second session shipped outside the GSD flow, with the same understanding as
[[260718-lml-SUMMARY]]: build fast now, reconcile into phase docs later.

## The bug this actually fixed

`user_score_profile` and `squad_score_profile` existed as tables and entities
but **nothing ever inserted a row into either**, and nothing ever wrote points.
Every `score_profile` column in the database was NULL.

That was invisible until the merged UI PR repointed `LeaderboardService` to rank
on `LEFT JOIN user_score_profile ... COALESCE(usp.total_points, 0)`. From that
commit on, **the leaderboard returned 0 points for every user** regardless of
how many questions they had answered correctly. `GET /squads/:id/score-profile`
was an outright mock (`id: 'squad:<n>'`, `games_played: 0`, `updated_at: now()`),
and `GET /users/:id/score-profile` 404'd for everyone.

## What shipped

**New `src/modules/scoring/`** — `ScoreProfileService` (`@Global` module),
sole owner of both profile tables:

| Operation | Called from | Effect |
|---|---|---|
| `ensureUserProfile` | user create, score-profile read | insert `usp_<uuid>`, link `user.score_profile` |
| `ensureSquadProfile` | squad create, squad profile read | insert `ssp_<squadId>` |
| `linkParticipantProfile` | squad join / add participant | point `squad_participant.score_profile` at the squad's row |
| `recordGameJoin` | `POST /games/:id/join` | `games_played += 1` for user, and for squad on its first member |
| `applyResolutionPoints` | question resolution | fold awarded points into user + squad totals |

**Migration `BackfillScoreProfiles1790100000000`** — creates and links profiles
for all pre-existing users, squads and memberships, and seeds `games_played`
from the `user_game` rows that already exist. Applied locally: 3/3 users and
1/1 squad linked, 0 unlinked.

## Decisions taken (no prior decision existed)

Both were flagged as open in [[260718-lml-SUMMARY]] ("`user_score_profile` /
`squad_score_profile` write semantics — note the reversed FK direction"). The
user chose both on 2026-07-19.

**D-A: one `squad_score_profile` per squad, shared by all members.** Every
`squad_participant.score_profile` in a squad points at the same `ssp_<id>` row,
so `GET /squads/:id/score-profile` is a real row read.

The schema does not force this. `squad_score_profile` is referenced from
`squad_participant`, not from `squad` — there is no `squad.score_profile`
column — so the column placement literally permits one profile per *(squad,
user)* membership instead. That reading was rejected: it leaves the squad-level
endpoint with no row of its own, and duplicates `user_score_profile` for anyone
in exactly one squad. **Consequence to accept or revisit:** `squad_participant.
score_profile` is now the same value for every row in a squad, i.e. a
denormalized constant rather than per-member data.

**D-B: `games_played` counts games JOINED, not games answered in.** Incremented
in `POST /games/:id/join`, only on a genuinely new `user_game` row — join is
idempotent, and the UI re-joins on every page load, so counting repeat joins
would inflate it without bound. A squad counts a game once however many members
join it.

**Derived ids, not random** (`usp_<uuid>` / `ssp_<n>`). This is what makes every
`ensure*` call idempotent without a lookup, and lets a missing profile be
repaired at read time with no migration state to track.

## Points flow to the squad you PLAYED FOR

`applyResolutionPoints` credits the squad from `user_game.squad_id` — the squad
the user joined that specific game as — not every squad they belong to. A user
in three squads earning 100 points credits one squad, not three. Verified
explicitly (step 5 of the DB proof).

## Idempotency — read this before reusing `applyResolutionPoints`

It sums **every** awarded answer on the question, so calling it twice credits
twice. It is safe only because its one caller reaches it *after* winning the
`game_question.state IN (open, pending_confirmation) → resolved` transition that
RESL-03 uses as the resolution guard (`question-resolution.service.ts:278`); a
second resolution affects zero rows and returns before this line.

An earlier draft of the code comment claimed the `awarded_points IS NULL` clause
provided the guarantee. That was wrong — that clause guards the answer UPDATEs,
not the aggregate read — and the comment was corrected rather than left to
mislead. **Do not call this method from any path lacking the state guard.**

## Unrelated blocker fixed on the way: the test suite could not run

`npm test` failed with `Module ts-jest in the transform option was not found`.
Cause: root `package.json` declared `jest@^29.7.0` + `jest-extended` from
`feat: init repo`, used by nothing — no app imports them and only
`gutcallfun-core` runs jest (v30). npm therefore hoisted `ts-jest` to the root
while nesting `jest@30` under the app, and jest 30 could not resolve the
transform. Removed both from root devDependencies; jest now hoists cleanly.

This was pre-existing and independent of this work — it reproduced before any
change here — but it blocked all verification.

## Verification

- **212/212 unit tests pass** (up from 200; 12 new in `score-profile.service.spec.ts`), `tsc` clean, eslint clean on all changed files.
- **14/14 checks pass against real Postgres** via a scratch proof run inside a rolled-back transaction: profile creation and linking, idempotency, shared squad profile, correct/wrong credit (15/0), squad total, bigint-returns-as-string, squad scoping, and a leaderboard read returning 115 rather than 0.
- DI wiring is covered because `stream-manager.service.spec.ts:243` boots the real `AppModule` against Postgres — it caught a missing `SquadScoreProfileEntity` registration in `SquadsModule` during this work.

## Open / deliberately not done

1. **Historical points were NOT backfilled.** The migration seeds `games_played`
   from `user_game` but leaves `total_points` at 0 — the ~68 resolved questions
   from the France–England match do not appear in anyone's total. Reconstructing
   them is a single `SUM(awarded_points) GROUP BY user_id` over
   `user_game_answer`; it was skipped because squad attribution for those rows
   depends on `user_game.squad_id` values that were never set during that match.
   **Decide this when planning Phase 4.**
2. **`squad_participant.score_profile` is now redundant** under D-A. Either
   accept it as a denormalized constant or drop the column.
3. **No `void`/refund interaction.** RESL-04 is still unimplemented; when it
   lands, voiding a resolved question must also *debit* the profiles, which
   `applyResolutionPoints` has no inverse for today.
4. **`games_played` never decrements** and has no notion of a game the user
   joined but that was later voided or abandoned.
