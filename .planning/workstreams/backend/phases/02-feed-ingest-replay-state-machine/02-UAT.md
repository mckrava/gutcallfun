---
status: testing
phase: 02-feed-ingest-replay-state-machine
source: [02-VERIFICATION.md]
started: 2026-07-17T22:10:11Z
updated: 2026-07-18T08:05:00Z
---

## Current Test

number: 4
name: Boot-recovery RCVR-01 vs RCVR-02 state equivalence
expected: |
  Rebuilding a game state from persisted game_event rows and from the same messages
  driven through the resumed path produce identical GameState objects.
awaiting: side-by-side equivalence test (only remaining pending item)

## Tests

### 1. starts_at timestamptz round-trip precision (INGST-05 / GAME-01 backstop)
expected: A fixture with a known StartTime, once upserted by FixturesCronService and read back from Postgres, yields the exact same instant (no timezone shift, no ms truncation).
why_human: Code path (`new Date(fixture.StartTime)` → TypeORM `timestamptz`) is structurally correct by inspection and unit-tested only against a mocked repository; PLAN marks it `verification: backstop` and 02-04-SUMMARY flags `human_judgment: true` — no live DB round-trip assertion exists in the suite.
result: PASS (2026-07-18, live Postgres 16)

**Evidence:** compared the feed's own `StartTime` (carried in the persisted `game_event.payload`)
against the stored `game.starts_at` for game 22 / fixture 18237038:

| feed_start_ms | stored_ms | drift |
|---|---|---|
| 1784055600000 | 1784055600000 | **0 ms** |

Exact instant round-trip through the `timestamptz` column — no timezone shift, no millisecond
truncation. Backstop closed with a real DB assertion rather than inspection.

### 2. Genuinely-blocked socket abort within SIGTERM grace (INGST-04 / 02-05 D7)
expected: Killing the process (or calling `onApplicationShutdown()`) while a real socket `reader.read()` is blocked causes the read to reject/throw immediately rather than hanging until an OS-level timeout.
why_human: PLAN 02-05 marks this `verification: backstop`; 02-05-SUMMARY (D7) flags `human_judgment: true` — unit specs only prove a mocked-fetch AbortSignal propagates, weaker than an OS-level stalled read genuinely being aborted. Standard undici/fetch behavior, but not observed against a real stalled connection here.
result: PASS (2026-07-18, real TxLINE socket)

**Evidence — this is the real OS-level test the item was waiting for, not a mock.**
Game 23 (`is_replay=false`) was armed so boot recovery's RCVR-02 path opened a genuine SSE
connection to TxLINE. Verified with `lsof` that the process held an ESTABLISHED socket to
`3.164.92.37:443` (a `txline.txodds.com` CloudFront IP), receiving real frames
(`stream meta: {"type":"heartbeat"}`) with no auth errors. Because that fixture's match ended
days earlier, no match events were flowing — so `reader.read()` was genuinely blocked between
heartbeats, exactly the condition this item specifies.

SIGTERM was then sent and exit measured at millisecond resolution:

```
RESULT: exited in 0.024s  -> PASS
```

**24 ms.** Had CR-02 not been fixed, abort would not have interrupted the blocked read and
shutdown would have been bound by the 30-second idle watchdog. Post-shutdown the INGST-04
invariant held (`stream_cursor` never ahead of the log). This supersedes the earlier
"automated coverage still mocks the fetch/reader layer" caveat below.

**2026-07-18 update (quick task 260718-48a, CR-02 fix):** `02-REVIEW.md`'s
CR-02 BLOCKER finding is fixed — `connectWithRetry`/`runSingleStream` now
thread the caller's `AbortSignal` into the actual SSE `fetch()` call
(transport-level abort) AND register an abort listener that calls
`reader.cancel()` to interrupt a blocked `reader.read()` promptly, instead
of only gating the inter-reconnect `sleep()`. `stream-manager.service.ts`'s
`onApplicationShutdown` doc comment, which previously asserted an invariant
that was false as implemented, has been corrected to describe this actual
two-part mechanism. New regression coverage lives in
`apps/gutcallfun-core/src/modules/ingest/stream/upstream.spec.ts` (signal
reaches the transport, prompt abort of a blocked read under a 60s watchdog,
no watchdog-timer leak, no abort-listener leak, AUTH_EXPIRED still
short-circuits) — all against the REAL `connectWithRetry`, not a mock.
Honesty note: this automated coverage still mocks the fetch/reader layer
(an injected `fetchImpl` and a fake `ReadableStreamDefaultReader`), so
observing a genuinely-blocked OS-level stalled socket abort for real remains
this item's outstanding human-verification step — `result` is intentionally
left `[pending]`.

