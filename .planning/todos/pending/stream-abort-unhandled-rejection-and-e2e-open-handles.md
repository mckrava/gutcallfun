---
title: Unhandled AbortError risk on stream stop + pre-existing e2e open handles
created: 2026-07-18
source: Phase 2 UAT verification session
related_requirements: [INGST-02, INGST-04]
severity: low-probability crash risk + test hygiene
---

## Two separate residual observations

### 1. Unhandled `AbortError` when a live SSE stream is aborted (low probability, real hazard)

**Observed once.** During a full `npm run test:e2e` run while a game was `live` with a genuine
established TxLINE SSE connection, the Node process died with:

```
DOMException [AbortError]: This operation was aborted
    at triggerUncaughtException(err, true /* fromPromise */)
```

**Could NOT be reproduced** in a narrower repeat (single spec, SSE not yet fully established
before force-exit), so it is timing-dependent — it appears to need the fetch resolved and
`reader.read()` actively pending at the moment abort fires.

**Structural hazard that makes it plausible** — `stream-manager.service.ts:57`:

```ts
void this.runConnection(gameId, controller.signal, false).finally(() => { ... });
```

`void` + `.finally()` does **not** handle a rejection — `.finally()` returns a promise that
rejects if the original rejects, and `void` merely discards it. Any rejection escaping
`runConnection` therefore becomes an unhandled rejection.

`connectWithRetry` does swallow non-`AUTH_EXPIRED` errors and breaks cleanly on
`signal.aborted`, so the common paths are covered — the risk is a rejection surfacing from the
abort-time `fetch()`/`reader.read()`/`reader.cancel()` interaction added by the CR-02 fix.

**Why it did not affect the SIGTERM test:** there the process was terminating anyway, so a
late unhandled rejection is harmless (measured clean exit in 24 ms). The dangerous case is
`stop(gameId)` aborting ONE game's stream while the process keeps running.

**Suggested fix (small):** attach a real `.catch()` to the fire-and-forget dispatch and
explicitly ignore `AbortError`:

```ts
void this.runConnection(gameId, controller.signal, false)
  .catch((err: unknown) => {
    if ((err as { name?: string })?.name === 'AbortError') return; // expected on stop/shutdown
    this.logger.error(`Game ${gameId}: stream connection failed`, err as Error);
  })
  .finally(() => { ... });
```

Note the same fire-and-forget-without-catch shape exists where callers invoke
`streamManager.start(gameId)` (`GameStateRebuildService`, `SourceSchedulerService`) — worth
auditing together.

### 2. Jest e2e needs `--forceExit` (pre-existing, not a regression)

`npm run test:e2e` does not exit on its own:

```
A worker process has failed to exit gracefully and has been force exited.
```

Both specs **pass** (2/2) — this is teardown hygiene, not a test failure. The warning was
present as far back as the Wave 3 verification, so it predates the CR-01/CR-02 work. Likely
causes: `@nestjs/schedule` cron timers (1-min fixtures cron, 15s source scheduler) and/or the
TypeORM pool not being torn down, with no `.unref()`.

Worth adding `--forceExit` to the `test:e2e` script or fixing teardown so CI does not hang.
Note that with real open handles, a genuine unhandled rejection (issue 1) can surface as a
hang or a crash depending on timing — fixing this makes issue 1 easier to detect.
