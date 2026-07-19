---
phase: 02-feed-ingest-replay-state-machine
reviewed: 2026-07-17T22:19:07Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - apps/gutcallfun-core/src/config/app-config.schema.ts
  - apps/gutcallfun-core/src/app.module.ts
  - apps/gutcallfun-core/src/modules/ingest/ingest.module.ts
  - apps/gutcallfun-core/src/modules/ingest/shared/ingest-shared.module.ts
  - apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.event.ts
  - apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.emitter.ts
  - apps/gutcallfun-core/src/modules/ingest/events/game-stream-gap.listener.ts
  - apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.ts
  - apps/gutcallfun-core/src/modules/ingest/state/game-state.registry.ts
  - apps/gutcallfun-core/src/modules/ingest/state/game-state.types.ts
  - apps/gutcallfun-core/src/modules/ingest/state/clock.ts
  - apps/gutcallfun-core/src/modules/ingest/state/possession.ts
  - apps/gutcallfun-core/src/modules/ingest/state/goals.ts
  - apps/gutcallfun-core/src/modules/ingest/state/game-state.machine.ts
  - apps/gutcallfun-core/src/modules/ingest/persistence/message-normalizer.ts
  - apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.ts
  - apps/gutcallfun-core/src/modules/ingest/pipeline/pipeline.module.ts
  - apps/gutcallfun-core/src/modules/ingest/fixtures/txline-http.client.ts
  - apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.ts
  - apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures-cron.service.ts
  - apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures.module.ts
  - apps/gutcallfun-core/src/modules/ingest/stream/upstream.ts
  - apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.ts
  - apps/gutcallfun-core/src/modules/ingest/stream/stream.module.ts
  - apps/gutcallfun-core/src/modules/ingest/replay/replay.ts
  - apps/gutcallfun-core/src/modules/ingest/replay/historical.client.ts
  - apps/gutcallfun-core/src/modules/ingest/replay/replay-source.service.ts
  - apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.ts
  - apps/gutcallfun-core/src/modules/ingest/replay/replay.module.ts
  - apps/gutcallfun-core/scripts/replay-create.ts
  - apps/gutcallfun-core/src/modules/ingest/recovery/source-scheduler.service.ts
  - apps/gutcallfun-core/src/modules/ingest/recovery/game-state-rebuild.service.ts
  - apps/gutcallfun-core/src/modules/ingest/recovery/recovery.module.ts
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-17T22:19:07Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Reviewed the source-agnostic TxLINE ingest → append-only `game_event` log →
in-memory state-machine backbone (Plan 01–07 deliverables). No leaked
credentials were found anywhere in the ported/adapted code
(`upstream.ts`, `txline-http.client.ts`, `possession.ts`, `goals.ts`,
`replay.ts`) — the never-log-credentials invariant holds. The defensive
normalization layer (`message-normalizer.ts`, `possession.ts`, `goals.ts`,
`game-state.machine.ts`) is thoroughly guarded with try/catch and typeof
checks and does appear to never throw on malformed/unknown input. The
two-clock discipline (`clock.ts`) is respected inside `possession.ts` and
`game-state.machine.ts` — no stray `Date.now()` in match-time logic.

Two BLOCKER-level defects were found, both concrete and demonstrable:

