# Feature Research

**Domain:** Real-time sports second-screen companion + micro-prediction backend (live match tracker + play-along prediction game)
**Researched:** 2026-07-17
**Confidence:** HIGH (scope, mechanics, and data model are locked in the project's own authoritative brief and schema — `initial-request-src/initial-project-context.md` and `initial-db-structure.sql`; general industry patterns cited below are LOW-confidence web corroboration used only to validate, never to expand, that scope)

## Feature Landscape

This is not an open "what could we build" survey — the product scope is LOCKED and a CUT list exists. This document catalogues what a backend in this category (live-score companion + play-along prediction) must expose to be non-broken (table stakes), what makes GutCall's specific implementation stand out within that locked scope (differentiators — already decided, not proposed), and what to explicitly not build, cross-referenced against the brief's CUT list plus a few backend-specific anti-features not mentioned there.

### Table Stakes (Users Expect These)

Backend-visible behaviors that any live-match second-screen / play-along prediction product needs. Missing any of these makes the product feel broken, not just "basic."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Wallet-based auth, session issuance | Users need a persistent identity across visits without a password; on-brand for a Solana-adjacent hackathon | LOW | Sign-message challenge/verify → server session/JWT. Backend creates internal `user.id` (uuid) distinct from `wallet_address` — never conflate auth credential with app identity |
| Fixture/game discovery list | Users need to know what's live/upcoming before joining anything | LOW | 1-min cron against TxLINE fixtures; denormalize `team1_name/team2_name/competition/starts_at` onto `game` at creation so the list never depends on a live stream call |
| Snapshot-on-join for live state | A user joining at minute 60 must render score/clock/possession instantly — no "wait for the next event" gap | MEDIUM | Non-negotiable in this category (corroborated broadly across real-time dashboard/leaderboard architecture: push a full snapshot immediately on subscribe, then switch to deltas — LOW-confidence web pattern, but matches the brief's explicit design) |
| Live score + clock + status push | The entire premise is "second screen for what's happening now" | LOW–MEDIUM | Derived from in-memory per-game state machine, pushed on `game_event`; `Clock.Seconds` counts down and `StatusId` is an open set — never treat as closed enum |
| Time-boxed answer window with a hard server-side deadline | Users must trust the game isn't rigged; late answers must be provably rejected, not just UI-hidden | MEDIUM | Reject when `state != 'open'` OR `now > expires_at` — server is the sole authority, never trust client-side timer. Aligns with the general "server-side authoritative deadline" pattern for live trivia/quiz answer windows (LOW-confidence web corroboration) |
| One question at a time, no double-answering | Prevents duplicate submissions / cheating and matches the "one live question" mental model of play-along formats | LOW | DB-enforced: partial unique index `game_question(game_id) WHERE state='open'`; `UNIQUE(user_id, game_question_id)` |
| Resolution + points delivered promptly | Users expect near-immediate feedback ("did I get it right") for non-ambiguous outcomes | LOW–MEDIUM | Fizzles/danger/shot resolve instantly; only goals wait on confirmation |
| Global leaderboard, always fresh | Competitive/social hook of any play-along format — without it, points are meaningless | LOW | `SUM(awarded_points)` per user; indexed for `GROUP BY user_id` |
| Reconnect without state loss | Mobile second-screen use implies flaky connections (switching apps, walking around); losing all state on reconnect breaks trust | MEDIUM | Persisted `stream_cursor` as resume token (own-ingest side) + client rejoin gets a fresh snapshot (client side) — matches the general sequence-number + catchup pattern seen across real-time systems (LOW-confidence web corroboration), but this project's specific mechanism (frame-id resume, not seq-synthesized) is the authoritative design |
| Idempotent event ingest | A single dropped/duplicated upstream message must never corrupt state or double-pay a user | MEDIUM | `UNIQUE(game_id, seq)` + `ON CONFLICT DO NOTHING`; verified safe against 23,510-record corpus (zero non-identical seq collisions) |
| Graceful handling of unknown event types | Feed evolves; the app has 100+ observed `StatusId`/`Action` values, not a closed set | LOW | Store-and-ignore unknown actions; never crash on an unrecognized `type` |
| API documentation (Swagger) | Baseline expectation for any REST surface, doubly so for a hackathon deliverable judged partly on completeness | LOW | ~5 endpoints; low effort, explicitly required by PROJECT.md |

### Differentiators (Competitive Advantage)

These are the specific mechanics the brief has already chosen as GutCall's edge within the table-stakes category above — not proposals, but backend implications worth calling out because they carry real complexity and must not be diluted or simplified away under deadline pressure.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Attack-start-triggered prediction windows (not fixed-interval polling) | Windows fire exactly when the moment is live ("How far will this attack go?") rather than on a generic clock — this is the hero mechanic, tied 1:1 to the possession heat-map the user is already watching | MEDIUM | Trigger = first `attack_possession` for a team, gated to in-play `StatusId ∈ {2,4,7,9}` only |
| Shot-based outcome ladder with empirically calibrated EV-balanced points | Most naive prediction games use flat or intuition-guessed payouts; this one is corner-corrected against measured attack-escalation frequencies (n=1,708) so no single answer dominates | MEDIUM | fizzles/danger/shot/goal at 5/7/15/100 — LOCKED, do not recalibrate; `base_gain` frozen per option instance so future recalibration can't retroactively rewrite already-asked questions |
| 12-second attack debounce | Prevents the common real-time-sports-app bug of closing a window on a momentary "safe" event that's actually still inside a live attack (2 of 3 corpus goals had an interleaved safe event right before scoring) | MEDIUM–HIGH | Correctness feature, not a nice-to-have; naive close-on-safe would grade a correct GOAL pick as wrong |
| Pending-confirmation goal settlement (VAR-aware payout delay) | Mirrors the actual TV-watching tension (is it given? is it overturned?) instead of paying out an unconfirmed goal that gets discarded 17.5% of the time | HIGH | `open → pending_confirmation → resolved`; re-resolution on discard must recompute both the question FK and affected answers' `awarded_points`, not just one |
| Two-clock discipline (event-Ts vs wall-clock) | Prevents reconnect-catch-up floods from corrupting match-time logic (a burst of resumed events in 1s spanning a real 30s gap) while keeping user-facing answer deadlines fair and wall-clock-accurate | MEDIUM | Match-time logic (debounce, run segmentation) uses event `Ts` deltas; answer TTL uses server wall clock — conflating the two is the most likely subtle bug source in this codebase |
| Void-and-refund policy on coverage gaps | Protects fairness/trust: a user should never lose points to a network hiccup, suspended play, or a server restart they had no way to see coming | MEDIUM | Any window open/pending across a seq gap, reconnect, `suspend`/`disconnected`, or restart-with-unrecovered-hole is voided, not resolved |
| Replay-driven demo/testing harness sharing the exact production code path | `is_replay` swaps only the ingest source; the state machine, windows, resolution, and WS push never know the difference — this is what makes a reliable, repeatable hackathon demo possible without depending on a live match existing at recording time | MEDIUM | Built early as core infra, not bolted on after; also doubles as the rare-path test harness (disallowed goal, discarded shot, coverage drop mid-window) |

### Anti-Features (Do Not Build)

Backend behaviors that would seem reasonable for this product category but are explicitly excluded — either because the brief's CUT list already forbids them, or because they're common failure modes for this category of app that would burn hackathon time without serving the locked Core Value.

| Feature | Why It Seems Reasonable | Why Problematic Here | Alternative |
|---------|--------------------------|----------------------|-------------|
| Full squads (create/QR-join/cards/squad leaderboards) | Social/competitive layer is a natural extension of a leaderboard | On CUT list explicitly; squad tables exist in schema only for roadmap completeness, not build scope; would consume remaining pre-freeze hours | Ship global leaderboard only; squads exist as unused schema for a future milestone |
| Pre-match predictions | Feels like an obvious complement to in-match predictions | On CUT list; different trigger model (no attack event to hang off), separate scoring path — real scope creep, not a variant of the shipped mechanic | None for this milestone |
| Multi-game management / following several games at once | Users watching multiple screens might want it | On CUT list; multiplies WS subscription/state complexity for zero judged-criteria benefit | Single active game per session |
| Achievement cards, sharing images, EKG match-summary graphic | Common retention/virality hooks for prediction/companion apps | On CUT list; asset-generation and rendering pipeline work with no backend-mechanics payoff before freeze | None — demo video carries the "show, don't build" narrative instead |
| AI commentary | Trendy addition to "live companion" products | On CUT list; nondeterministic output is actively risky next to a replay-driven, judged demo | Heat-map + score/clock is the "commentary" |
| Geodata / location features | Some second-screen apps use geo for local-fan framing | On CUT list; no mechanic depends on it | None |
| GraphQL / subscriptions transport | Common choice for "live" apps with many entity types | Explicitly rejected in the brief — ~5 REST endpoints + 3-4 WS message types don't justify the machinery; would burn setup time for zero UX gain | REST + socket.io only |
| Horizontal scaling / multi-process ingest | "Real-time apps should scale horizontally" is generic best practice | The SSE ingest is inherently single-writer per fixture (stream_cursor is scoped to one connection); premature scaling work here risks breaking idempotency invariants that are the actual correctness backbone | Single long-lived process; scale later only if a real second milestone demands it |
| Client-authoritative answer timing / trusting client-reported "I answered in time" | Simpler to implement, avoids clock-skew edge cases | Removes the one guarantee that makes the leaderboard meaningful — trivially exploitable, and this category (play-along prediction with points) lives or dies on perceived fairness | Server-side `now > expires_at` check is the sole authority (already the locked design) |
| Optimistic/instant payout on unconfirmed goals | Feels more responsive, avoids a "pending" UI state | 17.5% of goals in the empirical corpus were later discarded — instant payout would require clawing back points already shown to a user, which is worse for trust than a short pending state | Pending-confirmation flow (already the locked design) |
| Mutable event log / in-place event correction | Simpler mental model — just update the row when a confirm/discard arrives | Breaks the replay-as-demo-source guarantee and the audit trail resolution depends on; `game_event` must stay append-only | New row per confirm/amend/discard, keyed by `(action_id, type)`; latest-per-key read pattern |
| Real-value tokens / actual wagering | Solana presence invites the assumption this is a betting product | Explicitly out of scope — "no real money, no gambling, no valuable tokens"; would also trigger regulatory/legal complexity irrelevant to a hackathon | Points only, no monetary value, Solana used solely for wallet-signature auth |
| Rich user-profile management (avatar upload, bio editing, etc.) | Natural companion to wallet-based identity | PROJECT.md explicitly marks profile-update endpoints as ignorable for now | Server-generated avatar seed + handle at signup; no update endpoints |

## Feature Dependencies

```
Wallet auth (session/JWT)
    └──requires──> user.id issuance (uuid, share_code, handle, avatar) at first sign-in

Fixture cron (game rows)
    └──requires──> TxODDS auth (guest JWT + on-chain subscribe + API token activation)

TxLINE SSE ingest → game_event log
    └──requires──> Fixture cron (game row must exist before ingest can attach events)
    └──requires──> Idempotent seq handling (UNIQUE(game_id, seq))

Per-game in-memory state machine (possession, clock, status)
    └──requires──> game_event log (state is derived, never independently sourced)

Prediction window open (attack_possession trigger)
    └──requires──> State machine (possession stage, StatusId gating)
    └──requires──> 12s attack debounce logic (correctness gate on window close)

Resolution (fizzles/danger/shot instant; goal via pending_confirmation)
    └──requires──> Prediction window lifecycle
    └──requires──> Two-clock discipline (event Ts for match logic)

Answer submission + lock
    └──requires──> Open prediction window (question.state='open', now <= expires_at)
    └──requires──> Wallet auth (user identity)

Leaderboard (SUM(awarded_points))
    └──requires──> Resolution (awarded_points populated)

WS snapshot-on-subscribe
    └──requires──> State machine (source of the snapshot payload)
    └──requires──> Wallet auth (session gates subscribe, if per-user state is ever added — snapshot itself is game-scoped, not user-scoped)

Restart recovery (rebuild state, resume stream_cursor)
    └──requires──> game_event log (append-only, replayable)
    └──requires──> Persisted stream_cursor (same-tx-as-event-insert discipline)

Replay emitter (demo + test harness)
    └──enhances──> Every downstream stage above (identical code path as live ingest)
    └──conflicts with──> None — is_replay only switches the source
```

### Dependency Notes

- **Prediction windows require the state machine, which requires the event log, which requires the fixture cron.** This is a strict pipeline — build order in the brief (`ingest → log → state → windows → resolution → WS`) is not arbitrary, it's the dependency graph. Any phase plan that tries to build windows before ingest is trustworthy will hit deadlock.
- **The 12s debounce and two-clock discipline are correctness gates inside "prediction windows," not separate features** — they cannot be deferred to a later phase without producing wrong resolutions (naive close-on-safe grades correct picks as losses).
- **Leaderboard has no independent complexity of its own** — it is a read/aggregate over `user_game_answer.awarded_points`, which only exists once resolution works. Building a "leaderboard service" ahead of resolution being correct produces a leaderboard that reflects a broken points model.
- **Restart recovery and the replay emitter share code** (both replay `game_event` rows through the same state machine) — treating them as unrelated backlog items risks duplicate implementation. Building the replay emitter first (as the brief mandates) gives restart recovery "one weird trick" for free.
- **WS snapshot-on-subscribe conflicts with nothing but has an ordering constraint**: it can only be built meaningfully once the state machine holds real derived state — an earlier "snapshot" would just be `null` fields.

## MVP Definition

Scope here is not a proposal — it mirrors PROJECT.md's Active/Out-of-Scope split exactly, restated as launch-vs-defer for roadmap consumption.

### Launch With (v1 — everything in PROJECT.md's Active/LOCKED CORE list)

- [ ] Wallet-based signup/signin, internal `user.id` distinct from `wallet_address`, unique `share_code`/`handle`/avatar seed — the only identity mechanism this product needs
- [ ] Fixtures cron (1-min) populating `game` rows — required before any live behavior can attach
- [ ] TxLINE SSE ingest → append-only, idempotent `game_event` log — the trust foundation everything else derives from
- [ ] Replay emitter (source-agnostic, timestamp-rebased, speed-factored) — built early; doubles as demo path and test harness
- [ ] Per-game in-memory state machine (possession gradient, 12s debounce, two-clock discipline) — the derived "now" the whole product reacts to
- [ ] Prediction windows on `attack_possession`, one active per game, shot-based ladder at LOCKED points — the hero mechanic
- [ ] Resolution: instant for fizzles/danger/shot; pending-confirmation flow for goals; void-and-refund on gaps/suspends/restarts — fairness backbone
- [ ] Answer submission with server-side lock (`state='open'` AND `now <= expires_at`), one answer per user per question
- [ ] Global live leaderboard (`SUM(awarded_points)`)
- [ ] REST API (~5 endpoints) + Swagger
- [ ] socket.io: snapshot-on-subscribe + go-forward pushes (game_event, question, resolution, void)
- [ ] Restart recovery (replay own event log, resume via `stream_cursor` as Last-Event-ID, gap policy)
- [ ] TypeORM models/migrations matching the authoritative schema; Postgres 16; env-validated config

### Add After Validation (v1.x — NICE list, only if core lands by evening July 17)

- [ ] In-match streak multiplier (folds into existing `reward_multiplier` field — schema already supports it)
- [ ] Haptics/sound cues on danger transitions (Android) — frontend-only, no backend change
- [ ] Minimal squads: join by invite code + leaderboard filter (schema has `squad`/`squad_participant`/`invite_code` already; NOT full squad CRUD)

### Future Consideration (v2+ — explicit CUT list, not planned as phases)

- [ ] Full squads (create/QR/cards/squad leaderboards), user-ID-sharing squad add flow
- [ ] Pre-match predictions
- [ ] Multi-game management
- [ ] Achievement cards, EKG match-summary graphic, sharing images
- [ ] AI commentary
- [ ] Geodata
- [ ] User profile update endpoints

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Wallet auth + user creation | HIGH | LOW | P1 |
| Fixtures cron | HIGH | LOW | P1 |
| TxLINE ingest + event log (idempotent) | HIGH | MEDIUM | P1 |
| Replay emitter | HIGH (demo-critical) | LOW–MEDIUM | P1 |
| State machine (possession/clock/status) | HIGH | MEDIUM | P1 |
| Prediction windows (trigger + debounce) | HIGH | MEDIUM–HIGH | P1 |
| Resolution (instant + pending-confirmation) | HIGH | HIGH | P1 |
| Answer submission + server-side lock | HIGH | LOW–MEDIUM | P1 |
| Leaderboard | HIGH | LOW | P1 |
| WS snapshot-on-subscribe + go-forward push | HIGH | MEDIUM | P1 |
| Restart recovery | MEDIUM (judges likely won't trigger it, but a mid-demo crash is catastrophic) | MEDIUM | P1 |
| Swagger docs | MEDIUM (judged on completeness) | LOW | P1 |
| Streak multiplier | LOW–MEDIUM | LOW (schema-ready) | P2 |
| Haptics/sound | LOW (frontend, judge-visible on Android demo) | LOW | P2 |
| Minimal squads (invite code + filter) | LOW | MEDIUM | P2 |
| Full squads / sharing / AI commentary / geodata / etc. | N/A (explicitly cut) | N/A | Not planned |

**Priority key:**
- P1: Must have for launch (July 19 deadline) — this is the entire LOCKED CORE list; there is no P1/P2 tradeoff space within it, all 13 P1 rows are required for the Core Value ("live loop works end-to-end and is demoable from replay") to hold
- P2: Only if P1 lands by evening July 17 (NICE list, explicit in PROJECT.md)
- Not planned: CUT list — do not schedule, do not phase, do not resurrect under time pressure

## Competitor Feature Analysis

Given the deadline and locked scope, this is framed as "what similar products in this category typically expose at the backend/API level" rather than a named-competitor teardown — the brief already made the product decisions; this table exists to confirm GutCall's locked mechanics aren't missing an industry-standard baseline.

| Feature | Typical live-score companion app (e.g. FotMob-style trackers) | Typical play-along prediction/trivia app (e.g. HQ-Trivia-style) | GutCall's Approach |
|---------|-----------------------------------------------------------------|----------------------------------------------------------------|---------------------|
| Live score/clock push | Poll or WS push of score+clock+events; snapshot on load is standard | N/A (not their focus) | WS snapshot-on-subscribe + go-forward `game_event` push, sourced from a self-healing per-game state machine |
| Prediction/question timing | N/A (not their focus) | Fixed-interval or host-triggered questions, flat time window (e.g. 10s), server-authoritative deadline | Event-triggered (attack start) window, 5s TTL, server-authoritative deadline (`now <= expires_at`), debounced close for correctness |
| Answer resolution | N/A | Usually instant (question outcomes are unambiguous, e.g. multiple-choice trivia) | Instant for 3 of 4 outcomes; deliberate pending-confirmation delay for goals to match real-world VAR uncertainty — this is the category-specific twist, not a generic pattern |
| Leaderboard | Rarely core to the product (more stats/news-focused) | Central to product; usually simple cumulative score, sometimes with elimination rounds | Cumulative `SUM(awarded_points)`, no elimination — matches trivia-app norm, simpler than most (no round-based reset) |
| Reconnect/session recovery | Snapshot-based reload is standard, no special resume protocol needed since content is not time-critical per-user | Often weaker — many trivia apps just drop a disconnected player from that round | Explicit resume via `stream_cursor` (Last-Event-ID) + full snapshot on client rejoin — stronger guarantee than either category typically ships, justified because points/fairness are at stake |
| Anti-cheat on answer timing | N/A | Server-side deadline check is close to universal for any product with a leaderboard | Same pattern; reinforced by the void-on-gap/void-on-restart policy, which most trivia apps don't need (no live upstream feed as an attack surface) |

## Sources

- `initial-request-src/initial-project-context.md` — authoritative implementation brief (LOCKED scope, CUT list, prediction mechanic design, empirically calibrated points, TxLINE verified facts). Confidence: HIGH (project's own curated authoritative source, explicitly prioritized over all other documents).
- `initial-request-src/initial-db-structure.sql` — authoritative DB schema, validated PostgreSQL (v2). Confidence: HIGH (explicitly the top-priority source per PROJECT.md when documents disagree).
- `.planning/PROJECT.md` — Active/Out-of-Scope requirement lists, constraints, key decisions. Confidence: HIGH (project's own governing document).
- WebSearch: "WebSocket snapshot on subscribe reconnect pattern real-time live sports app architecture" — general industry pattern corroboration (snapshot-then-delta, sequence-based reconnect). Confidence: LOW (general web sources, not sports/prediction-specific; used only to confirm the brief's design is industry-standard, not to alter scope).
- WebSearch: "live trivia prediction app backend answer submission race condition server-side lock deadline" — general pattern corroboration (server-authoritative deadline, channel-based answer submission). Confidence: LOW (general web sources; concurrency/race-condition specifics were not well covered in results — flagged as a gap below).
- WebSearch: "real-time leaderboard architecture WebSocket push design best practices" — general pattern corroboration (aggregate-based scoring, WS push on update, durable-store-plus-cache pattern). Confidence: LOW (general web sources; GutCall's simpler single-table SUM approach is adequate at hackathon scale and does not need the Redis-sorted-set pattern these sources describe).

---
*Feature research for: real-time sports second-screen micro-prediction backend*
*Researched: 2026-07-17*
