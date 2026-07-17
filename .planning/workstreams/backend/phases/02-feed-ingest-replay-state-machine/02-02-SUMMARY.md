---
phase: 02-feed-ingest-replay-state-machine
plan: 02
subsystem: state-machine
tags: [typescript, pure-functions, txline, possession-ladder, goal-reconciliation, jest]

# Dependency graph
requires:
  - phase: 01-foundation-data-layer
    provides: TypeORM models + migrations matching initial-db-structure.sql; env-validated config module
provides:
  - "possession.ts: classifyPossession() (exact-Action classification of the four staged possession actions), nextPossessionStage() stateful fold, createAttackStore() (feed-Ts attack-run segmentation)"
  - "goals.ts: classifyGoalEvent() (goal/action_amend/action_discarded classification), createGoalStore() (Id-anchored reconciliation + integer per-participant deriveScore())"
  - "clock.ts: feedElapsedMs() (match-time), wallClockNow()/isExpired() (user-time seam for Phase 4) — canonical STAT-03 two-clock home"
affects: [02-03-persistence-and-state-machine-wiring, phase-04-prediction-windows-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure state-machine modules (no NestJS DI, no DB) under src/modules/ingest/state/, consumed by a future injectable game-state machine (Plan 03)"
    - "Two-clock discipline: clock.ts is the single place feed-Ts (match-time) vs wall-clock (user-time) helpers live; possession.ts imports feedElapsedMs() and never calls Date.now()"
    - "Defensive inner-field read (parsed.Update ?? parsed) + try/catch-null on every classifier, tolerating both the flat TxLINE SSE shape and a Fusion-style {Update:{...}} envelope"

key-files:
  created:
    - apps/gutcallfun-core/src/modules/ingest/state/clock.ts
    - apps/gutcallfun-core/src/modules/ingest/state/possession.ts
    - apps/gutcallfun-core/src/modules/ingest/state/possession.spec.ts
    - apps/gutcallfun-core/src/modules/ingest/state/goals.ts
    - apps/gutcallfun-core/src/modules/ingest/state/goals.spec.ts
  modified: []

key-decisions:
  - "possession.ts's attack-run gap check uses feedElapsedMs() (feed Ts deltas) instead of the reference repo's node-stamped receivedAt wall-clock parameter, per this plan's explicit STAT-03 instruction — ingest() signature dropped the receivedAt argument entirely"
  - "AttackTrigger dropped the reference repo's anchorReceivedAt/confirmedReceivedAt/confirmedTs fields — those existed only to conform to that repo's own MeasurableTrigger/samples.ts metrics interface, not ported into this codebase"
  - "goals.ts is a substantial addition on top of the reference repo's pattern, not a verbatim port: the reference goals.ts only aggregates sightings for a latency-measurement feature and has no score, no action_discarded handling, and no action_amend handling at all — this plan's task explicitly required adding score derivation + discard/amend reconciliation, which this module does while reusing the reference's Id-anchor-to-earliest discipline"
  - "action_discarded's discarded-action Id is read from the message's own top-level Id field (Id is a reused incident id, never fresh, per PROJECT.md verified feed facts) — not from a nested Data.Id like action_amend"

requirements-completed: [STAT-01, STAT-03]

coverage:
  - id: D1
    description: "Possession stage classified by exact Action match against the four staged possession actions; a bare Action:'possession' message never advances the ladder"
    requirement: "STAT-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/possession.spec.ts#classifyPossession classifies safe_possession, attack_possession, danger_possession, high_danger_possession to distinct stages"
        status: pass
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/possession.spec.ts#classifyPossession does not classify a bare \"possession\" ball-holder-change marker as a danger stage"
        status: pass
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/possession.spec.ts#nextPossessionStage leaves the stage unchanged on a bare possession marker (not a ladder step)"
        status: pass
    human_judgment: false
  - id: D2
    description: "First-event/empty-state possession classification returns a defined initial stage, never undefined/crash; state self-heals from a single post-gap message"
    requirement: "STAT-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/possession.spec.ts#nextPossessionStage returns a defined initial stage for the first event ever seen (no crash/undefined)"
        status: pass
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/possession.spec.ts#nextPossessionStage self-heals from a single out-of-order/post-gap staged message without prior history"
        status: pass
    human_judgment: false
  - id: D3
    description: "Attack-run segmentation compares feed Ts deltas only (via clock.ts), never Date.now(); collapses within ATTACK_GAP_MS and starts a fresh run once the feed-Ts gap is exceeded"
    requirement: "STAT-03"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/possession.spec.ts#createAttackStore (feed-Ts attack-run segmentation) (4 tests: start/collapse/no-reset-on-safe/expire)"
        status: pass
      - kind: other
        ref: "grep -n \"Date.now\" apps/gutcallfun-core/src/modules/ingest/state/possession.ts (returns nothing)"
        status: pass
    human_judgment: false
  - id: D4
    description: "goals.ts dedups/reconciles on Id anchored to the earliest message; Confirmed:false then Confirmed:true on one Id counts as exactly one goal; action_discarded reverses a counted goal; replaying a sample sequence yields a final derived score equal to the sequence's terminal Score, with integer values throughout"
    requirement: "STAT-01"
    verification:
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/goals.spec.ts#createGoalStore counts Confirmed:false then Confirmed:true on one Id as a single goal (no double count)"
        status: pass
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/goals.spec.ts#createGoalStore reverses a previously-counted goal on action_discarded"
        status: pass
      - kind: unit
        ref: "apps/gutcallfun-core/src/modules/ingest/state/goals.spec.ts#createGoalStore replays a multi-goal sample sequence and matches the terminal Score field, with confirm/discard/amend churn"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-07-17
status: complete
---

# Phase 2 Plan 02: State Machine Modules Summary

**possession.ts (exact-Action danger-ladder classifier + feed-Ts attack-run segmentation) and goals.ts (Id-anchored goal confirm/discard/amend reconciliation with integer score derivation), backed by a canonical clock.ts two-clock helper module.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-17T19:31:00Z (approx.)
- **Completed:** 2026-07-17T19:56:11Z
- **Tasks:** 2
- **Files modified:** 5 (all created)

## Accomplishments
- Ported `classifyPossession`/`createAttackStore` from the reference monitor repo's `possession.ts` near-verbatim, adapted so attack-run segmentation compares feed `Ts` deltas (via the new `clock.ts`) instead of the reference's wall-clock `receivedAt` parameter — satisfying STAT-03's two-clock discipline as an explicit plan requirement
- Added `nextPossessionStage()`, a stateful fold required by the plan's task behavior spec: staged actions advance the ladder, a bare `possession` marker leaves the stage unchanged, and a missing prior stage resolves to a defined `INITIAL_STAGE` rather than crashing
- Built `goals.ts` reusing the reference repo's Id-anchor-to-earliest discipline but adding the score-derivation, `action_amend`, and `action_discarded` handling that repo's own `goals.ts` does not implement at all (that module only measures confirm-lag for an unrelated latency feature)
- `clock.ts` established as the single canonical home for STAT-03: `feedElapsedMs()` (match-time, used by `possession.ts` now) and `wallClockNow()`/`isExpired()` (user-time, unused until Phase 4's answer-window logic)
- 25 unit tests (13 possession, 12 goals) covering exact-Action classification, marker/no-substring-match behavior, first-event/self-heal, feed-Ts attack-run collapse/expire, confirm-after-unconfirmed single-counting, anchor preservation, discard reversal (counted and never-confirmed), amend no-op, and a full multi-goal replay sequence matching its terminal `Score`

## Task Commits

Each task was committed atomically:

1. **Task 1: Port possession.ts (danger ladder + attack-run classification) with unit tests** - `d983a72` (feat)
2. **Task 2: Port goals.ts (Id-keyed confirm/discard/amend reconciliation) with unit tests** - `75a4fcc` (feat)

**Plan metadata:** (this SUMMARY commit, committed after this file)

## Files Created/Modified
- `apps/gutcallfun-core/src/modules/ingest/state/clock.ts` - `feedElapsedMs()`/`wallClockNow()`/`isExpired()` two-clock discipline helpers (STAT-03)
- `apps/gutcallfun-core/src/modules/ingest/state/possession.ts` - `classifyPossession()`, `nextPossessionStage()`, `createAttackStore()` (danger-ladder classification + feed-Ts attack-run segmentation)
- `apps/gutcallfun-core/src/modules/ingest/state/possession.spec.ts` - 13 unit tests
- `apps/gutcallfun-core/src/modules/ingest/state/goals.ts` - `classifyGoalEvent()`, `createGoalStore()` (Id-anchored reconciliation + `deriveScore()`)
- `apps/gutcallfun-core/src/modules/ingest/state/goals.spec.ts` - 12 unit tests

## Decisions Made
- Fetched the actual reference source (`github.com/mckrava/txodds-txline-api-monitor` `src/possession.ts` / `src/goals.ts`) directly via `curl` at implementation time rather than trusting RESEARCH.md's AI-summarized description (RESEARCH Open Question 1 / Assumption A1) — this surfaced that the reference `goals.ts` is a latency-measurement aggregator with no score/discard/amend logic, materially different from what RESEARCH.md's summary implied
- Routed `possession.ts`'s attack-run gap check through `clock.ts`'s `feedElapsedMs()` against feed `Ts`, dropping the reference repo's `receivedAt` wall-clock parameter from `AttackStore.ingest()`'s signature entirely — this was the plan's own explicit instruction ("Extract the feed-Ts delta arithmetic into clock.ts... do not scatter raw Date.now() calls"), not an unplanned deviation
- `action_discarded`'s target Id is read from the message's own top-level `Id` field (matching message-reference.md: "Discards the previously added action whose `Id` matches the provided `Id` field"), distinct from `action_amend`'s `Data.Id` nesting
- Derived score modeled as `{ participant1, participant2 }` integer goal counts per team rather than a single combined total, so a replayed sample sequence can be asserted against the feed's structured `Score.Participant{1,2}.Total.Goals` shape (message-reference.md)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] goals.ts required substantial addition beyond a verbatim port**
- **Found during:** Task 2 (reading the actual reference source via curl, per `<read_first>`)
- **Issue:** The plan's action text and RESEARCH.md assumed the reference repo's `goals.ts` already implements goal confirm/discard/amend score reconciliation ("port the real goals.ts near-verbatim... Handle action_amend... and action_discarded... Expose a score-derivation function"). The actual fetched source only aggregates Id-keyed sightings for an unrelated latency-measurement feature ("I SAW IT ON TV" button) — it has zero score/discard/amend logic to port.
- **Fix:** Reused the reference repo's genuinely portable piece (Id-anchor-to-earliest sighting aggregation) and built the score-derivation + `action_amend`/`action_discarded` reconciliation logic the plan's task explicitly requires on top of it, documented clearly in the file header so future readers understand what was ported vs. added.
- **Files modified:** `apps/gutcallfun-core/src/modules/ingest/state/goals.ts`
- **Verification:** 12 unit tests including a multi-goal replay sequence whose derived score matches the sequence's terminal `Score` field under confirm/discard/amend churn.
- **Committed in:** `75a4fcc` (Task 2 commit)

**2. [Rule 2 - Missing Critical Functionality] possession.ts's stateful ladder-advancement fold was not present in the reference source**
- **Found during:** Task 1 (matching the plan's `<behavior>` spec against the actual fetched `classifyPossession`, which is a stateless per-message classifier with no "prior stage" concept)
- **Issue:** The plan's task behavior explicitly requires "given a bare 'possession' message, it returns unchanged prior stage" and "given no prior state, the classifier returns a defined initial stage" — behaviors the reference repo's stateless `classifyPossession` cannot express on its own (it returns `null` for markers, with no notion of a running stage).
- **Fix:** Added `nextPossessionStage(priorStage, parsed)` as a small stateful fold on top of the ported `classifyPossession`, satisfying both required behaviors without altering the ported classifier itself.
- **Files modified:** `apps/gutcallfun-core/src/modules/ingest/state/possession.ts`
- **Verification:** 4 dedicated unit tests (first-event initial stage, ladder advancement, marker no-op, self-heal from a single post-gap message).
- **Committed in:** `d983a72` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 missing-critical-functionality additions, both directly instructed by the plan's own task text/behavior spec rather than independently invented scope)
**Impact on plan:** Both additions were necessary to satisfy the plan's explicit acceptance criteria; the reference-repo "port near-verbatim" guidance applied fully to the parts of the reference source that actually existed (classification lookup tables, Id-anchor discipline), while the score/discard/amend/stateful-fold logic — genuinely absent from the reference repo — was added per the plan's own instructions. No scope creep beyond what Task 1/Task 2 explicitly asked for.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `possession.ts`, `goals.ts`, and `clock.ts` are pure, dependency-free modules ready for Plan 03's `game-state.machine.ts` to import and wire into a per-game singleton registry (STAT-01/STAT-02).
- `clock.ts`'s `wallClockNow()`/`isExpired()` are defined but unused until Phase 4's answer-window (`expires_at`) logic — the canonical two-clock seam already exists so Phase 4 does not need to invent it.
- No blockers. Plan 03 should read this SUMMARY's Decisions section before wiring `possession.ts`/`goals.ts` into the persistence/state-machine layer, since the actual module shapes differ from RESEARCH.md's pre-implementation assumptions about the reference repo.

---
*Phase: 02-feed-ingest-replay-state-machine*
*Completed: 2026-07-17*

## Self-Check: PASSED

All created files verified present on disk; all task/summary commit hashes (`d983a72`, `75a4fcc`, `4f318e9`) verified in `git log --all`.
