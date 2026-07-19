# Phase 2: Feed Ingest, Replay & State Machine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-17
**Phase:** 02-feed-ingest-replay-state-machine
**Areas discussed:** Replay demo source, Ingest game selection, Fixtures discovery filter, Seq-gap void stub

---

## Replay demo source

| Option | Description | Selected |
|--------|-------------|----------|
| NDJSON file, committed | Capture once, commit .ndjson; deterministic offline demo | |
| Historical fetch at runtime | Pull historical feed from TxLINE each time | ✓ |
| Both paths, file-first | Emitter reads NDJSON; separate fetch-and-cache step | |

**User's choice:** Historical fetch at runtime (later widened — see final row)

| Option | Description | Selected |
|--------|-------------|----------|
| Cache to disk after first fetch | Gitignored cache file survives restarts | |
| In-memory only | Fetch once per process lifetime | ✓ |
| No cache | Fetch fresh every replay start | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dev script + fixture ID arg | npm run replay:create -- <id> [--speed] | ✓ |
| Env-configured fixture | REPLAY_FIXTURE_ID auto-creates at boot | |
| Dev-only HTTP endpoint | POST /dev/replay guarded by NODE_ENV | |

**Notes:** User added hard constraint — replay flow must never affect realtime event flow; main logic identical in realtime and replay modes.

| Option | Description | Selected |
|--------|-------------|----------|
| 1× default, script arg override | Real pacing default; --speed for tests | ✓ |
| Fast default for testing | 10× default, explicit 1× for demo | |
| Fixed 1× only | No speed knob | |

| Option | Description | Selected |
|--------|-------------|----------|
| Compress pre-match, keep events | Quick pre-match burst, real pacing from kickoff | |
| Full original pacing | Everything at original gaps | ✓ |
| Skip pre-match entirely | Start at kickoff | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — adopt both sources | Source A historical fetch primary; Source B NDJSON/event-rows fallback | ✓ |
| Keep fetch-only | Historical fetch only replay source | |

**Notes:** User pasted a consolidated replay-mode design from a prior session (scheduler rule, rebasing, wall-clock TTLs, +3min choreography, no VirtualFixture, 19 captured matches, demo-reel guidance). Adopted in full; it amended the earlier fetch-only answer to the two-source model.

---

## Ingest game selection

| Option | Description | Selected |
|--------|-------------|----------|
| All discovered live games | Every discovered game ingested when live | |
| Env allowlist | INGEST_FIXTURE_IDS limits ingestion | |
| Cap by count | At most N concurrent | |

**User's choice:** Free-text — feed currently has NO live/upcoming events; discovery must fetch upcoming AND N past games so past games can be replayed by flipping `game.is_replay → true`; the app must notice the flip and start streaming/processing.

| Option | Description | Selected |
|--------|-------------|----------|
| Discover past N + clone into replay row | Fresh is_replay row per take | |
| Discover past N + flip is_replay directly | Replay into the flipped row itself | ✓ |
| No past discovery — manual fixture IDs | Hand-supplied IDs only | |

**Notes:** User plans to flip values manually in the DB for demo recording.

| Option | Description | Selected |
|--------|-------------|----------|
| One-UPDATE arm + auto-wipe | Poll ~15s; single UPDATE arms; wipe prior events on start | ✓ |
| Arm on is_replay flip alone | Implicit auto-scheduling on flip | |
| No wipe — fresh row per take | Manual row duplication for re-takes | |

| Option | Description | Selected |
|--------|-------------|----------|
| N=20 env-tunable; ingest all live | PAST_FIXTURES_COUNT=20 default; all-live policy | ✓ |
| N=5 minimal; ingest all live | Leaner list | |
| N env-tunable; live allowlist too | Extra INGEST_FIXTURE_IDS control | |

---

## Fixtures discovery filter

| Option | Description | Selected |
|--------|-------------|----------|
| No filter — take everything | Every soccer fixture TxLINE returns | ✓ |
| Competition allowlist env | COMPETITION_FILTER limits rows | |

| Option | Description | Selected |
|--------|-------------|----------|
| 48h ahead; upsert-only | Short horizon | |
| 7 days ahead; upsert-only | Longer browsable horizon | ✓ |
| 48h + mark vanished | Reconciliation flagging | |

---

## Seq-gap void stub

| Option | Description | Selected |
|--------|-------------|----------|
| Typed internal event + log-only handler | GameStreamGapDetected contract now; Phase 4 swaps handler | ✓ |
| Log-only TODO | Warn-log inline, no contract | |
| You decide | Claude picks during planning | |

---

## Claude's Discretion

- Event-bus mechanism for the gap event (plain typed emitter vs Nest event emitter)
- `stream_cursor` flush cadence N (INGST-04)
- Scheduler poll interval exact value (~15s guidance)
- State-machine debug logging verbosity

## Deferred Ideas

None — discussion stayed within phase scope.
