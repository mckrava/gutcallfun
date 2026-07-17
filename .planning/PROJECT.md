# GutCall Backend (gutcallfun-core)

## What This Is

GutCall (gutcall.fun) is a mobile-first, second-screen web app for live soccer fans watching World Cup 2026 on TV. This project is its **NestJS backend** in `apps/gutcallfun-core`: REST + socket.io API serving the Next.js UI. It ingests the TxLINE real-time feed (SSE), maintains an append-only event log and per-game in-memory state, opens 5-second micro-prediction windows ("How far will this attack go?"), resolves them into points, and pushes live state to clients. No real money, no gambling — Solana is invisible plumbing (wallet sign-in only).

## Core Value

The live loop works end-to-end and is demoable from replay: **TxLINE ingest → trusted `game_event` log → state machine → prediction windows → resolution → points → WS push**. If everything else fails, this must work.

## Business Context

- **Customer**: Hackathon judges (TxODDS World Cup Track, Superteam Earn) + live soccer fans
- **Revenue model**: None — hackathon submission
- **Success metric**: Deployed working app at root gutcall.fun + ≤5 min demo video by **July 19, 2026 23:59 UTC**. Mockups/non-working concepts are auto-disqualified.
- **Strategy notes**: `initial-request-src/initial-project-context.md` — the authoritative implementation brief. Where anything disagrees, priority: `initial-request-src/initial-db-structure.sql` (schema) > brief > diagrams.

## Requirements

### Validated

(None yet — ship to validate)

### Active

Backend part of the LOCKED CORE scope:

- [ ] Wallet-based signup/signin: backend creates user (uuid id ≠ wallet_address), unique `share_code` (Crockford base32 `GC-XXXX-XXXX`), `handle`, avatar seed
- [ ] Fixtures cron (every 1 min): discover games, create/update `game` rows with team names, competition, starts_at
- [ ] TxLINE SSE ingest → append-only `game_event` log, idempotent via `UNIQUE(game_id, seq)` + ON CONFLICT DO NOTHING; store-and-ignore unknown actions
- [ ] Replay emitter (source-agnostic: historical fetch or captured NDJSON; timestamp rebasing; speed factor) — core infrastructure, built early; `is_replay` switches the source and nothing else
- [ ] Per-game in-memory state machine: possession gradient, 12s attack debounce, two-clock discipline (event Ts vs server wall clock)
- [ ] Prediction windows: open on first `attack_possession` (only StatusId ∈ {2,4,7,9}), one active per game (DB partial unique index), shot-based ladder fizzles<danger<shot<goal, points 5/7/15/100 (LOCKED)
- [ ] Resolution: instant for fizzles/danger/shot; goals via pending_confirmation flow (confirm → award; discard → re-resolve to highest non-goal rung; 5-min timeout → adjudicate from Score); void policy (suspend/disconnect/seq-gap/restart-hole → refund)
- [ ] Answers: reject when question not `open` or `now > expires_at`; `UNIQUE(user_id, game_question_id)`; `awarded_points = round(base_gain × reward_multiplier)`
- [ ] Global live leaderboard: `SUM(awarded_points)` per user
- [ ] REST API (~5 endpoints: auth/user, fixtures list, game join, answer submit, leaderboard) + Swagger
- [ ] socket.io: full snapshot on subscribe (score, clock, StatusId, possession stage, active question), then go-forward pushes: game_event, question, resolution, void
- [ ] Restart recovery: rebuild state by replaying own `game_event` rows; reconnect with persisted `stream_cursor` as Last-Event-ID; gap policy (void+refund open windows)
- [ ] TypeORM models + migrations matching `initial-db-structure.sql`; Postgres 16 in docker-compose; env-validated config module

### Out of Scope

- GraphQL / Apollo / subscriptions machinery — transport decided: REST + socket.io; reject any drift
- Full squads (create/QR/cards/squad leaderboards), user-ID-sharing squad add flow — CUT list; squad tables exist in schema for completeness only
- Pre-match predictions, multi-game management, achievement cards, EKG match-summary graphic, sharing images, AI commentary, geodata — CUT list
- User profile update endpoints — explicitly ignorable for now
- Horizontal scaling / serverless — SSE ingest must run in exactly one long-lived process
- Frontend (Next.js) — separate app; this project serves it
- NICE list (in-match streak multiplier, haptics, minimal squads by invite code) — only if CORE works by evening July 17; not planned as phases

## Context

**Source documents (read before planning/executing anything):**
- `initial-request-src/initial-project-context.md` — implementation brief: verified TxLINE facts (empirical corpus 23,510 records), prediction-window design, DB invariants, ingest architecture, restart recovery, demo choreography
- `initial-request-src/initial-db-structure.sql` — authoritative Postgres schema (v2, validated)
- `initial-request-src/system-prompt.md` — resources, conventions, workflow notes
- `txodds-api` skill — TxLINE auth flow, SSE stream, message schema
- `gutcallfun_local` MCP — local DB access