### 3. Live SSE ingest against the real TxLINE origin (02-05 D8)
expected: With real TXLINE_GUEST_JWT/TXLINE_API_TOKEN in `.env`, a live game's SSE connection authenticates, receives real feed frames, and each is normalized/persisted/state-applied identically to the replay path, with no crash on real production message shapes.
why_human: 02-05-SUMMARY (D8) designates this best-effort/non-blocking, `human_judgment: true` — all automated tests mock the fetch layer; the real feed has never been exercised end-to-end. Pipeline correctness is otherwise proven via the real-Postgres 20× replay e2e (Source B); only the live-source-specific behavior (real headers, backoff/watchdog vs production infra) is unconfirmed.
result: BLOCKED (2026-07-18) — connection half PASSES; match-event half is unreachable, see below

**What was proven (2026-07-18, real TxLINE origin):** with the real credentials in `.env`,
`StreamManagerService` opened a genuine authenticated SSE connection to
`txline.txodds.com` (ESTABLISHED socket to `3.164.92.37:443`, confirmed via `lsof`),
received real frames (`stream meta: {"type":"heartbeat"}`), and ran with **no auth error,
no 401, and no crash on production message shapes**. Real headers, real transport, real
handshake — all confirmed.

**What is unreachable, and why it is not a code gap:** the remaining clause ("each frame
normalized/persisted/state-applied identically to the replay path") requires a fixture that
is actually *in play*. Per D-09 the TxLINE feed currently has **no live or upcoming
fixtures** — that is the documented reason past-fixture discovery exists at all. There is no
match event to receive, so this cannot be exercised until a real match is live (World Cup
2026 kickoff).

**Why the risk is nonetheless covered:** RPLY-02 makes `is_replay` switch *only the source* —
replay and live feed the identical `EventIngestService.processEvent()`. The
normalize→persist→state-apply half was proven end-to-end on **964 real TxLINE messages**
(see item #5), and the transport half is proven here. The only unproven combination is
"real transport carrying real in-play match events", which no amount of local work can
create. Marked `blocked` on external feed availability rather than `pending`.

### 4. Boot-recovery RCVR-01 vs RCVR-02 state equivalence (PLAN 02-07 backstop)
expected: Rebuilding a game's state from persisted `game_event` rows via `GameStateMachine.applyEvent()` (RCVR-01) and rebuilding the same game's state by replaying the same messages through a live/resumed connection (RCVR-02) produce identical GameState objects (score, possession stage, attackRun, lastSeq, connectionId).
why_human: PLAN 02-07 marks this `verification: backstop` — both paths call the SAME `GameStateMachine.applyEvent()`, a strong structural equivalence argument, but no test exercises both paths side-by-side on one event sequence and diffs the result.
result: [pending]

### 5. Manual-DB-flip demo control surface, end-to-end (D-06 demo choreography)
expected: `UPDATE` a past-game row to `is_replay=true, status='scheduled', starts_at=now()+~3min`; the ~15s SourceSchedulerService poll picks it up and a full replay plays through to a visible finished game (with downstream answers/points/leaderboard once later phases land).
why_human: 02-07-SUMMARY (D3) flags `human_judgment: true` — proven at the unit level (one query, one is_replay branch, no separate manual-flip code path), but a live operator-driven full run (DB UPDATE → app running → visible browsable replay → completed match) has not been executed.

result: PASS (2026-07-18, operator-driven full run against real TxLINE data)

**Evidence — the full demo choreography, executed by the operator exactly as D-06 describes.**
The user ran the `UPDATE` by hand on game 21 / fixture 18241006; the ~15s
`SourceSchedulerService` poll picked it up with no separate manual-flip code path, flipped it
to `live`, and drove a complete replay through the identical downstream pipeline:

| check | result |
|---|---|
| Source A historical fetch | **964 events** parsed from real TxLINE (SSE-framed) |
| D-07 auto-wipe | fired — started from 0, discarding 44 stale rows |
| Idempotency (INGST-03) | **964 events / 964 distinct seq — zero duplicates** |
| Cursor flush (INGST-04) | `stream_cursor == max_seq` at every sample and after shutdown |
| State machine (STAT-01) | `status_id` 1→2→3→4→5→100 (full match lifecycle) |
| Score derivation (goals.ts) | **1–2**, derived from real confirmed goal events |
| Danger ladder | 207 attack / 102 danger / 59 high-danger / **32 shots** |
| Pacing clamp | ran to completion; unclamped this fixture spans 3.6 days |
| Shutdown | clean SIGTERM |

The shot/danger ladder is the exact trigger surface Phase 4's prediction windows consume, so
this run also de-risks the next phase. Note the game correctly remains `status='live'` after
`game_finalised` — transitioning to `finished` is RESL-05, owned by Phase 4 (see
`.planning/todos/pending/game-finalised-current-status-id.md`).

## Summary

total: 5
passed: 3
issues: 0
pending: 1
skipped: 0
blocked: 1

## Gaps
