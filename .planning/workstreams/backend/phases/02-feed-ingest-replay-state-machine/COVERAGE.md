# API Coverage — TxLINE Scores Product API

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Phase 02 consumes the TxLINE off-chain API (fixtures snapshot, SSE stream, historical fetch, auth chain) and the Scores Product v1.1 message surface. Every capability below is either INTEGRATE (default) or OPT-OUT with a one-line reason.

## Endpoints

| capability | decision | reason |
|---|---|---|
| guest-JWT / X-Api-Token auth chain (`POST /auth/guest/start`, `POST /api/token/activate`, `Authorization: Bearer` + `X-Api-Token` headers, 401→refresh-once-retry) | INTEGRATE | INGST-01; credentials from git-ignored `.env` (never logged/committed) |
| on-chain Solana `subscribe()` step of the auth chain | OPT-OUT | one-time out-of-band setup; credentials already land in `.env` (CLAUDE.md); NestJS runtime never performs the on-chain transaction |
| token purchase (`POST /api/guest/purchase/quote`) | OPT-OUT | not needed at runtime; subscription funded out-of-band before the hackathon |
| fixtures snapshot (`GET /api/fixtures/snapshot`) | INTEGRATE | GAME-01; forward-only window — past fixtures pulled via `startEpochDay = today − PAST_FIXTURES_COUNT` (RESEARCH Pitfall 1) |
| SSE scores stream (`GET /api/scores/stream[?fixtureId=]`) | INTEGRATE | INGST-02; ported `upstream.ts`, Last-Event-ID resume, 30s idle watchdog, backoff |
| historical fetch (`GET /api/scores/historical/{fixtureId}`) | INTEGRATE | RPLY-01 replay Source A (retention window 2wk–6h; Source B fallback covers gaps — RESEARCH Pitfall 2) |
| odds / Stable Price endpoints (`/api/odds/*`) | OPT-OUT | GutCall is scores-driven micro-predictions; odds are out of product scope |
| Merkle on-chain validation endpoints | OPT-OUT | trust-the-vendor for a hackathon demo; on-chain proof verification is not a product requirement |
| 5-min interval snapshot/update endpoints | OPT-OUT | superseded by live SSE + historical full-log fetch; no incremental-snapshot consumer this phase |

## Message actions (Scores Product v1.1 surface)

| capability | decision | reason |
|---|---|---|
| `goal` (Confirmed:false → Confirmed:true) | INTEGRATE | state-machine score + goal confirm/discard timing (STAT-01, goals.ts port) |
| `action_amend` / `action_discarded` (Id-keyed corrections) | INTEGRATE | dedup/reconcile on `Id`, anchor-to-earliest (RESEARCH Pitfall 3); stored raw + reconciled in state machine |
| possession ladder (`safe_possession`, `attack_possession`, `danger_possession`, `high_danger_possession`) | INTEGRATE | possession stage / attack run (STAT-01, possession.ts port) |
| `possession` (ball-holder-change marker) | INTEGRATE | stored raw; explicitly NOT classified as a danger stage (RESEARCH Anti-Pattern) |
| `status` (StatusId transitions, incl. 100 observed) | INTEGRATE | INGST-05 `current_status_id` lazy fill; clock/period logic |
| `jersey` (pre-match `Data.Color`) | INTEGRATE | INGST-05 lazy fill of `team1/2_jersey_color` |
| `score_adjustment` | INTEGRATE | INGST-05 treated as authoritative score resync |
| `shot` (deduped by action Id) | INTEGRATE | stored raw + fed to state machine; high-water-mark rung consumed by Phase 4 (WNDW-04) |
| cards (yellow/red), VAR review/overturn | INTEGRATE (store raw) | persisted append-only in `game_event` (full raw payload jsonb) and fed to the state machine; VAR overturn is part of the ideal demo reel (CONTEXT Specifics). No promoted-column projection beyond what the schema already provides — read from raw payload downstream |
| lineups / substitutions (`FollowsAction` links) | OPT-OUT (store raw only) | persisted raw in `game_event` but not promoted/projected this phase — no lineup consumer until a later milestone (CUT list) |
| unknown / future `Action` or `StatusId` values | INTEGRATE | INGST-03: stored with full raw payload and ignored, never crash the stream (defensive-parse requirement) |

*Note: "store raw only" opt-outs still persist the complete message to `game_event.payload` (append-only, replay-integrity). Opt-out means "not promoted to a dedicated column / not acted on this phase," never "dropped."*
