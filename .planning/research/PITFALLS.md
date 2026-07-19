# Pitfalls Research

**Domain:** NestJS + TypeORM + socket.io + Postgres real-time feed-ingest / live-prediction backend (engineering layer only — domain-specific TxLINE/gameplay gotchas are already covered in `initial-request-src/initial-project-context.md` and are referenced, not repeated, here)
**Researched:** 2026-07-17
**Confidence:** MEDIUM (framework/library behavior cross-checked against official docs + GitHub issues via web search; project-specific reasoning is HIGH confidence — directly derived from the authoritative schema and brief)

This file assumes the reader has already read the brief's empirically-verified gotchas (goal discards, seq gaps, 12s debounce, two-clock discipline, idempotent ingest). Everything below is the layer underneath those: how NestJS/TypeORM/socket.io/Node itself can silently break the correctness the brief designed for, even when the domain logic is right.

## Critical Pitfalls

### Pitfall 1: In-memory per-game state mutated out of order by interleaved async handlers

**What goes wrong:**
The per-game state machine (possession gradient, debounce timers, active question) lives in a plain JS object/Map inside a singleton NestJS service — correct, since the deployment is a single long-lived process. But Node's concurrency is cooperative: an `async` event handler processing feed-event A for game 7 can `await` a DB write (persist `game_event`, update `game_question`), and during that `await`, event B for the *same game* arrives and starts mutating the same in-memory state object before A's continuation resumes. Result: state applied out of Seq order, a debounce timer cleared by the wrong event, or a question resolved twice with interleaved writes.

**Why it happens:**
Single-threaded JS gives a false sense of safety — "no race conditions" is only true between `await` boundaries, not across them. This is easy to miss under hackathon time pressure because it never reproduces on the replay emitter at 1× speed with sparse events; it reproduces under real feed rate or replay speed-up (which the brief explicitly plans to use at 20× for the resolution-testing harness).

**How to avoid:**
Serialize event processing **per game_id**: a simple promise-chain/mutex keyed by `game_id` (`Map<gameId, Promise>`) that the ingest normalizer awaits before processing the next event for that game. Cheap to implement (~15 lines), no external dependency needed for a single-process deployment. Never process two events for the same game concurrently, even if they arrive on the same tick.

**Warning signs:**
Flaky resolution results only under fast replay (5–20× speed); a question resolved with the wrong rung; debounce state that "forgets" a cancel event; duplicate WS broadcasts for the same event.

**Phase to address:**
State machine / ingest phase (before prediction windows are built on top of it) — this is a foundational correctness property, not a later hardening task.

---

### Pitfall 2: `synchronize: true` left on, or migrations drifting from `initial-db-structure.sql`

**What goes wrong:**
TypeORM's `synchronize: true` auto-alters the schema to match entities on every boot — convenient in a hackathon, but it can silently drop or alter columns/tables when an entity is refactored, and it bypasses the authoritative SQL file entirely. If it's ever left on past local dev (e.g. copied into the Docker/deploy config), a bad entity change on deploy day can destroy production data with no rollback path. [MEDIUM]

**Why it happens:**
It's the fastest way to iterate on the entity/schema mapping under time pressure, and NestJS TypeORM starters commonly ship with it on by default.

**How to avoid:**
`synchronize: true` only in local dev, and only until the first migration exists; `synchronize: false` + `migrationsRun: true` everywhere else (staging matches prod exactly — there is no staging here, so: false everywhere except a throwaway local scratch DB). Write the initial migration directly **from** `initial-db-structure.sql` (hand-author or `typeorm migration:generate` then diff against the SQL file) rather than letting entities drive the schema — the SQL file is the source of truth per `PROJECT.md`, not the entities.

**Warning signs:**
`docker-compose down -v` / fresh container boot silently changes table shape; a migration file that doesn't exist for a schema change that's clearly live; `entities` and `initial-db-structure.sql` disagree on a column and nobody notices until a query fails.

**Phase to address:**
Foundation / data-layer phase — set `synchronize: false` and generate the baseline migration before any other phase writes data.

---

### Pitfall 3: TypeORM's default uuid/enum generation strategy doesn't match the authoritative SQL