1. `FixturesCronService.upsertAll()`'s "existing row" branch does a
   read-modify-write via `Repository.save()` on a fully-loaded entity, which
   races with `SourceSchedulerService`'s atomic `status` claim and with
   `EventIngestService`'s per-event `game` row updates — a currently-*live*
   game is re-discovered every single cron tick (it still matches
   `fetchPast`'s `StartTime <= now` filter) and its score/cursor/status can
   be silently reverted to a stale snapshot.
2. `connectWithRetry`/`runSingleStream` in `upstream.ts` never threads the
   caller's `AbortSignal` into the actual `fetch()` call or the
   `reader.read()` loop — only into the inter-reconnect `sleep()`. This
   means `StreamManagerService.stop()` / `onApplicationShutdown()` does
   **not** interrupt an actively-connected stream, contradicting that
   service's own doc comment ("A blocked `reader.read()` throws immediately
   once its controller aborts").

Five WARNING-level robustness/completeness gaps and two INFO items round out
the findings below.

## Critical Issues

### CR-01: Fixtures-discovery cron's full-entity `save()` races with concurrent status/score/cursor writes and can silently revert them

**File:** `apps/gutcallfun-core/src/modules/ingest/fixtures/fixtures-cron.service.ts:56-70`

**Issue:**
`upsertAll()`'s "existing row" branch loads the full `GameEntity` via
`findOne`, mutates a handful of metadata fields, and calls
`this.gameRepo.save(existing)`. TypeORM's `Repository.save()` on an
already-loaded entity issues an UPDATE for **every** column present on the
in-memory object — not just the fields explicitly reassigned — using
whatever values were captured at `findOne()` time.

`FixturesCronService` runs every minute (`CronExpression.EVERY_MINUTE`) and
calls both `fetchUpcoming()` and `fetchPast()`. `fetchPast()` returns *every*
fixture whose `StartTime <= now` (see `txline-fixtures.client.ts:70-79`) —
this includes fixtures that are currently **live**, not just ones that have
actually finished, because there is no end-time signal available. So a
currently-live game (already claimed by `SourceSchedulerService`, already
being ingested by `EventIngestService` with `score1`/`score2`/`streamCursor`
actively advancing) is re-discovered by this cron on every tick and goes
through the `existing`/`save()` branch.

Two independent writers race on the same row:
- `SourceSchedulerService.startGame()` performs an atomic conditional
  `UPDATE ... SET status='live' WHERE id=:id AND status='scheduled'`
  (`source-scheduler.service.ts:63-69`) specifically to guard against
  double-dispatch.
- `EventIngestService.processEvent()` updates `streamCursor`,
  `streamCursorAt`, `scoreP1`, `scoreP2`, `currentStatusId` in the SAME
  transaction as every persisted event (`event-ingest.service.ts:98-113`).

If either of those writes lands between `FixturesCronService`'s `findOne()`
and its `save(existing)` for the same row, the full-entity `save()` writes
back the **stale** `status`/`scoreP1`/`scoreP2`/`streamCursor` values
captured at read time — silently reverting a live→scheduled status flip
(causing `SourceSchedulerService` to re-dispatch and open a second stream
connection for the same game) or regressing the denormalized score/cursor
mid-match. This is exactly the kind of "cursor-flush / same-transaction"
correctness property the phase's own N=1 design (`event-ingest.service.ts`)
was built to protect, undone by a second, unrelated writer.

**Fix:** Use a targeted partial `update()` instead of a full-entity
`save()`, so the cron only ever touches the columns it actually owns:

```typescript
// fixtures-cron.service.ts, existing-row branch
if (existing) {
  await this.gameRepo.update(
    { id: existing.id },
    {
      startsAt: new Date(fixture.StartTime),
      team1Name: fixture.Participant1,
      team2Name: fixture.Participant2,
      competition: fixture.Competition,
      fixtureGroupId: fixture.FixtureGroupId,
      participant1Id: fixture.Participant1Id,
      participant2Id: fixture.Participant2Id,
      participant1IsHome: fixture.Participant1IsHome,
    },
  );
  continue;
}
```

This removes the read-then-write race entirely — no other writer touches
these particular columns, so a partial UPDATE is safe and does not require
a transaction/lock.

---

### CR-02: AbortSignal is never wired into the actual SSE connection — `stop()`/shutdown does not interrupt an active stream

**File:** `apps/gutcallfun-core/src/modules/ingest/stream/upstream.ts:412-534` (root cause), `apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.ts:76-99` (incorrect invariant claim / affected caller)

**Issue:**
`connectWithRetry()` accepts a `signal?: AbortSignal` and correctly uses it
to gate the reconnect loop (`while (!signal?.aborted)`) and to short-circuit
the inter-reconnect `sleep()` (`upstream.ts:356-369`). However, `signal` is
**never** passed into `runSingleStream()` — `SingleStreamOpts`
(`upstream.ts:373-397`) has no `signal` field at all, and the `fetch()` call
inside `runSingleStream` omits it:

```typescript
// upstream.ts:423 — no `signal` in the fetch init object
const response = await opts.fetchImpl(opts.endpoint, { method: 'GET', headers });
```

The only thing that can interrupt an in-progress `reader.read()` inside
`runSingleStream` is the **idle watchdog** (`resetWatchdog()`, fires after
30s of silence) — the abort signal is not consulted anywhere in the read
loop (`upstream.ts:472-530`).

Consequently, calling `StreamManagerService.stop(gameId)` or
`onApplicationShutdown()` (`stream-manager.service.ts:69-99`) only sets
`controller.abort()`, which:
- Immediately interrupts the connection *only* if it currently happens to be
  in the backoff `sleep()` between reconnect attempts.
- Does **nothing** to an actively-connected, actively-receiving stream — it
  will keep consuming SSE chunks (and calling `handleEvent` →
  `processEvent`) until the far end closes the connection or up to 30s of
  silence elapses, whichever comes first. `connectWithRetry`'s `if
  (signal?.aborted) break;` check (line 628) is only reached *after*
  `runSingleStream()` returns, so it cannot help while a read is blocked.

This directly contradicts `stream-manager.service.ts`'s own documented
invariant: *"A blocked `reader.read()` throws immediately once its
controller aborts, so the process observes SIGTERM instead of hanging past
the grace window."* That claim is false as implemented. Effects:
- SIGTERM/`onApplicationShutdown()` can take far longer than expected (up to
  the watchdog window, or indefinitely for a chatty stream) to actually
  release its socket, risking the process being force-killed by the
  orchestrator before it exits cleanly.
- `stop(gameId)` removes the controller from the `Map` immediately
  (`stream-manager.service.ts:69-74`) while the underlying connection may
  still be alive in the background; a subsequent `start(gameId)` for the
  same game (e.g. a fast is_replay flip-flop, or a recovery reconnect) opens
  a **second**, fully independent SSE connection for the same fixture while
  the first is still delivering events — both feed the same
  mutex-serialized `processEvent()`, so no data corruption results, but it
  is an unbounded-connection leak and doubles TxLINE stream bandwidth/load
  per affected game until the orphaned connection's watchdog eventually
  fires.

**Fix:** Thread `signal` all the way into the actual fetch call and hook it
to `reader.cancel()`, mirroring the pattern already used for `sleep()`:

```typescript
// SingleStreamOpts
interface SingleStreamOpts {
  // ...
  signal?: AbortSignal;
}

// runSingleStream
const response = await opts.fetchImpl(opts.endpoint, {
  method: 'GET',
  headers,
  signal: opts.signal,
});
// ...
const reader = response.body.getReader();
const onAbort = () => {
  try {
    reader.cancel();
  } catch {
    // ignore — reader may already be closed
  }
};
opts.signal?.addEventListener('abort', onAbort, { once: true });
try {
  // existing read loop
} finally {
  opts.signal?.removeEventListener('abort', onAbort);
  if (watchdogTimer !== undefined) clearTimeout(watchdogTimer);
}

// connectWithRetry: pass signal through
await runSingleStream({ jwt, apiToken, lastEventId, endpoint: ..., fetchImpl, onEvent, onMeta, watchdogMs, signal, onLastEventId, onConnected, onConnectInfo });
```

Also correct or remove the now-inaccurate claim in
`stream-manager.service.ts:88-92` once the fix lands.

## Warnings

### WR-01: Duplicate (ignored) inserts still unconditionally re-apply cursor/lazy-fill/state-machine side effects

**File:** `apps/gutcallfun-core/src/modules/ingest/persistence/event-ingest.service.ts:79-118`

**Issue:** `processEvent()`'s transaction inserts the event row with
`.orIgnore()` — so a duplicate `(gameId, seq)` correctly leaves exactly one
`game_event` row — but the very next statement in the *same* transaction
unconditionally overwrites `game.stream_cursor`/`stream_cursor_at` and
applies `lazyFillPatch` regardless of whether the insert actually happened.
`this.stateMachine.applyEvent(state, rawObj)` is likewise called
unconditionally afterward. Today this is idempotent-safe only because every
downstream mutation happens to be a plain assignment of a value derived
from *this specific message* rather than an increment — but nothing in the
code enforces that a message being reprocessed is the *same or newer* one.
If a genuinely out-of-order redelivery ever occurs (e.g. two connections
briefly overlapping during a future refactor, or an upstream at-least-once
delivery quirk that resends an *older* Seq after a newer one was already
committed), `state.lastSeq`/`state.lastFeedTs`/`game.stream_cursor` would
all silently regress to the older value, corrupting the next
`detectGap()` baseline and the SSE resume cursor.

**Fix:** Check whether the insert actually affected a row before applying
the cursor/lazy-fill/state-machine side effects, e.g. via
`insertResult.identifiers.length` (or, more robustly, an explicit
`ON CONFLICT ... DO NOTHING RETURNING id` check), and additionally guard
`GameStateMachine.applyEvent`'s `lastSeq`/`lastFeedTs` writes with a
`>=` monotonicity check against the current state so a stale/duplicate
message can never move the cursor backward even if it does get reprocessed.

### WR-02: `GameMutexRegistry`/`GameStateRegistry`/`GameStateMachine` eviction is dead on the live-game path

**File:** `apps/gutcallfun-core/src/modules/ingest/state/game-mutex.registry.ts:31-33`, `apps/gutcallfun-core/src/modules/ingest/state/game-state.registry.ts:24-27`, `apps/gutcallfun-core/src/modules/ingest/state/game-state.machine.ts:148-151`

**Issue:** All three registries document `remove(gameId)` explicitly as
"Eviction for finished/cancelled games — bounds Map growth ... (RESEARCH
Security Domain)". A grep of the whole `src/` tree shows `remove()` is only
ever called from `ReplayStarterService.wipeAndResetGame()`
(`replay-starter.service.ts:127-128`) — i.e. only on the replay-restart
path. There is no caller anywhere that evicts these maps when a **live**
(`is_replay=false`) game finishes or is cancelled; nothing in this phase (or
visible in the reviewed files) transitions a game's status away from
`live`. The documented invariant these `remove()` methods exist to satisfy
is therefore unenforced for the primary (live) code path — every live game
that has ever been ingested keeps its `Mutex`, `GameState`, `AttackStore`,
and `GoalStore` in memory for the lifetime of the process.

**Fix:** Wire eviction into whatever future finished/cancelled transition
lands (likely Phase 4+), or at minimum leave a tracked TODO/seam comment
noting this is an intentional Phase-2 scope cut rather than an already-solved
concern — the current comments assert the invariant is met when it isn't yet
wired up anywhere.

### WR-03: `MessageNormalizer.isStale()` / `STALENESS_THRESHOLD_MS` are unreferenced — the documented SL=1 regrade safety net never runs

**File:** `apps/gutcallfun-core/src/modules/ingest/persistence/message-normalizer.ts:69-74,168-174`, `apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.ts:177-189`

**Issue:** `isStale(feedTs, receivedAt)` is documented as "a secondary
runtime signal in case the feed silently regrades mid-stream" (below
SERVICE_LEVEL_ID's boot-time SL=12 assertion). It is never called anywhere
in `src/` outside its own definition/spec. `StreamManagerService.handleEvent`
receives `receivedAt` from the SSE layer but discards it (parameter is
literally named `_receivedAt`, `stream-manager.service.ts:177`), so there is
no code path that ever computes `isStale(...)`, let alone acts on it. The
"secondary signal" this constant/method exist to provide is dead code as
shipped.

**Fix:** Either wire `isStale()` into `EventIngestService.processEvent`
(passing `receivedAt` through from `handleEvent`) and log/alert on
detection, or remove the unused method/constant and note the staleness
guard is boot-time-only for this phase.

### WR-04: Replay event-processing failures abort the entire replay with no recovery, unlike the live SSE path

**File:** `apps/gutcallfun-core/src/modules/ingest/replay/replay.ts:115-128`, `apps/gutcallfun-core/src/modules/ingest/replay/replay-starter.service.ts:89-96`, `apps/gutcallfun-core/src/modules/ingest/stream/stream-manager.service.ts:177-189`

**Issue:** On the live path, `StreamManagerService.handleEvent()` wraps
`processEvent()` in a `.catch()` (`stream-manager.service.ts:186-188`) so a
single transient failure (e.g. a momentary DB blip) logs an error but does
not kill the connection — the next message is still processed. On the
replay path, `emitReplay()`'s loop does `await onEvent(rebased)` with no
try/catch (`replay.ts:127`), and `ReplayStarterService.start()`'s `onEvent`
callback directly `await`s `processEvent()` with no guard
(`replay-starter.service.ts:92-95`). A single transient failure anywhere in
a replay run therefore throws out of `emitReplay()`, out of
`ReplayStarterService.start()`, and is only caught far upstream by
`SourceSchedulerService.startGame()`'s `.catch()`
(`source-scheduler.service.ts:88-93`), which just logs it — the replay
stops permanently mid-match, and the game is left at `status='live'` with
no active source and no automatic retry (this phase has no
finished/cancelled transition, so the row is now stuck).

**Fix:** Either catch-and-log-and-continue inside `emitReplay`'s per-event
call (matching the live path's fault tolerance), or catch inside
`ReplayStarterService.start()`'s `onEvent` callback and decide explicitly
whether to skip-and-continue vs abort — right now the behavior differs from
the live path with no documented rationale, which is a real demo-day risk
(a single blip during a recorded fallback replay kills the whole
takeaway feed).

### WR-05: `TxlineFixturesClient.fetchPast` mislabels in-progress fixtures as `finished`, permanently excluding them from live dispatch

**File:** `apps/gutcallfun-core/src/modules/ingest/fixtures/txline-fixtures.client.ts:70-79`

**Issue:** `fetchPast()` filters to `fixture.StartTime <= now` and maps
every result to `GameStatus.FINISHED` (there is no end-time field available
from the feed to distinguish "finished" from "currently live"). If a
fixture is discovered for the **first time** by `fetchPast` (e.g. the
process starts up mid-match, or the fixture wasn't returned by
`fetchUpcoming` in a prior tick due to the 7-day window boundary), it is
INSERTed with `status=FINISHED`. `SourceSchedulerService.dispatchDueGames()`
only ever queries `status=SCHEDULED` rows
(`source-scheduler.service.ts:41-45`), so this row will never be picked up
for live/replay dispatch — the match is silently never ingested.

**Fix:** Either don't default first-seen already-started fixtures straight
to `FINISHED` (e.g. mark them `SCHEDULED` with `starts_at` in the past so
the scheduler still claims them and lets the state machine catch up from
whatever point the feed is at), or explicitly document this as an accepted
gap for fixtures discovered after their advertised kickoff.

## Info

### IN-01: `HistoricalClient`'s in-memory cache has no TTL and can permanently cache a premature empty result

**File:** `apps/gutcallfun-core/src/modules/ingest/replay/historical.client.ts:37-70`

**Issue:** `fetch()` caches by `fixtureId` for the lifetime of the process,
including a legitimately-empty-but-successful response (as opposed to a
thrown error, which is correctly *not* cached). If `HistoricalClient.fetch`
is ever called for a fixture before TxLINE's historical endpoint has
ingested any data for it (e.g. an operator arms a replay too close to a
match's real kickoff), the empty result is cached forever, and all
subsequent calls for that `fixtureId` will keep falling back to Source B
even after real historical data becomes available upstream. Low risk given
this phase's typical "browse already-finished match, then replay" demo
flow, but worth a comment or short TTL if replay-arming near-live fixtures
becomes a supported flow.

**Fix:** Consider not caching zero-length successful responses, or add a
short TTL, if arming replays for very-recently-started fixtures becomes a
supported scenario.

### IN-02: `connectUpstream` (one-shot variant) is unused dead code in production paths

**File:** `apps/gutcallfun-core/src/modules/ingest/stream/upstream.ts:177-269`

**Issue:** `connectUpstream()` is explicitly documented as "Kept for
reference-repo fidelity; `StreamManagerService` (Plan 05) drives the
retry-aware `connectWithRetry` below rather than this one-shot variant." A
grep confirms nothing in `src/` calls it outside its own spec file. This is
intentional per the docstring, so not a defect, but it duplicates the SSE
parsing/measurement-gate logic that `runSingleStream` also implements — a
future edit to one (e.g. the CR-02 fix above) will not automatically apply
to the other, which is worth flagging so a future contributor doesn't
assume both share the same behavior.

**Fix:** No action required if intentionally kept for fidelity; consider a
one-line note that any future signal/measurement-gate fix to
`runSingleStream` should be mirrored here or this function should be
removed once fidelity is no longer needed.

---

_Reviewed: 2026-07-17T22:19:07Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
