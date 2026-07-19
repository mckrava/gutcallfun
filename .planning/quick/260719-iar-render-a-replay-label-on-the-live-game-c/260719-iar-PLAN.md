---
quick_id: 260719-iar
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: []
files_modified:
  - apps/gutcallfun-ui/src/state/types.ts
  - apps/gutcallfun-ui/src/services/adapters/matches.tsx
  - apps/gutcallfun-ui/src/components/screens/MatchesScreen.tsx

must_haves:
  truths:
    - "When the live game has is_replay=true, a REPLAY chip renders in the live hero card's header row, immediately after the competition name (and after the stage chip when one is present)."
    - "When the live game has is_replay=false, no REPLAY chip renders anywhere — the header row is byte-identical to today's output."
    - "The REPLAY chip is visually distinct from the yellow stage chip and does not reuse the live-red #FF4D5E that the pulsing LIVE dot owns."
    - "The chip appears only on the live hero card — upcoming and past fixture cards are untouched."
    - "apps/gutcallfun-ui type-checks with no errors after LiveHeroVM gains a required isReplay field, meaning every construction site was updated."
  artifacts:
    - apps/gutcallfun-ui/src/state/types.ts
    - apps/gutcallfun-ui/src/services/adapters/matches.tsx
    - apps/gutcallfun-ui/src/components/screens/MatchesScreen.tsx
  key_links:
    - "Game.is_replay (services/api/types.ts:61) -> liveHero() adapter -> LiveHeroVM.isReplay -> MatchesScreen conditional render"
---

<objective>
Render a small REPLAY chip on the Matches screen's live hero card when the backing
game's `is_replay` flag is true, so an operator or judge can tell at a glance that
the live loop is being driven by a recorded replay rather than the live TxLINE feed.

Purpose: replay provenance is currently invisible in the UI. During judging the app
runs off an infinite replay loop (quick task 260719-hr6), and there is no way to
distinguish that from a genuinely live match.

Output: one new required field on `LiveHeroVM`, one adapter line, one conditional
chip in `MatchesScreen`.
</objective>

<execution_context>
@/Users/maximkravchuk/Development/Projects/Solana/gutcall-project/gutcallfun/.claude/gsd-core/workflows/execute-plan.md
@/Users/maximkravchuk/Development/Projects/Solana/gutcall-project/gutcallfun/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/workstreams/backend/STATE.md

@apps/gutcallfun-ui/src/state/types.ts
@apps/gutcallfun-ui/src/services/adapters/matches.tsx
@apps/gutcallfun-ui/src/components/screens/MatchesScreen.tsx
</context>

<scouting_findings>
Verified against the working tree before planning. Trust these; do not re-derive.

**No backend work.** `is_replay` is already exposed and already typed end-to-end:
- `apps/gutcallfun-core/src/modules/api/games/dto/game-response.dto.ts:83` — `is_replay: boolean`
- `apps/gutcallfun-ui/src/services/api/types.ts:61` — `is_replay: boolean`

**Correction to the original scouting brief — there is NO mock `liveHero` fallback.**
The brief claimed `MatchController.tsx` builds a mock `liveHero` VM that would need an
explicit `isReplay: false`. That is wrong. `MatchController.tsx:647-648` reads:

    hasLiveGame: !!getRealData().liveHero,
    liveHero: getRealData().liveHero ?? null,

It is a pure pass-through. `laterMatches` and `pastMatches` (lines 649-650) DO have
mock `FIXTURES` fallbacks, but `liveHero` falls back to `null`, not to a mock object.

A repo-wide grep for `LiveHeroVM` confirms exactly **one** construction site
(`services/adapters/matches.tsx:77`); the other references are type annotations only
(`state/realData.ts:3,22`, `state/types.ts:298,397`, `matches.tsx:2,103`). There are no
test, spec, or story files in `apps/gutcallfun-ui/src`. So a required field on
`LiveHeroVM` obligates exactly one edit, and `tsc` is a complete check that it was made.

**Existing visual precedent to mirror** — the optional `stage` chip at
`MatchesScreen.tsx:43-46`, rendered in the same flex row right after `vm.liveHero.comp`,
preceded by a 3px dot separator.

**Palette collisions to avoid:**
- `#FFD84D` — the stage chip and TEAM1_COL (`matches.tsx:22`)
- `#FF4D5E` / `#FF6B78` — the pulsing LIVE dot and its label (`MatchesScreen.tsx:34-35`)
- `#7FB8E8` — TEAM2_COL (`matches.tsx:23`), so a blue chip would read as team-colored
</scouting_findings>

<design_decisions>
**Label text:** `REPLAY`.

