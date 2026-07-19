---
phase: quick-260719-iar
plan: 260719-iar
subsystem: ui
tags: [react, nextjs, live-hero, replay-provenance]

requires: []
provides:
  - "LiveHeroVM.isReplay (required boolean) mirroring backend Game.is_replay"
  - "REPLAY provenance chip on the Matches screen's live hero card header row"
affects: []

tech-stack:
  added: []
  patterns:
    - "Optional-chip pattern: guard a fragment with `vm.liveHero.<flag> && (<>...)`, each chip owns its own leading 3px dot separator so spacing composes correctly regardless of which chips are present"

key-files:
  created: []
  modified:
    - apps/gutcallfun-ui/src/state/types.ts
    - apps/gutcallfun-ui/src/services/adapters/matches.tsx
    - apps/gutcallfun-ui/src/components/screens/MatchesScreen.tsx

key-decisions:
  - "isReplay is required (not optional) on LiveHeroVM so tsc forces every construction site to decide it — cheap now since there is exactly one construction site (matches.tsx liveHero())"
  - "No `?? false` defaulting on g.is_replay — Game.is_replay is already non-optional boolean end-to-end; adding a default would mask a genuine backend contract break"
  - "Chip styled identically to the existing yellow stage chip (same geometry/typography) but in the codebase's established muted grey-blue metadata color (rgba(220,230,245,...)) to read as provenance, not competition info, and to avoid colliding with TEAM1_COL, TEAM2_COL, or the red LIVE dot"

requirements-completed: []

coverage:
  - id: D1
    description: "LiveHeroVM gains a required isReplay boolean field, wired from Game.is_replay with no defaulting"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (apps/gutcallfun-ui) — exit 0, proving the sole construction site was updated"
        status: pass
    human_judgment: false
  - id: D2
    description: "REPLAY chip renders in the live hero header row, guarded by isReplay, styled distinctly from the stage chip and LIVE dot, with correct spacing in all stage/replay combinations"
    verification: []
    human_judgment: true
    rationale: "Visual placement, color distinction, and spacing correctness require human eyes against a live replay game — this is exactly what the blocking checkpoint in the plan calls for"

duration: ~15min
completed: 2026-07-19
status: complete
---

# Quick Task 260719-iar: REPLAY Chip on Live Hero Card Summary

**Required `isReplay` field threaded from `Game.is_replay` through `LiveHeroVM` into a muted grey-blue REPLAY chip on the Matches screen's live hero header row.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 of 2 automated tasks complete; 1 checkpoint (blocking, human-verify) open
- **Files modified:** 3

## Accomplishments
- `LiveHeroVM` now declares a required `isReplay: boolean`, documented as mirroring `Game.is_replay` and driving the provenance chip
- `liveHero()` adapter in `matches.tsx` sets `isReplay: g.is_replay` directly, no coalescing
- `MatchesScreen` renders a `REPLAY` chip in the live hero header row, guarded by `vm.liveHero.isReplay`, styled to mirror the existing stage chip's shape/typography with a distinct muted grey-blue palette (`rgba(220,230,245,...)`), each with its own leading dot separator so spacing composes correctly whether or not the stage chip is present

## Task Commits

1. **Task 1: Plumb is_replay through LiveHeroVM into the adapter** - `c2f4273` (feat)
2. **Task 2: Render the REPLAY chip in the live hero header row** - `351a170` (feat)

_Task 3 (checkpoint:human-verify, gate=blocking) is open — awaiting user verification of the visual result. Not yet resumed._

## Files Created/Modified
- `apps/gutcallfun-ui/src/state/types.ts` - added required `isReplay: boolean` to `LiveHeroVM`, placed after `stage`
- `apps/gutcallfun-ui/src/services/adapters/matches.tsx` - `liveHero()` now sets `isReplay: g.is_replay`
- `apps/gutcallfun-ui/src/components/screens/MatchesScreen.tsx` - added conditional REPLAY chip block after the stage-chip fragment in the live hero header row

