# Requirements: GutCall Backend (gutcallfun-core)

**Defined:** 2026-07-17
**Core Value:** The live loop works end-to-end and is demoable from replay: TxLINE ingest → trusted `game_event` log → state machine → prediction windows → resolution → points → WS push.

## v1 Requirements

Requirements for the hackathon submission (feature freeze evening July 17; deploy July 18; submit July 19). Each maps to roadmap phases.

### Foundation (DATA)

- [x] **DATA-01**: TypeORM models + migrations reproduce `initial-request-src/initial-db-structure.sql` exactly — `gen_random_uuid()` defaults, hand-named enum types (`game_status`, `question_state`, `question_type`), partial unique indexes (`uq_game_fixture_live`, `uq_gq_one_open_per_game`) as raw SQL in migrations, `game_question_outcome` seeded (fizzles/danger/shot/goal, ladder 1-4) in the same migration
- [x] **DATA-02**: Env-validated config module (class-validator + `plainToInstance`/`validateSync`, `@Global()` AppConfig) following the hydration-data-feeds pattern; app refuses to boot on invalid env
- [x] **DATA-03**: TypeORM wired via shared DataSource file usable by both app bootstrap and migration CLI (`tsx` for dev, compiled JS for prod); `typeorm` pinned to 0.3.31 (never `latest` — 1.x is breaking); `synchronize` disabled
- [x] **DATA-04**: App boots against docker-compose Postgres 16 with `enableShutdownHooks()` active; docker-compose healthcheck references correct db/user (fix stale `pmmarkets` values)

### Auth & Users (AUTH)

- [ ] **AUTH-01**: User can sign in with a Solana wallet: server issues single-use nonce challenge, verifies signed message (tweetnacl + bs58), returns JWT session
- [ ] **AUTH-02**: First sign-in creates user with internal uuid id (≠ wallet_address), unique `share_code` (Crockford base32 `GC-XXXX-XXXX` with collision retry), unique `handle`, avatar seed
- [ ] **AUTH-03**: Authenticated requests are gated by JWT guard; wallet_address is used only by the auth module, everything else references user.id

### Games & Fixtures (GAME)

- [ ] **GAME-01**: Cron job (every 1 min) discovers available fixtures from TxLINE and creates/updates `game` rows with team names, competition, fixture_group_id, starts_at (names come from fixtures endpoint — stream has numeric ids only)
- [ ] **GAME-02**: User can list games (upcoming/live/finished) with denormalized score, status, team names — no live stream call needed to render the list
- [ ] **GAME-03**: User can join a game (`user_game` row, optional squad_id defined at join time)

### TxLINE Ingest (INGST)

- [ ] **INGST-01**: Backend authenticates to TxLINE using credentials from git-ignored `.env` (guest JWT + X-Api-Token; 401 → refresh JWT from same host, retry)
- [ ] **INGST-02**: SSE client ported from txodds-txline-api-monitor `upstream.ts` (hand-rolled fetch/ReadableStream parsing, Last-Event-ID resume, 30s idle watchdog, exponential backoff) — not rebuilt on an SSE library
- [ ] **INGST-03**: Every stream message is persisted to append-only `game_event` (promoted columns + full raw payload jsonb) idempotently via `UNIQUE(game_id, seq)` + ON CONFLICT DO NOTHING; unknown actions/statuses are stored and ignored, never crash
- [ ] **INGST-04**: `stream_cursor` (SSE frame id) flushed every N events in the same transaction as the event insert — never ahead of persisted events; flushed on SIGTERM
- [ ] **INGST-05**: Ingest lazily fills game row from stream: jersey colors from pre-match `jersey` events, `current_status_id`, denormalized `score_p1/p2`; `score_adjustment` treated as authoritative resync

### Replay Emitter (RPLY)

- [ ] **RPLY-01**: Replay emitter feeds the identical downstream pipeline from a recorded event source (TxLINE historical fetch or captured NDJSON): timestamps rebased (`delta = now() − firstEvent.Ts`), paced by original inter-event gaps × speed factor
- [ ] **RPLY-02**: `is_replay` switches ONLY the source: scheduler starts SSE for live games and the emitter for replay games at `starts_at`; downstream code cannot tell the difference
- [ ] **RPLY-03**: Admin/dev action can create a replay game (`is_replay=true`, `starts_at=now()+N min`, supplied names) for demo choreography; multiple takes = multiple replay rows (partial unique index permits this)