**Colour choice:** the muted grey-blue neutral already used throughout the codebase for
secondary/meta text — `rgba(220,230,245,...)`. It is the colour of `whoInText`
(`MatchesScreen.tsx:73`), the dot separators, and muted table rows. Rationale: the chip
is a provenance/debug signal, not part of the match identity. Yellow would read as
competition metadata (it is literally the stage-chip colour), red would compete with the
LIVE dot, and blue is TEAM2_COL. Grey-blue is the codebase's established
"de-emphasised metadata" colour, so it reads correctly without introducing a new hue.

Exact chip style — identical geometry and typography to the stage chip, colour swapped:

| Property | Stage chip (existing) | REPLAY chip (new) |
|---|---|---|
| `fontFamily` | `'Barlow Condensed',sans-serif` | same |
| `fontStyle` | `italic` | same |
| `fontWeight` | `700` | same |
| `fontSize` | `12` | same |
| `letterSpacing` | `1px` | same |
| `borderRadius` | `6` | same |
| `padding` | `2px 9px` | same |
| `color` | `#FFD84D` | `rgba(220,230,245,.65)` |
| `background` | `rgba(255,216,77,.12)` | `rgba(220,230,245,.08)` |
| `border` | `1px solid rgba(255,216,77,.35)` | `1px solid rgba(220,230,245,.22)` |

**Placement:** in the same header flex row, after the stage chip, each preceded by its
own 3px dot separator (`width:3, height:3, borderRadius:"50%", background:"rgba(220,230,245,.3)"`)
so spacing stays correct whether or not `stage` is present.

**Conditional:** renders only when `isReplay` is true — same `&&` pattern as `stage`.

**Scope:** live hero card only. Upcoming and past fixture cards are explicitly out of scope.

**Required, not optional, field:** `isReplay: boolean` (not `isReplay?: boolean`) so
every future construction site is forced to decide. Cost is one adapter line, since
there is exactly one construction site today.
</design_decisions>

<tasks>

<task type="auto">
  <name>Task 1: Plumb is_replay through LiveHeroVM into the adapter</name>
  <files>apps/gutcallfun-ui/src/state/types.ts, apps/gutcallfun-ui/src/services/adapters/matches.tsx</files>
  <action>
In `state/types.ts`, add a required `isReplay: boolean` field to the `LiveHeroVM`
interface (declared at line 298). Place it directly after the existing `stage` field so
the two optional-chip inputs sit together. Add a brief line comment noting it mirrors the
backend `Game.is_replay` flag and drives the provenance chip on the live hero card.

In `services/adapters/matches.tsx`, in the `liveHero(g, onEnter, participants)` function
(line 77), set `isReplay: g.is_replay` in the returned object literal, positioned after
the existing `stage: null` line to match the interface ordering. `Game.is_replay` is
already typed `boolean` (non-optional) in `services/api/types.ts:61`, so no coalescing
or default is needed — do not add `?? false`, it would mask a genuine contract break if
the backend ever drops the field.

Do not touch `state/MatchController.tsx`. Its `liveHero` handling is a pass-through
(`getRealData().liveHero ?? null`) with a `null` fallback, not a mock-object fallback,
so it needs no change and will continue to type-check.
  </action>
  <verify>
    <automated>cd apps/gutcallfun-ui && grep -c 'isReplay: boolean' src/state/types.ts && grep -c 'isReplay: g.is_replay' src/services/adapters/matches.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>`LiveHeroVM` declares a required `isReplay: boolean`; the sole construction site in `matches.tsx` supplies `g.is_replay`; `tsc --noEmit` exits 0, proving no other construction site was missed.</done>
</task>

<task type="auto">
  <name>Task 2: Render the REPLAY chip in the live hero header row</name>
  <files>apps/gutcallfun-ui/src/components/screens/MatchesScreen.tsx</files>
  <action>
In the live hero card's header flex row (the `div` opened at line 40, containing the 🏆
glyph, `vm.liveHero.comp`, and the optional stage chip at lines 43-46), append a new
conditional block immediately after the closing `</>)}` of the stage-chip fragment and
before the row's closing `</div>`.

The block is guarded by `vm.liveHero.isReplay &&` and wraps a fragment containing two
elements, mirroring the stage-chip structure exactly:

1. A dot separator `div` — style `{ width: 3, height: 3, borderRadius: "50%", background: "rgba(220,230,245,.3)" }`. Copy the values from the existing separator at line 44.
2. The chip `div` whose text child is the string `REPLAY`, styled per the table in
   `<design_decisions>` above: same `fontFamily`, `fontStyle`, `fontWeight`, `fontSize`,
   `letterSpacing`, `borderRadius`, and `padding` as the stage chip at line 45, but with
   `color: "rgba(220,230,245,.65)"`, `background: "rgba(220,230,245,.08)"`, and
   `border: "1px solid rgba(220,230,245,.22)"`.