## Decisions Made
- Required (not optional) `isReplay` field so `tsc` proves every construction site was updated — see key-decisions in frontmatter.
- No default value on `g.is_replay` assignment — see key-decisions in frontmatter.
- Grey-blue chip color chosen over yellow/red/blue to avoid palette collisions with the stage chip, the LIVE dot, and TEAM2_COL — see key-decisions in frontmatter and the plan's `<design_decisions>`.

## Deviations from Plan

None - plan executed exactly as written. Both automated tasks matched the plan's file list, ordering, and styling table exactly.

## Issues Encountered

None during the two automated tasks. One pre-existing, out-of-scope finding surfaced during verification (see below).

## Verification Results

**Task 1 gate:**
```
$ cd apps/gutcallfun-ui && grep -c 'isReplay: boolean' src/state/types.ts && grep -c 'isReplay: g.is_replay' src/services/adapters/matches.tsx && npx tsc --noEmit
1
1
(exit 0)
```

**Task 2 gate:**
```
$ cd apps/gutcallfun-ui && grep -c 'vm.liveHero.isReplay' src/components/screens/MatchesScreen.tsx && grep -c 'REPLAY' src/components/screens/MatchesScreen.tsx && npx tsc --noEmit && npx eslint src/components/screens/MatchesScreen.tsx src/services/adapters/matches.tsx src/state/types.ts
1
1
(tsc exit 0)
.../MatchesScreen.tsx
  79:398  warning  Using `<img>` could result in slower LCP... @next/next/no-img-element
✖ 1 problem (0 errors, 1 warning)
(eslint exit 0)
```
The single eslint warning is on the pre-existing `<img src={arrow.src} .../>` ENTER-button icon (line 75 in `git show HEAD`, shifted to line 79 by this change's 4 inserted lines). Confirmed pre-existing via `git show HEAD:.../MatchesScreen.tsx | grep -n 'img src='` — out of scope, left untouched.

**Backend regression guard (untouched files):**
```
$ cd apps/gutcallfun-core && npx tsc --noEmit -p tsconfig.json
```
Reported pre-existing errors in `fixtures-cron.service.spec.ts`, `replay.spec.ts`, and `score-profile.service.spec.ts` (Jest mock typing issues, unrelated to this change). Confirmed pre-existing via `git status --short apps/gutcallfun-core` showing zero modifications in the backend app — this change touches only `apps/gutcallfun-ui`, so these are out of scope per the plan's constraints and left untouched. Per the plan's note, `npm run lint` (which uses `--fix`) was intentionally NOT run against the backend.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**BLOCKED on checkpoint:human-verify (gate=blocking).** The code changes are complete and committed (2/2 automated tasks), but the plan's final task is a blocking human-verify checkpoint requiring visual confirmation against a live replay game at http://localhost:4400 (Matches tab, Upcoming sub-tab). Per the plan's `<how-to-verify>`:

1. Confirm the live hero header reads `🏆 COMPETITION · REPLAY` (or `🏆 COMPETITION · STAGE · REPLAY` when a stage chip is present) with REPLAY in a muted grey-blue pill, for a game with `is_replay = true`.
2. Confirm the pill is visually distinct from the yellow stage chip and doesn't compete with the red pulsing LIVE dot.
3. Confirm spacing looks correct in both stage-present and stage-absent cases.
4. Confirm NO pill appears for `is_replay = false` games, and the header is otherwise unchanged.
5. Confirm the pill does not appear on Past sub-tab cards or upcoming fixture cards.

Checkpoint resolved: the user verified the chip in the browser and approved on 2026-07-19.

## Self-Check: PASSED

All 3 modified files and the SUMMARY.md file confirmed present on disk; both task commits (`c2f4273`, `351a170`) confirmed present in `git log`.

---
*Quick task: 260719-iar*
*Completed: pending checkpoint resolution*
