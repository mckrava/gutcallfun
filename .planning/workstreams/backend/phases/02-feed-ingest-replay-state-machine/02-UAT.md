---
status: testing
phase: 02-feed-ingest-replay-state-machine
source: [02-VERIFICATION.md]
started: 2026-07-17T22:10:11Z
updated: 2026-07-17T22:10:11Z
---

## Current Test

number: 1
name: starts_at timestamptz round-trip precision (INGST-05 / GAME-01 backstop, PLAN 02-04 D9)
expected: |
  A fixture with a known StartTime (epoch ms), once upserted by FixturesCronService and
  read back from Postgres, yields the exact same instant — no timezone shift, no ms truncation.
awaiting: user response

## Tests

### 1. starts_at timestamptz round-trip precision (INGST-05 / GAME-01 backstop)
expected: A fixture with a known StartTime, once upserted by FixturesCronService and read back from Postgres, yields the exact same instant (no timezone shift, no ms truncation).
why_human: Code path (`new Date(fixture.StartTime)` → TypeORM `timestamptz`) is structurally correct by inspection and unit-tested only against a mocked repository; PLAN marks it `verification: backstop` and 02-04-SUMMARY flags `human_judgment: true` — no live DB round-trip assertion exists in the suite.
result: [pending]

### 2. Genuinely-blocked socket abort within SIGTERM grace (INGST-04 / 02-05 D7)
expected: Killing the process (or calling `onApplicationShutdown()`) while a real socket `reader.read()` is blocked causes the read to reject/throw immediately rather than hanging until an OS-level timeout.
why_human: PLAN 02-05 marks this `verification: backstop`; 02-05-SUMMARY (D7) flags `human_judgment: true` — unit specs only prove a mocked-fetch AbortSignal propagates, weaker than an OS-level stalled read genuinely being aborted. Standard undici/fetch behavior, but not observed against a real stalled connection here.
result: [pending]

### 3. Live SSE ingest against the real TxLINE origin (02-05 D8)
expected: With real TXLINE_GUEST_JWT/TXLINE_API_TOKEN in `.env`, a live game's SSE connection authenticates, receives real feed frames, and each is normalized/persisted/state-applied identically to the replay path, with no crash on real production message shapes.
why_human: 02-05-SUMMARY (D8) designates this best-effort/non-blocking, `human_judgment: true` — all automated tests mock the fetch layer; the real feed has never been exercised end-to-end. Pipeline correctness is otherwise proven via the real-Postgres 20× replay e2e (Source B); only the live-source-specific behavior (real headers, backoff/watchdog vs production infra) is unconfirmed.
result: [pending]

### 4. Boot-recovery RCVR-01 vs RCVR-02 state equivalence (PLAN 02-07 backstop)
expected: Rebuilding a game's state from persisted `game_event` rows via `GameStateMachine.applyEvent()` (RCVR-01) and rebuilding the same game's state by replaying the same messages through a live/resumed connection (RCVR-02) produce identical GameState objects (score, possession stage, attackRun, lastSeq, connectionId).
why_human: PLAN 02-07 marks this `verification: backstop` — both paths call the SAME `GameStateMachine.applyEvent()`, a strong structural equivalence argument, but no test exercises both paths side-by-side on one event sequence and diffs the result.
result: [pending]

### 5. Manual-DB-flip demo control surface, end-to-end (D-06 demo choreography)
expected: `UPDATE` a past-game row to `is_replay=true, status='scheduled', starts_at=now()+~3min`; the ~15s SourceSchedulerService poll picks it up and a full replay plays through to a visible finished game (with downstream answers/points/leaderboard once later phases land).
why_human: 02-07-SUMMARY (D3) flags `human_judgment: true` — proven at the unit level (one query, one is_replay branch, no separate manual-flip code path), but a live operator-driven full run (DB UPDATE → app running → visible browsable replay → completed match) has not been executed.

result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
