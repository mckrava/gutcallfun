---
title: Restarting the app mid-replay orphans the game permanently
created: 2026-07-18
source: Phase 2 restart-recovery verification (user-observed)
related_requirements: [RCVR-01, RCVR-02, RPLY-02]
severity: operational — demo risk, not a spec violation
---

## Observed

1. Armed game 22 (fixture 18237038) — `is_replay=true`, `status='scheduled'`
2. App picked it up, flipped it to `live`, ingested 31 events
3. Stopped the app, started it again
4. **Replay never resumed.** Game sits at `status=live`, `stream_cursor=31`, no source running.

## Why

`GameStateRebuildService.rebuildOne()` rebuilds in-memory state from the persisted
log (RCVR-01 — works), then:

```ts
if (game.isReplay) {
  // D-02: is_replay is the sole source switch — recovery must never
  // start the WRONG source. A replay game is not resumed via SSE.
  return;
}
this.streamManager.start(game.id);   // live games DO resume here (RCVR-02)
```

`SourceSchedulerService` only selects `status = SCHEDULED`, so a `live` game is
never re-dispatched either. The replay is stranded with no source.

## Correct by spec, gap in practice

- **Live (non-replay) games resume correctly** — RCVR-02 reconnects SSE from the persisted cursor. Not affected.
- RCVR-01 ("rebuild in-memory state") is satisfied for replay games too.
- RCVR-02 says "reconnect **the SSE stream**" — SSE-specific, so replay resume was never in Phase 2 scope.

The skip's reasoning is sound (never start the wrong source, D-02) but the code
only implements *"don't start the wrong source"* — it never implements
*"start the right one"*.

## Impact

- Restarting mid-replay kills the run; no automatic recovery path exists.
- Manual recovery re-arms from scratch, NOT from the cursor: flipping back to
  `status='scheduled'` triggers D-07 auto-wipe, deleting persisted events and
  replaying the whole match from the top.
- There is currently no resume-from-cursor path for replay at all, by design
  (D-07 treats replay rows as disposable).

## Workaround (sufficient for the demo)

Do not restart the server mid-replay. If it happens:
```sql
UPDATE game SET status='scheduled', starts_at=now() WHERE id=<id>;
```
It restarts cleanly from the beginning within ~15s.

## Options if this is ever worth fixing

| | Approach | Cost |
|---|---|---|
| A | Leave as-is, documented (current choice) | zero |
| B | Boot recovery re-drives replay games from the start (wipe + full replay) | small — one branch in `rebuildOne`, consistent with D-07 disposability |
| C | True resume from `stream_cursor` (skip to `seq > cursor` in the fetched array) | larger — needs a resume-vs-D-07-wipe decision |