**What goes wrong:**
Two specific, easy-to-miss mismatches against `initial-db-structure.sql`:
- **UUID defaults:** `@PrimaryGeneratedColumn('uuid')` in TypeORM's Postgres driver defaults to `uuid_generate_v4()` (requires the `uuid-ossp` extension), **not** `gen_random_uuid()` as the schema specifies. If the entity decorator isn't overridden, either the migration diverges from the SQL file, or (worse) TypeORM falls back to generating the UUID in application code instead of the DB default — which breaks the assumption that inserts are consistent whether they come through TypeORM or a raw `psql` seed/replay script.
- **Enum type names:** TypeORM's `enum: [...]` column option auto-creates a Postgres enum type named `<table>_<column>_enum` unless `enumName` is explicitly set. The schema hand-creates `game_status` and `question_state` as top-level named types. Without explicit `enumName`, TypeORM will try to create a *second*, differently-named enum type, and `migration:generate` against the real schema will show a permanent, spurious diff every time it's run.

**Why it happens:**
These are silent defaults — nothing errors, the app just quietly drifts from the schema of record. Both are easy to miss when writing entities from memory of "how TypeORM usually does uuid/enum" instead of checking the actual DB defaults.

**How to avoid:**
Explicitly declare `@Column({ type: 'uuid', default: () => 'gen_random_uuid()' })` on every uuid PK/FK, and `@Column({ type: 'enum', enum: GameStatus, enumName: 'game_status' })` (matching the exact type names in the SQL file) on `game.status` and `game_question.state`. Verify by running `migration:generate` against a DB seeded from `initial-db-structure.sql` directly and confirming it produces an **empty** diff.

**Warning signs:**
`migration:generate` never converges to a no-op diff; a seed script inserting via raw SQL and a TypeORM insert produce differently-shaped UUIDs (v4 vs whatever the app generated); Postgres error `type "xxx_enum" already exists` or duplicate enum types visible in `\dT`.

**Phase to address:**
Foundation / data-layer phase — verify entity↔schema parity before any ingest code writes rows.

---

### Pitfall 4: Partial unique indexes silently not enforced (or not migrated) via the TypeORM decorator

**What goes wrong:**
Two correctness-critical constraints in the schema are partial unique indexes: `uq_game_fixture_live` (`game.fixture_id` WHERE NOT is_replay) and `uq_gq_one_open_per_game` (`game_question.game_id` WHERE state='open'). [MEDIUM] TypeORM's `@Index({ where: ... , unique: true })` decorator support for Postgres partial indexes has known bugs (column-name quoting, inconsistent detection when running `migration:generate` again, indices getting dropped/regenerated unnecessarily). If the decorator silently fails to apply the `WHERE` clause, the index becomes a *full* unique index — which would incorrectly reject legitimate replay-game rows sharing a `fixture_id`, or worse, if TypeORM drops the partial index and creates none, the DB-enforced "one open question per game" invariant the whole prediction-window design depends on disappears and the app's own race conditions (Pitfall 1) go unguarded.

**Why it happens:**
Partial indexes are a Postgres-specific feature TypeORM's cross-DB abstraction handles inconsistently; nobody notices until two windows open concurrently for the same game.

**How to avoid:**
Write both partial unique indexes as **raw SQL in a migration** (`queryRunner.query('CREATE UNIQUE INDEX ... WHERE ...')`), copied verbatim from `initial-db-structure.sql`, instead of relying on the `@Index` decorator. Do not use `synchronize`/`migration:generate` to manage these two indexes at all — treat them as hand-written, and add a one-time integration test that INSERTs two open questions for the same game and asserts the second one throws a unique-violation.

**Warning signs:**
`migration:generate` proposes dropping/recreating these indexes on every run; two `game_question` rows with `state='open'` for the same `game_id` visible in the DB; two replay-game rows for the same `fixture_id` get rejected.

**Phase to address:**
Foundation / data-layer phase for the migration; verified again in the Prediction Windows phase with an explicit concurrency test.

---

### Pitfall 5: WS snapshot-then-subscribe race — client joins the room before (or after) the snapshot is captured