### Game State Machine (STAT)

- [ ] **STAT-01**: Singleton registry holds one in-memory state machine per live game (score, clock, StatusId, possession stage, attack run) derived from `possession.ts`/`goals.ts` logic ported from the monitor repo; state self-heals from any message after a gap
- [ ] **STAT-02**: Events for the same game are processed strictly serially (per-game mutex/queue) — no interleaved-await state corruption
- [ ] **STAT-03**: Two-clock discipline enforced: match-time logic (debounce, run segmentation) uses event `Ts` deltas; user-time logic (`expires_at`, answer lock) uses server wall clock

### Prediction Windows (WNDW)

- [ ] **WNDW-01**: Window opens when possession first enters `attack_possession` for a team, only while `StatusId ∈ {2,4,7,9}`; one active window per game (DB partial unique index is the backstop); `participant` records the attacking team; `trigger_event_id` FKs the event log
- [ ] **WNDW-02**: Window carries 4 options from `game_question_outcome` with instance-frozen `base_gain` (5/7/15/100 — LOCKED) and precomputed `expires_at` (TTL default 5s)
- [ ] **WNDW-03**: Window close follows the 12-second debounce algorithm: hard terminals act immediately (attacking-team goal → pending flow; period-end status; suspend/disconnected → void); soft terminals stamp `pendingCloseAt`; attacking-team pressure within 12s cancels the stamp; expiry ≥12s past stamp finalizes at the stamp time with accumulated max rung; lazy expiry check on each event + coarse wall-clock fallback timer (~15-20s) for feed silence
- [ ] **WNDW-04**: Window accumulates the highest rung reached by the attacking team (danger stages, shots deduped by action Id, goals); a discarded shot that was the high-water mark lowers it (reversal keyed on `(action_id, type)` covers shots and goals in one code path)

### Resolution & Void (RESL)

- [ ] **RESL-01**: fizzles/danger/shot outcomes resolve instantly at window close: `resolved_option_id` set (app-level guard: option must belong to the question), answers graded (`successful_outcome`, adjacency partial credit via ladder_position |Δ|=1 folded into reward_multiplier), `awarded_points = round(base_gain × reward_multiplier)`
- [ ] **RESL-02**: Attacking-team goal moves window `open → pending_confirmation`; `(game_id, action_id, type='goal', confirmed=true)` resolves as goal; `action_discarded` re-resolves to the highest non-goal rung (updates question FK AND recomputes affected answers); ~5-min timeout adjudicates from the `Score` field of latest events
- [ ] **RESL-03**: Resolution writes are idempotent/conditional — the confirm-event vs timeout race can never double-resolve or double-award
- [ ] **RESL-04**: Void policy refunds answers (no resolution) for any window open/pending across: seq gap, reconnect, `suspend`/`disconnected` event, or server restart with unrecovered hole
- [ ] **RESL-05**: `game_finalised` event freezes the game: status → finished, no new windows, leaderboard final for that game

### Answers (ANSW)

- [ ] **ANSW-01**: User can submit one answer per question; rejected when question state ≠ `open` OR `now > expires_at` (server wall clock is sole authority); `UNIQUE(user_id, game_question_id)` enforced
- [ ] **ANSW-02**: Answer stores selected_option_id, denormalized game_id, reward_multiplier (default 1, finalized at resolution)

### Leaderboard (LDRB)

- [ ] **LDRB-01**: Global live leaderboard endpoint: `SUM(awarded_points)` grouped by user with handle/avatar, ordered desc; reflects resolutions promptly

### REST API (API)

- [ ] **API-01**: REST surface (~5 endpoints: auth/nonce+verify, games list, game join, answer submit, leaderboard) documented with Swagger UI
- [ ] **API-02**: Validation via class-validator DTOs; errors return structured 4xx (invalid signature, closed window, duplicate answer) — never 500s for expected rejections

### WebSocket (WS)

- [ ] **WS-01**: socket.io gateway with per-game rooms; client subscribes to a game and receives a full snapshot immediately (score, clock, StatusId, possession stage, active question if any) from in-memory state — a user joining at minute 60 renders instantly
- [ ] **WS-02**: Go-forward pushes after snapshot: `game_event` (state/heat-map updates), `question` (new window), `resolution` (outcome + points), `void`; persist-then-broadcast ordering always
- [ ] **WS-03**: CORS configured for the Next.js UI origin; gateway auth accepts the same JWT as REST