**Reusable code (port, don't rewrite):** github.com/mckrava/txodds-txline-api-monitor — battle-tested `upstream.ts` (SSE client: Last-Event-ID resume, 30s idle watchdog, exponential backoff), `possession.ts` (action classifier, attack-run heuristic), `goals.ts` (confirm-gap tracking), `replay.ts` (NDJSON replay).

**Reference implementations (follow the same approach):**
- Config module with env validation: github.com/galacticcouncil/hydration-data-feeds `apps/hydration-data-lake-adapter/src/modules/config/`
- TypeORM migrations config: github.com/dappforce/epic-data-hub `data-hub-core/src/db/typeorm.config.ts`

**Codebase state:** turbo monorepo; `apps/gutcallfun-core` has default NestJS boilerplate + empty scaffold folders `src/modules/{core,user,game,squad}` and `src/models/{account,game,squad}`. Convention: `modules/<entity>/` holds module+services+controllers per entity scope; `models/<entity>/` holds TypeORM models with the same scoping. `.env` (git-ignored) holds TxODDS credentials — never commit secrets. Postgres 16 via root `docker-compose.yml`.

**TxLINE critical facts (verified empirically — trust these over the OpenAPI spec):**
- Records are flat PascalCase (`parsed.Update ?? parsed` defensive read); `Action` values snake_case, `PossessionType` values PascalCase
- Every message carries full fixture metadata + live state → state self-heals after gaps; team names only from fixtures endpoint, not the stream
- `Id` is an incident id reused across confirm/amend/discard/var — match by `(game_id, action_id, type)`, never `Id` alone
- `Seq` per-fixture monotonic; collisions are byte-identical re-deliveries → `UNIQUE(game_id, seq)` ingest is safe
- Goals: always `Confirmed:false` first (median 80.5s to confirm); 17.5% of goals discarded; zero confirmed goals ever discarded → `Confirmed:true` is settlement-final
- `Clock.Seconds` counts DOWN; `StatusId` is an open set (100 observed in wild) — never a closed enum
- `game_finalised` = freeze leaderboard signal; `score_adjustment` = authoritative Score resync

## Constraints

- **Timeline**: Feature freeze evening **July 17** (today); July 18 = polish + deploy + record demo from replay; July 19 = docs + submit. Small scope done end-to-end beats broad and rough.
- **Tech stack**: NestJS 11, TypeORM (NestJS module), Postgres 16, socket.io, Swagger, NestJS @nestjs/schedule cron, turbo monorepo — decided, do not substitute
- **DB schema**: `initial-db-structure.sql` is authoritative; deviations need explicit justification
- **Transport**: REST + socket.io only — GraphQL explicitly rejected
- **Deployment shape**: single long-lived process (Docker on Railway/Fly/VPS); no serverless, no horizontal scaling
- **Security**: `.env` git-ignored; never commit TxODDS JWT/API tokens; scan any ported code for leaked tokens
- **Game economy**: point values 5/7/15/100 and the shot-based ladder are LOCKED (calibrated n=1,708) — never recalibrate; `base_gain` frozen per question instance

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| REST + socket.io, no GraphQL | ~5 endpoints + 3-4 push message types don't justify GraphQL machinery | — Pending |
| Shot-based outcome ladder (fizzles/danger/shot/goal) | Original stage-based ladder was EV-broken ("always pick Big chance" dominated 4-6×) | — Pending |
| 12s attack debounce on soft terminals | Feed logs momentary safe_possession inside continuing attacks; naive close grades correct GOAL picks wrong | — Pending |
| Two-clock discipline (event Ts for match logic, wall clock for user TTL) | Reconnect catch-up floods resumed events in seconds while Ts spans the real gap | — Pending |
| Goal settlement via pending_confirmation state | 17.5% of goals discarded; Confirmed:true never reversed; median 80s confirm lag maps to VAR tension | — Pending |
| Idempotent ingest: UNIQUE(game_id, seq) + ON CONFLICT DO NOTHING | 23,510-record corpus: all seq collisions byte-identical | — Pending |
| stream_cursor flushed in same tx as event insert | Stale cursor = safe duplicates; eager cursor = silent data loss | — Pending |
| `is_replay` switches ingest source only; downstream identical | Replay emitter doubles as demo choreography and resolution-testing harness | — Pending |
| Replay emitter built early as core infrastructure | It is the testing harness and the demo path, not a nice-to-have | — Pending |
| Port monitor repo modules (upstream/possession/goals/replay) | Battle-tested against live feed; rewriting risks re-learning solved problems | — Pending |
| Config module pattern from hydration-data-feeds; migrations pattern from epic-data-hub | Proven patterns from author's own projects | — Pending |
| YOLO mode, coarse phases, pipeline build order | Hackathon deadline July 19; brief prescribes ingest→log→state→windows→resolution→WS order | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-17 after initialization*