**What goes wrong:**
The brief requires: on `subscribe`, push a full in-memory snapshot (score, clock, status, active question), *then* forward-only pushes (`game_event`, `question`, `resolution`, `void`). If room-join and snapshot-read aren't done as one synchronous unit inside the same handler tick, there's a window where an event broadcast to the room fires between "client joined the room" and "snapshot captured" — the client can receive the live event *and* a snapshot that already includes it (duplicate), or join the room *after* the snapshot capture but the persist-then-broadcast for an event that happened in between never reaches them (gap). [MEDIUM — general NestJS gateway lifecycle guidance confirms there's no built-in ordering guarantee between connection/room-join and business logic; the app must enforce it.]

**Why it happens:**
It's natural to write `handleConnection`/`subscribe` as: join room → `await` state fetch → emit snapshot — but any `await` in between opens the interleaving window described in Pitfall 1, this time against the broadcaster instead of another ingest event.

**How to avoid:**
Read the snapshot from the in-memory state (synchronous, no `await`) and call `socket.join(room)` in the same synchronous block, in this order: capture snapshot object first, join room second, then emit the snapshot. Since the per-game state is a plain in-memory object (not a DB read), the snapshot capture is synchronous — do not make it `async` by routing it through a repository call.

**Warning signs:**
A client joining mid-match sees a `game_event` echoed twice, or a UI state gap noticeable only after `resolution`/`void` messages arrives without the corresponding `question` message ever appearing for a user who joined right at question-open time.

**Phase to address:**
WS/Realtime phase.

---

### Pitfall 6: `SELECT ... FOR UPDATE` alone does not stop a double-submit answer

**What goes wrong:**
`UNIQUE(user_id, game_question_id)` plus a transaction with row locking prevents *concurrent* corruption, but does not by itself prevent a duplicate click / retried request from a flaky mobile connection from being processed as two separate legitimate submissions if the unique constraint path isn't reached first (e.g. app-level check-then-insert races on read-committed isolation, or a client retry after a timed-out-but-actually-successful request). [MEDIUM] For this schema specifically, the DB unique constraint is the real backstop — but only if the insert path relies on catching the constraint violation rather than a prior `SELECT` existence check (TOCTOU: two requests both `SELECT` see no existing answer, both proceed to `INSERT`).

**Why it happens:**
It's natural to write "check if user already answered, then insert" as two separate statements — correct-looking, wrong under concurrency.

**How to avoid:**
Answer submission must be a single `INSERT ... ON CONFLICT (user_id, game_question_id) DO NOTHING` (or catch the unique-violation and return a clean 409/`already answered`), never a `SELECT`-then-`INSERT`. Wrap the full submit-and-lock-check (question is `open` AND `now <= expires_at`) in one transaction reading the question row with `FOR UPDATE` (or rely on the `expires_at` timestamp comparison being safe as a plain read, since expiry is monotonic and doesn't need locking — only the *existence* check needs the DB constraint).

**Warning signs:**
A user's mobile app retries a slow answer submit and ends up with two `awarded_points` credited (visible on the leaderboard); integration test hammering the same `(user_id, game_question_id)` pair concurrently returns 200 twice instead of one 200 + one 409.

**Phase to address:**
Answers/Resolution phase.

---

### Pitfall 7: Double-resolution race between goal-confirm and 5-minute timeout adjudication

**What goes wrong:**
The brief's `pending_confirmation` flow has two independent triggers that can both fire for the same question: the confirm/discard feed event, and the 5-minute wall-clock timeout adjudicator. If both paths call "resolve this question" without mutual exclusion, a confirm event arriving at minute 4:59 and the timeout firing at minute 5:00 can race to update `game_question.state`/`resolved_option_id` and the associated `user_game_answer.awarded_points` rows twice, potentially awarding points twice or leaving the question in an inconsistent state (this is an *engineering* concurrency risk layered on top of the brief's already-specified resolution logic, not a duplicate of it).

**Why it happens:**
The timeout is implemented as a `setTimeout`/scheduled check independent of the event-driven resolution path; nothing inherently prevents both from executing "resolve" concurrently unless the resolution function itself is idempotent/guarded.

**How to avoid:**
Make resolution idempotent and guarded at the DB level: the resolution write should be a conditional update (`UPDATE game_question SET state=... WHERE id=... AND state='pending_confirmation'`) checking `rowCount`; if 0 rows affected, another path already resolved it and this call is a no-op. Clear the pending timeout as soon as a resolution succeeds via the event path (and vice versa) so the loser never fires its DB write in the first place — but treat the conditional update as the real backstop, not the timer cancellation.

**Warning signs:**
A goal confirmed right around the 5-minute mark shows up resolved twice in logs; `awarded_points` for a user on a goal question doesn't match `round(base_gain × reward_multiplier)` exactly once.

**Phase to address:**
Resolution phase (goal pending-confirmation flow).

---

### Pitfall 8: SIGTERM without `enableShutdownHooks()` drops in-flight writes and the SSE connection ungracefully

**What goes wrong:**
`app.enableShutdownHooks()` is **disabled by default** in NestJS. Without it, `onModuleDestroy`/`beforeApplicationShutdown`/`onApplicationShutdown` never fire on SIGTERM — the process (and Docker container) can be killed mid-write: a `game_event` insert or `stream_cursor` flush in progress gets torn down, the SSE upstream connection to TxLINE is dropped without a clean unsubscribe, and any pending resolution transaction can be left half-committed if not properly wrapped. [MEDIUM] Given the deploy target is Docker on Railway/Fly, container orchestration sends SIGTERM on every redeploy — this will happen on **every deploy**, not just crashes.

**Why it happens:**
It's an opt-in NestJS feature that's easy to forget when the default `main.ts` boilerplate is used as-is; the failure mode looks like nothing (it just works until a deploy happens mid-write and something is subtly wrong).

**How to avoid:**
Call `app.enableShutdownHooks()` in `bootstrap()`. Implement `onApplicationShutdown(signal)` in the ingest service to: stop accepting new fixture/game scheduling, close the SSE upstream connection cleanly, flush the `stream_cursor` in the same transaction discipline as normal operation (never write it ahead of persisted events, per the brief's invariant), and let any in-flight DB transaction either complete or roll back — do not force-kill mid-transaction. Set an explicit shutdown timeout (a few seconds) so a stuck handler doesn't hang the container past the platform's SIGKILL grace period (typically 10–30s on Railway/Fly).

**Warning signs:**
A redeploy during a live/replay game leaves `stream_cursor` stale or a `game_event` row missing right at the deploy boundary; the restart-recovery gap logic (already designed for this) triggers on every deploy instead of only real outages — acceptable if it's rare, a red flag if it's the norm.

**Phase to address:**
Ingest phase (implement the shutdown hook alongside the SSE client) — but must be verified again in the deploy/polish phase since it's meaningless until the actual container orchestrator sends real SIGTERMs.

---

### Pitfall 9: Wallet sign-in without a server-issued nonce is replayable

**What goes wrong:**
If the sign-in message the wallet signs is static or client-generated (not a server-issued, single-use nonce with a short expiry), a captured valid `(message, signature, wallet_address)` triple can be replayed by anyone to authenticate as that user indefinitely — no on-chain transaction is involved to make it naturally non-replayable the way a Solana tx signature is. [MEDIUM]

**Why it happens:**
Under time pressure it's tempting to sign a fixed string (`"Sign in to GutCall"`) since it "seems to work" in manual testing — the vulnerability only shows up when someone deliberately replays a captured signature, which nobody does in a demo.

**How to avoid:**
`POST /auth/wallet/nonce` issues a random, single-use, short-TTL (5–10 min) nonce stored server-side (DB row or in-memory map, single-process is fine here) keyed to nothing yet (no user exists pre-signup); the client signs a message embedding that nonce + wallet address; server verifies `nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)` against the exact message it issued, then invalidates the nonce (delete/mark used) so it cannot be replayed even by the legitimate holder.

**Warning signs:**
The same signature accepted twice in a row in a manual `curl` replay test; no nonce/expiry table or in-memory store exists anywhere in the auth module.

**Phase to address:**
Auth phase (wallet sign-in).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| `synchronize: true` kept on past local dev | Fast schema iteration | Silent prod data loss on next boot | Local dev only, never in Docker/deploy config |
| In-memory nonce store for wallet auth (no dedicated table) | One less migration/table | Lost on process restart mid-login (acceptable: user just re-signs) | Fine for this deploy shape (single process, short nonce TTL) |
| Skipping per-game event-processing mutex (Pitfall 1) | Saves ~30 min of implementation | Non-deterministic state corruption under load/fast replay, very hard to debug post-hoc | Never — implement in the ingest/state-machine phase, it's cheap |
| No idempotency key on REST answer-submit beyond the DB unique constraint | Saves an endpoint/header design decision | Acceptable here — the unique constraint IS the idempotency mechanism as long as insert-path uses `ON CONFLICT`, not check-then-insert | Acceptable for this project's scale/timeline |
| No dedicated connection-pool sizing (leave `pg`/TypeORM defaults) | No config to write | Cron + SSE ingest + REST + WS-triggered writes competing for a small default pool (often 10) under demo load | Acceptable for demo traffic; bump pool size explicitly before the demo if a leaderboard/answer spike is expected |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| TypeORM ↔ Postgres schema of record | Letting entities drive the schema via `synchronize`/generated migrations instead of `initial-db-structure.sql` | Author the baseline migration from the SQL file; verify `migration:generate` produces an empty diff against it |
| socket.io ↔ Next.js frontend (cross-origin) | `cors: { origin: '*' }` with `credentials: true` (invalid combination, silently rejected by browsers) or forgetting `withCredentials: true` client-side when auth is cookie/header-based | Explicit allowlist of the Next.js origin(s) in `@WebSocketGateway({ cors: { origin: [...], credentials: true } })`; match client `withCredentials` setting |
| TxLINE SSE client (ported `upstream.ts`) ↔ Node process lifecycle | Treating the SSE connection as fire-and-forget; not tearing it down on `onApplicationShutdown` | Wire the SSE client's `close()`/abort into the shutdown hook (Pitfall 8) |
| Docker/Railway/Fly managed Postgres | Assuming plain TCP; managed Postgres often requires `sslmode=require`/`ssl: { rejectUnauthorized: false }` in the connection config | Read the platform's connection string format explicitly at deploy time; don't assume local docker-compose config transfers unmodified |
| `@nestjs/schedule` fixtures cron (every 1 min) | No overlap guard — if a run takes >1 min (slow fixtures API call), the next tick starts a second overlapping run | Guard with a simple in-flight boolean flag; skip the tick if the previous run hasn't finished |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Unbounded `res.write()` to a slow WS/SSE consumer | Slowly growing process memory during a long match with many concurrent viewers | Honor backpressure signals; for socket.io this is largely handled internally, but avoid buffering unsent broadcast history yourself | Noticeable over a full 90+ min match with sustained concurrent connections, not in a short demo |
| Orphaned timers/listeners across SSE reconnects | Memory creeps up specifically on reconnect-heavy connections (flaky demo wifi, coverage flapping) | Explicitly clear the idle-watchdog interval and any per-connection listeners before establishing a new SSE connection on reconnect | Visible only after several reconnect cycles — test by forcing reconnects during a long-running replay |
| `game_event` table scans without the promoted-column indexes in place | Restart-recovery replay (rebuild state from own event log) slows down as event count grows | Ensure `idx_ge_type`/`idx_ge_action_id` from the schema are actually applied via migration, not skipped | Only matters once a match accumulates hundreds–thousands of events; fine for a single demo match, worth just doing correctly since it's already in the schema |
| Default small Postgres connection pool shared by cron + ingest + REST + WS pushes | Occasional pool-exhaustion timeouts under concurrent demo traffic (leaderboard refresh + answer submit spike right after a goal) | Set an explicit pool size in the TypeORM config sized to expected concurrent demo load (a handful of connections is enough — this isn't a scale problem, it's a "don't leave it at the library default without thinking" problem) | Only under simultaneous spikes — worth a 5-minute config check before the demo, not real engineering work |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting a client-supplied `user_id` in a WS payload instead of deriving identity from a verified JWT on the socket handshake | Any user can submit answers or subscribe as another user | Authenticate the socket handshake (JWT in `auth` payload or header) once in `handleConnection`; attach the verified user to the socket, never trust a payload-supplied id afterward |
| Wallet sign-in without nonce/expiry (Pitfall 9) | Captured signature replay = permanent account takeover | Server-issued single-use nonce + short expiry + exact-message verification |
| Missing global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` | Unvalidated/extra fields reach services and hit raw DB type-cast errors (500s) instead of clean 400s; potential for unexpected fields to slip through to TypeORM `save()` | Enable the global pipe in `main.ts` before any controller is exercised |
| `.env` values or TxODDS JWT/API token leaking into a committed migration, seed, or ported monitor-repo file | Credential leak in a public hackathon repo | Grep-scan before every commit that touches ported code (already flagged in the brief for the monitor repo specifically — extend the same check to any new config/seed files) |

## UX Pitfalls

(Backend-facing — these are engineering choices whose failure mode shows up as frontend/demo UX breakage.)

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Answer-rejection responses that don't distinguish "window closed" vs "already answered" vs "validation error" | Frontend can't show the right micro-copy at the exact moment a user taps late | Return distinct, stable error codes (not just HTTP status) for `window_closed`, `already_answered`, `invalid_option` so the UI can react precisely |
| WS reconnect after a dropped connection re-requests a full snapshot but the client doesn't dedupe against events it already had | Momentary UI flicker/duplicate event render right after reconnect | Snapshot is a full state replace on the client, not a merge — document this contract so frontend implements it as replace, not append |
| No explicit "connecting/reconnecting" signal distinct from "no active question" | User can't tell if the heat-map is frozen because nothing is happening or because the connection dropped | Emit an explicit WS connection-state event (or rely on socket.io's own connect/disconnect client events) so frontend can show a stale-data indicator |

## "Looks Done But Isn't" Checklist

- [ ] **Migrations:** `synchronize` is `false` outside local dev, and `migration:generate` against a DB seeded from `initial-db-structure.sql` produces an empty diff (verifies uuid defaults, enum names, and partial indexes all match — Pitfalls 2–4).
- [ ] **Graceful shutdown:** `enableShutdownHooks()` is called, and a manual `docker stop` (SIGTERM) during an active replay does NOT lose or duplicate the last few `game_event` rows or leave `stream_cursor` ahead of persisted events.
- [ ] **Concurrency:** an integration test fires two simultaneous answer submissions for the same `(user_id, game_question_id)` and confirms exactly one succeeds; a second test fires simultaneous events for the same game through the ingest pipeline and confirms state ends up correct regardless of arrival order relative to `await` points.
- [ ] **WS auth:** a socket connection without a valid JWT cannot subscribe to a game room or receive any push, and cannot submit an answer by supplying an arbitrary `user_id`.
- [ ] **Snapshot correctness:** joining a game room at a random point mid-replay (not at t=0) renders the correct score/clock/status/active-question on first paint, with no duplicate or missing event immediately after.
- [ ] **Resolution idempotency:** forcing both the goal-confirm path and the 5-minute timeout path to fire for the same question (test harness, not real 5-min wait) results in exactly one resolution, not two.
- [ ] **Cron overlap:** the fixtures cron has an overlap guard, even though a 1-minute fixtures-API call taking >1 min is unlikely — cheap insurance.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| `synchronize: true` caused a prod data loss | HIGH | Restore from last DB backup/snapshot; if none exists (likely, given the timeline), the `game_event` log itself can rebuild `game`/state if it survived — this is exactly why `game_event` is append-only and sacred; prioritize protecting that table above all others |
| Missing partial unique index let two open questions exist for one game | LOW–MEDIUM | Manually void the duplicate question, refund its answers per the existing void policy, then apply the corrected migration |
| Double-resolution race awarded points twice | MEDIUM | Detect via a reconciliation query (`awarded_points != round(base_gain*reward_multiplier)` or duplicate resolution timestamps), manually correct the affected `user_game_answer` rows and leaderboard will self-correct since it's a live `SUM` |
| SIGTERM mid-write during a deploy | LOW | Restart-recovery boot sequence (already designed in the brief) replays own `game_event` log and reconciles via `stream_cursor`/seq check — this pitfall's blast radius is already bounded by existing design, as long as Pitfall 8's shutdown hook doesn't make it *worse* by corrupting the cursor write itself |
| Replayed wallet signature used for unauthorized login | MEDIUM | Invalidate all active sessions for the affected wallet, rotate any session/JWT secret if broader compromise is suspected, add the missing nonce/expiry check |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| In-memory state race across `await` boundaries (P1) | State Machine / Ingest phase | Concurrency test: fire concurrent events for one game through the pipeline, assert deterministic final state |
| `synchronize: true` / schema drift (P2) | Foundation / Data Layer phase | `migration:generate` empty-diff check against `initial-db-structure.sql` |
| uuid default / enum name mismatch (P3) | Foundation / Data Layer phase | Same empty-diff check; manual `\d+ game_question` inspection of enum type name and column default |
| Partial unique index not enforced (P4) | Foundation / Data Layer phase (migration); re-verified in Prediction Windows phase | Integration test inserting two open questions / two live games for one fixture, expect unique-violation |
| WS snapshot/subscribe race (P5) | Realtime (WS) phase | Manual test: join mid-replay repeatedly, diff snapshot state against expected DB/in-memory truth |
| Double-submit answer (P6) | Answers / Resolution phase | Concurrency test: parallel identical submit requests, expect exactly one 200 |
| Double-resolution race (P7) | Resolution phase | Forced-collision test: trigger confirm path and timeout path near-simultaneously, expect one resolution |
| SIGTERM data loss (P8) | Ingest phase (implementation); Deploy/Polish phase (real-world verification) | `docker stop` during active replay, inspect `stream_cursor` vs last persisted `seq` |
| Wallet signature replay (P9) | Auth phase | Manual replay test: reuse a captured `(message, signature)` pair, expect rejection |

## Sources

- [TypeORM synchronize option — data loss dangers (Medium)](https://dulanwirajith.medium.com/when-good-decisions-outlive-their-context-a-typeorm-migration-story-d105fe358680)
- [TypeORM Migrations Explained](https://readmedium.com/typeorm-migrations-explained-fdb4f27cb1b3)
- [TypeORM enum migration issue — blank migration on add value (GitHub #8568)](https://github.com/typeorm/typeorm/issues/8568)
- [TypeORM enum-array migration crash (GitHub #7217)](https://github.com/typeorm/typeorm/issues/7217)
- [TypeORM PR — use ADD VALUE for enum changes when possible (GitHub #10956)](https://github.com/typeorm/typeorm/pull/10956)
- [TypeORM partial unique index quoting bug (GitHub #9899)](https://github.com/typeorm/typeorm/issues/9899)
- [TypeORM partial index creation issues (GitHub #4171)](https://github.com/typeorm/typeorm/issues/4171)
- [TypeORM Indices documentation](https://typeorm.io/docs/advanced-topics/indices/)
- [NestJS Gateways documentation (lifecycle hooks)](https://docs.nestjs.com/websockets/gateways)
- [NestJS gateway `handleConnection` naming collision (GitHub #13618)](https://github.com/nestjs/nest/issues/13618)
- [NestJS Lifecycle events documentation](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [Graceful Shutdown in NestJS (dev.to)](https://dev.to/hienngm/graceful-shutdown-in-nestjs-ensuring-smooth-application-termination-4e5n)
- [NestJS CORS documentation](https://docs.nestjs.com/security/cors)
- [Socket.IO Handling CORS documentation](https://socket.io/docs/v3/handling-cors/)
- [NestJS Socket.IO + CORS + extraHeaders issue (GitHub #1482)](https://github.com/nestjs/nest/issues/1482)
- [Preventing Postgres race conditions with SELECT FOR UPDATE](https://on-systems.tech/blog/128-preventing-read-committed-sql-concurrency-errors/)
- [Handling Concurrency with Row-Level Locking in PostgreSQL (dev.to)](https://dev.to/nickcosmo/handling-concurrency-with-row-level-locking-in-postgresql-1p3)
- [Sign-in-with-Solana reference implementation](https://github.com/phantom/sign-in-with-solana)
- [Sign-In With Solana — beginner's guide](https://redev.rocks/articles/sign-in-with-solana-supabase)
- [How to Integrate Sign-in Authentication with a Solana Wallet (QuickNode)](https://www.quicknode.com/guides/solana-development/dapps/how-to-authenticate-users-with-a-solana-wallet)
- [Backpressure-aware SSE reconnection — memory/backoff patterns](https://mvpfactory.io/blog/backpressure-aware-sse-reconnection-in-mobile-clients-eventsource-gaps/)
- [Node.js Server-Sent Events production guide 2026](https://www.hirenodejs.com/blog/nodejs-server-sent-events-sse-2026)
- Project-internal: `initial-request-src/initial-project-context.md` (authoritative brief — domain gotchas referenced, not duplicated)
- Project-internal: `initial-request-src/initial-db-structure.sql` (schema — source of the uuid/enum/partial-index correctness constraints analyzed above)

---
*Pitfalls research for: NestJS/TypeORM/socket.io real-time ingest + prediction backend engineering layer*
*Researched: 2026-07-17*