### Restart Recovery (RCVR)

- [ ] **RCVR-01**: On boot, `status='live'` games rebuild in-memory state by replaying own `game_event` rows through the same emitter/state-machine code path
- [ ] **RCVR-02**: Stream reconnects with persisted `stream_cursor` as Last-Event-ID; first incoming Seq verified ≤ max(seq)+1; on gap: state self-heals from next message, open/pending windows voided+refunded, pending goals adjudicated from Score

## v2 Requirements

Deferred. NICE list only if CORE lands by evening July 17; CUT list not planned at all.

### NICE (post-core, pre-freeze only)

- **NICE-01**: In-match streak multiplier (folds into existing reward_multiplier)
- **NICE-02**: Minimal squads: join by invite code + leaderboard filter

### CUT (future milestone, do not build)

- **CUT-01**: Full squads (create/QR/cards/squad leaderboards), share_code squad add flow
- **CUT-02**: Pre-match predictions, multi-game management
- **CUT-03**: Achievement cards, EKG summary graphic, sharing images, AI commentary, geodata
- **CUT-04**: User profile update endpoints

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| GraphQL / Apollo / subscriptions machinery | Transport decided: REST + socket.io; ~5 endpoints + 4 WS message types don't justify it |
| Horizontal scaling / serverless / multi-process ingest | SSE ingest must run in exactly one long-lived process; stream_cursor is connection-scoped |
| Client-authoritative answer timing | Trivially exploitable; server-side `expires_at` check is the sole authority |
| Optimistic/instant payout on unconfirmed goals | 17.5% of goals get discarded; clawing back shown points is worse than a pending state |
| Mutable event log / in-place event correction | Breaks replay-as-demo-source and resolution audit trail; game_event is append-only, sacred |
| Real-value tokens / wagering | No real money, no gambling; Solana = wallet sign-in only |
| Frontend (Next.js) | Separate app; this backend serves it |
| Point recalibration | 5/7/15/100 LOCKED (n=1,708); base_gain instance-frozen |

## Traceability

Which phases cover which requirements. Populated during roadmap creation (2026-07-17).

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| GAME-01 | Phase 2 | Pending |
| INGST-01 | Phase 2 | Pending |
| INGST-02 | Phase 2 | Pending |
| INGST-03 | Phase 2 | Pending |
| INGST-04 | Phase 2 | Pending |
| INGST-05 | Phase 2 | Pending |
| RPLY-01 | Phase 2 | Pending |
| RPLY-02 | Phase 2 | Pending |
| RPLY-03 | Phase 2 | Pending |
| STAT-01 | Phase 2 | Pending |
| STAT-02 | Phase 2 | Pending |
| STAT-03 | Phase 2 | Pending |
| RCVR-01 | Phase 2 | Pending |
| RCVR-02 | Phase 2 | Pending |
| AUTH-01 | Phase 3 | Pending |
| AUTH-02 | Phase 3 | Pending |
| AUTH-03 | Phase 3 | Pending |
| WNDW-01 | Phase 4 | Pending |
| WNDW-02 | Phase 4 | Pending |
| WNDW-03 | Phase 4 | Pending |
| WNDW-04 | Phase 4 | Pending |
| RESL-01 | Phase 4 | Pending |
| RESL-02 | Phase 4 | Pending |
| RESL-03 | Phase 4 | Pending |
| RESL-04 | Phase 4 | Pending |
| RESL-05 | Phase 4 | Pending |
| ANSW-01 | Phase 4 | Pending |
| ANSW-02 | Phase 4 | Pending |
| GAME-02 | Phase 5 | Pending |
| GAME-03 | Phase 5 | Pending |
| API-01 | Phase 5 | Pending |
| API-02 | Phase 5 | Pending |
| WS-01 | Phase 5 | Pending |
| WS-02 | Phase 5 | Pending |
| WS-03 | Phase 5 | Pending |
| LDRB-01 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 40 total (13 categories) — note: an earlier header estimate of "33" was stale; the actual REQ-ID count is 40
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-17*
*Last updated: 2026-07-17 after roadmap creation (traceability populated, count corrected 33 → 40)*