Because the stage chip carries its own leading separator, this block's own separator
keeps spacing correct in all four combinations of stage present/absent and replay
true/false — do not try to share one separator between them.

Follow the file's existing style: inline `style={{}}` objects, no CSS modules, no new
imports, no extracted component. Touch nothing outside this one header row — the score
block, team blocks, who's-in row, and the `laterMatches` / `pastMatches` sections stay
exactly as they are.
  </action>
  <verify>
    <automated>cd apps/gutcallfun-ui && grep -c 'vm.liveHero.isReplay' src/components/screens/MatchesScreen.tsx && grep -c 'REPLAY' src/components/screens/MatchesScreen.tsx && npx tsc --noEmit && npx eslint src/components/screens/MatchesScreen.tsx src/services/adapters/matches.tsx src/state/types.ts</automated>
  </verify>
  <done>The header row renders a grey-blue REPLAY chip guarded by `vm.liveHero.isReplay`, preceded by its own dot separator; `tsc --noEmit` and `eslint` both exit 0 on the three touched files.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
A REPLAY chip on the Matches screen's live hero card, rendered only when the backing
game's `is_replay` flag is true. Styled to match the existing yellow stage chip's shape
and typography but in the codebase's muted grey-blue metadata colour, so it reads as
provenance rather than as competition info.
  </what-built>
  <how-to-verify>
1. Start the stack and open the UI at http://localhost:4400 on the Matches tab, with the
   "Upcoming" sub-tab selected (the live hero only renders there).
2. With a **replay** game live (`game.is_replay = true` — the infinite replay loop from
   quick task 260719-hr6 produces this), confirm the live hero card's top row reads:
   🏆 COMPETITION · REPLAY — with REPLAY in a muted grey-blue pill.
3. Confirm the REPLAY pill is clearly distinguishable from the yellow stage pill and does
   not visually compete with the red pulsing LIVE NOW dot above the card.
4. Confirm spacing looks right in both cases: with a stage chip present (🏆 COMP · STAGE · REPLAY)
   and without one (🏆 COMP · REPLAY).
5. With a **non-replay** live game (`is_replay = false`), confirm NO REPLAY pill appears
   and the header row looks exactly as it did before this change.
6. Confirm the pill does not appear on any card in the "Past" sub-tab or on the upcoming
   fixture cards below the hero — live hero only.

If you prefer a different colour after seeing it in context, say so and it is a one-line
change to the three `rgba(220,230,245,...)` values.
  </how-to-verify>
  <resume-signal>Type "approved" or describe what looks wrong</resume-signal>
</task>

</tasks>

<verification>
Automated gates, run from the repo root:

1. UI type-check (the real gate — proves every `LiveHeroVM` construction site was updated):
   `cd apps/gutcallfun-ui && npx tsc --noEmit`
2. UI lint on the touched files:
   `cd apps/gutcallfun-ui && npx eslint src/components/screens/MatchesScreen.tsx src/services/adapters/matches.tsx src/state/types.ts`
3. Backend regression guard (backend is untouched; this only proves the change did not
   leak across the app boundary):
   `cd apps/gutcallfun-core && npx tsc --noEmit -p tsconfig.json`
   Note: do NOT run the backend's `npm run lint` script — it is `eslint ... --fix`, which
   mutates files, and would dirty untouched backend sources. If a backend lint pass is
   wanted, run `npx eslint "src/**/*.ts"` without `--fix` and accept only that no NEW
   errors appear relative to the pre-change baseline.

Mock-fallback check: satisfied by gate 1. Per `<scouting_findings>`, `liveHero` has no
mock-object fallback path — `MatchController.tsx` falls back to `null` — so `tsc` passing
is a complete proof that no construction site was missed.

The human checkpoint is the real acceptance gate for anything visual.
</verification>

<success_criteria>
- `LiveHeroVM` has a required `isReplay: boolean`.
- `liveHero()` in `matches.tsx` sets it from `g.is_replay` with no defaulting.
- `MatchesScreen` renders a `REPLAY` chip guarded by `vm.liveHero.isReplay`, in the live
  hero header row, in `rgba(220,230,245,...)` — not yellow, not `#FF4D5E`, not `#7FB8E8`.
- Nothing renders when `is_replay` is false.
- No change to past/upcoming fixture cards, to `MatchController.tsx`, to any backend file,
  or to `dev-stack.yml` (excluded — carries an uncommitted user change).
- `tsc --noEmit` and `eslint` pass on `apps/gutcallfun-ui`.
- User approves the visual check.
</success_criteria>

<output>
Create `.planning/quick/260719-iar-render-a-replay-label-on-the-live-game-c/260719-iar-SUMMARY.md` when done
</output>
