# Phase 02.1 — Capability Coverage

**Produced:** 2026-07-18 (planning)
**Gate:** `workflow.api_coverage_gate` fired `detected: true` for this phase.

---

## ⚠ READ THIS FIRST: what this document actually is

**This is a FIRST-PARTY API surface, not an external integration.**

This phase integrates **no** third-party service, vendor SDK, or external API. There is no
provider whose endpoint catalogue is being wrapped. The api-coverage detector fired on the words
"integrate" and "REST"/"API" in the phase goal and title — that match is a **false positive** with
respect to the gate's literal subject (external-provider capability coverage).

The gate's *underlying purpose* does apply, and is honoured here. The risk it guards against is:
*"we shipped whatever the first use case happened to exercise, and the gaps were never decided."*
That risk is real for this phase — the originating user request (`initial-request-src/api-mockup.md`)
omitted seven capabilities the UI genuinely needs, which is precisely why they were surfaced and
added during `/gsd-discuss-phase` (see `02.1-CONTEXT.md` → "Endpoint additions agreed beyond the
original api-mockup.md list").

So the "capability surface" enumerated below is **the first-party endpoint and WebSocket-event
surface this phase freezes**, not a vendor's API. A future reader must not conclude that a vendor
API was wrapped in this phase.

**Disposition legend**
- `INTEGRATE` — the capability is implemented in this phase (as a contract-frozen mock).
- `OPT-OUT` — deliberately not implemented; reason recorded on the row.

---

## REST capability surface

| # | Capability | Method + Path | Req | Plan | Disposition | Notes / opt-out reason |
|---|---|---|---|---|---|---|
| 1 | List / filter users | `GET /users?wallet_address=&handle=&squad_id=&limit=&offset=` | API-01 | 02 | INTEGRATE | `squad_id` filter = "my teammates" |
| 2 | Get user by id | `GET /users/:user_id` | API-01 | 02 | INTEGRATE | |
| 3 | Create user | `POST /users` | API-01 | 02 | INTEGRATE | Wallet sign-in deliberately bypassed (D-02) |
| 4 | Update user (handle, image) | `PATCH /users/:user_id` | API-01 | 02 | INTEGRATE | Added at user request; overrides CUT-04 |
| 5 | Get user score profile | `GET /users/:user_id/score-profile` | API-01 | 02 | INTEGRATE | FK direction is reversed — see schema note |
| 6 | Create squad | `POST /squads` | API-01 | 02 | INTEGRATE | `squad.id` has no DB default — id assigned explicitly |
| 7 | Get squad by id | `GET /squads/:squad_id` | API-01 | 02 | INTEGRATE | |
| 8 | List squads by participant | `GET /squads?participant_id=` | API-01 | 02 | INTEGRATE | |
| 9 | Add squad participant | `POST /squads/:squad_id/participants` | API-01 | 02 | INTEGRATE | |
| 10 | List squad participants | `GET /squads/:squad_id/participants` | API-01 | 02 | INTEGRATE | |
| 11 | Get squad score profile | `GET /squads/:squad_id/score-profile` | API-01 | 02 | INTEGRATE | |
| 12 | List / filter games | `GET /games?status=&user_id=&limit=&offset=` | GAME-02 | 03 | INTEGRATE | Denormalized score + team names |
| 13 | Get game by id | `GET /games/:game_id` | GAME-02 | 03 | INTEGRATE | Added beyond original request — live-game screen needs it |
| 14 | List game events (paginated) | `GET /games/:game_id/events?after_seq=&limit=` | GAME-02 | 03 | INTEGRATE | Seq-cursor, not offset — matches the append-only log |
| 15 | List game questions | `GET /games/:game_id/questions?state=` | GAME-02 | 03 | INTEGRATE | `options[]` embedded (4 LOCKED options) |
| 16 | Join a game | `POST /games/:game_id/join` | GAME-03 | 03 | INTEGRATE | Creates the `user_game` row the original list never created |
| 17 | List question outcomes | `GET /question-outcomes` | GAME-02 | 03 | INTEGRATE | 4 static reference rows + `ladder_position` |
| 18 | Submit answer | `POST /answers` | API-01 | 03 | INTEGRATE | |
| 19 | List answers by user + game | `GET /answers?user_id=&game_id=` | API-01 | 03 | INTEGRATE | Restores answered state after refresh |
| 20 | Global leaderboard | `GET /leaderboard?limit=&offset=` | LDRB-01 | 03 | INTEGRATE | Pre-sorted deterministic array |
| 21 | OpenAPI document + UI | `GET /api-docs`, `GET /api-docs-json` | API-01 | 01, 05 | INTEGRATE | |

## WebSocket capability surface

| # | Capability | Direction | Event | Req | Plan | Disposition | Notes |
|---|---|---|---|---|---|---|---|
| 22 | Subscribe to a game room | client → server | `subscribe` | WS-01 | 04 | INTEGRATE | Payload `{ game_id }` |
| 23 | Unsubscribe from a game room | client → server | `unsubscribe` | WS-01 | 04 | INTEGRATE | Needed for clean room teardown / timer stop |
| 24 | Full snapshot on subscribe | server → client | `snapshot` | WS-01 | 04 | INTEGRATE | Includes match clock (D-07) |
| 25 | Event heartbeat | server → client | `game_event` | WS-02 | 04 | INTEGRATE | ~4s cadence |
| 26 | New prediction window | server → client | `question` | WS-02 | 04 | INTEGRATE | ~30s cadence, 4 options, `expires_at = now + 5s` |
| 27 | Window resolution | server → client | `resolution` | WS-02 | 04 | INTEGRATE | ~5s after its `question` |
| 28 | Window void / refund | server → client | `void` | WS-02 | 04 | **OPT-OUT (shape only)** | DTO shape is frozen and Swagger-registered so Phase 5 does not change the contract, but the fake cycle deliberately never emits it — there is no void condition to simulate without real window logic (Phase 4) |

---

## OPT-OUT register (capabilities deliberately not built)

| Capability | Disposition | Reason |
|---|---|---|
| Update squad (`PATCH /squads/:squad_id`) | OPT-OUT | Explicitly out of scope per `02.1-CONTEXT.md`. Squads are roadmap/NICE scope (NICE-02); no UI screen requires editing a squad in v1. |
| Delete squad (`DELETE /squads/:squad_id`) | OPT-OUT | Same as above. `squad.deleted_at` exists in the schema but no v1 flow soft-deletes a squad. |
| Real authentication (nonce / signature / JWT / guard) | OPT-OUT | Phase 3 owns AUTH-01/02/03. D-02 locks "no auth at all" for this phase and explicitly forbids adding a stub. `user_id` is a caller-supplied param. The signature-change cost when Phase 3 lands was shown to the user and accepted. |
| Real window opening / resolution logic | OPT-OUT | Phase 4 owns WNDW-01..04 and RESL-01..05. This phase emits a fake `question` → `resolution` cycle on a timer; no attack detection, no debounce, no VAR settlement. |
| Real persistence behind any endpoint | OPT-OUT | Phase 5 owns the swap. Every service reads static fixtures; no repository is injected this phase (D-05). |
| Real WS wiring to the live state machine | OPT-OUT | Phase 5. The realtime module has zero imports from `IngestModule` precisely so this swap is a deletion, not a refactor. |
| User profile fields beyond `handle` and `image` | OPT-OUT | `PATCH /users/:user_id` was added at user request as a deliberate override of CUT-04, but scoped to the two fields the profile screen edits. `wallet_address`, `share_code`, `score_profile`, and `id` are not client-mutable — `forbidNonWhitelisted` rejects them. |
| Delete user / deactivate account | OPT-OUT | No screen in the UI mockups requires it; not in the originating request and not raised during discussion. |
| Squad score-profile *write* | OPT-OUT | Score profiles are populated by resolution logic (Phase 4) and aggregation (Phase 5); there is no client-initiated write path in any milestone scope. |

---

## Traceability

- **Source of the surface:** `initial-request-src/api-mockup.md` (original request) + the
  "Endpoint additions agreed beyond the original list" table in `02.1-CONTEXT.md` (user-approved).
- **Source of every field name and type:** `initial-request-src/initial-db-structure.sql`
  (authoritative). DTO properties are declared literally in `snake_case` to match it 1:1.
- **Requirements frozen (interface only):** GAME-02, GAME-03, LDRB-01, API-01, API-02, WS-01,
  WS-02, WS-03. These remain `Pending` against **Phase 5** in `REQUIREMENTS.md` — this phase
  satisfies their *interface*, not their behaviour, and must not mark them complete.
