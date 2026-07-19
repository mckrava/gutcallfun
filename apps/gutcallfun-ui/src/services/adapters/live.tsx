import type { Game, Question } from "@/services/api/types";
import type { LiveGameState } from "@/services/realtime/LiveProvider";
import type { LiveGoalVM, LiveMatchVM, LiveWindowVM, StagePill } from "@/state/types";
import { CountryFlag } from "@/components/common/CountryFlag";

// Per-team style triples (accent / gradient-2 / dark-ink) — the mock's TEAMS.
const TEAM_STYLE = {
  1: { c: "#FFD84D", c2: "#FFB300", dark: "#221A00" },
  2: { c: "#7FB8E8", c2: "#4E93D9", dark: "#081826" },
} as const;

// Outcome-key → display label / "hotness" colour (mock OPTS + HOT, keyed to the
// real four outcome keys).
const OUTCOME_LABEL: Record<string, string> = {
  fizzles: "Fizzles out",
  danger: "Creates danger",
  shot: "Shot taken",
  goal: "GOAL",
};
const OUTCOME_HOT: Record<string, string> = {
  fizzles: "#9FB3C8",
  danger: "#FFD84D",
  shot: "#FF8A3D",
  goal: "#FF4D5E",
};
const RING_C = 131.9; // betting-window ring circumference (matches BettingWindow)

// Fixed team accent colours — the design pairs team1 gold / team2 blue (the
// backend's jersey colours are null), matching the mock exactly.
const T1_COL = "#FFD84D";
const T2_COL = "#7FB8E8";

// Stage ladder (labels + colours) — same as state/constants STAGES.
const STAGES = [
  { label: "SAFE", c: "#3DDC84" },
  { label: "ATTACK", c: "#FFD84D" },
  { label: "DANGER", c: "#FF8A3D" },
  { label: "BIG CHANCE", c: "#FF4D5E" },
];

const POSSESSION_STAGE: Record<string, number> = {
  SafePossession: 0,
  AttackPossession: 1,
  DangerPossession: 2,
  HighDangerPossession: 3,
};

// Per-stage tension magnitude — drives the meter fill exactly like the mock's
// continuous `tension`, but quantised to the four possession stages.
const STAGE_MAG = [0, 0.34, 0.68, 1];
const ATT_WORD = ["", "BUILDING", "THREATENING", "BIG CHANCE"];

function hexA(h: string, a: number): string {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Build the meter/score/team view-model from a game's REST detail + its live WS
// state. Before the first snapshot arrives, score falls back to the REST score
// and possession reads as "all quiet" (stage 0). The attacking side comes from
// the open question or the most recent possession event (the snapshot itself
// carries no participant).
export function deriveLiveMatch(game: Game, live: LiveGameState | undefined): LiveMatchVM {
  const snap = live?.snapshot ?? null;
  const t1Name = (game.team1_name ?? "TEAM 1").toUpperCase();
  const t2Name = (game.team2_name ?? "TEAM 2").toUpperCase();

  const scoreBr = String(snap?.score_p1 ?? game.score_p1);
  const scoreAr = String(snap?.score_p2 ?? game.score_p2);

  const stage = snap?.possession_stage ? (POSSESSION_STAGE[snap.possession_stage] ?? 0) : 0;
  const participant = live?.activeQuestion?.participant ?? live?.lastGameEvent?.participant ?? 1;
  const isBr = participant === 1;

  const mag = STAGE_MAG[stage];
  const fillW = Math.max(2.5, mag * 48);
  const glowA = 0.25 + stage * 0.16;

  const stagePills: StagePill[] = STAGES.map((sg, i) => {
    const on = i <= stage;
    const hot = on && i === stage && stage > 0;
    return {
      label: sg.label,
      bg: on ? hexA(sg.c, 0.16) : "rgba(255,255,255,.03)",
      col: on ? sg.c : "rgba(255,255,255,.25)",
      bd: on ? hexA(sg.c, 0.5) : "rgba(255,255,255,.07)",
      glow: hot ? `0 0 14px ${hexA(sg.c, 0.35)}` : "none",
      anim: i === 3 && stage === 3 ? "kfDot .55s ease-in-out infinite" : "none",
    };
  });

  return {
    headerComp: (game.competition ?? "").toUpperCase(),
    headerStage: null,
    t1Name,
    t2Name,
    t1Flag: <CountryFlag name={game.team1_name} size={48} />,
    t2Flag: <CountryFlag name={game.team2_name} size={48} />,
    scoreBr,
    scoreAr,
    attText: stage === 0 ? "ALL QUIET" : `${(isBr ? t1Name : t2Name)} ${ATT_WORD[stage]}`,
    attCol: stage === 0 ? "rgba(255,255,255,.35)" : isBr ? T1_COL : T2_COL,
    fillLeft: `${isBr ? 50 : 50 - fillW}%`,
    fillWidth: `${fillW}%`,
    fillBg: isBr
      ? "linear-gradient(90deg, rgba(255,216,77,.12), #FFD84D)"
      : "linear-gradient(270deg, rgba(127,184,232,.12), #7FB8E8)",
    fillGlow: `0 0 ${10 + stage * 8}px ${isBr ? hexA(T1_COL, glowA) : hexA(T2_COL, glowA)}`,
    fillRad: isBr ? "0 8px 8px 0" : "8px 0 0 8px",
    pulseBg: isBr ? T1_COL : T2_COL,
    pulseDur: `${[2.6, 1.5, 0.95, 0.55][stage]}s`,
    stagePills,
  };
}

// A WS `question` → the betting-window view-model. `pickedOptionId` reflects the
// caller's locked answer (from POST /answers); `nowMs` drives the countdown ring
// (re-derive each tick). onPick submits the answer.
export function deriveLiveWindow(
  q: Question,
  o: { pickedOptionId: string | null; nowMs: number; onPick: (optionId: string) => void },
): LiveWindowVM {
  const team = q.participant === 2 ? TEAM_STYLE[2] : TEAM_STYLE[1];
  const ttlMs = Math.max(1, q.answer_window_ttl || 15) * 1000;
  const remainMs = Math.max(0, new Date(q.expires_at).getTime() - o.nowMs);
  const remainSec = remainMs / 1000;
  const locked = !!o.pickedOptionId;
  const opts = [...q.options].sort((a, b) => a.display_order - b.display_order);
  return {
    winOpen: true,
    winTeamColor: team.c,
    winGlow: hexA(team.c, 0.22),
    winHead: q.content,
    ringOffset: String(RING_C * (1 - remainMs / ttlMs)),
    ringColor: remainSec <= 1.7 ? "#FF4D5E" : team.c,
    ringNum: String(Math.ceil(remainSec)),
    winNote: locked ? "Locked — eyes on the TV" : "Tap to lock your call · points scale with difficulty",
    winOpts: opts.map((op) => {
      const sel = o.pickedOptionId === op.id;
      return {
        label: OUTCOME_LABEL[op.outcome_key] ?? op.outcome_key,
        pts: "+" + op.base_gain,
        on: () => o.onPick(op.id),
        bg: sel ? `linear-gradient(135deg,${team.c},${team.c2})` : "rgba(255,255,255,.045)",
        col: sel ? team.dark : "#F2F6FC",
        bd: sel ? team.c : "rgba(255,255,255,.13)",
        op: locked && !sel ? "0.32" : "1",
        ptsCol: sel ? team.dark : (OUTCOME_HOT[op.outcome_key] ?? "#FFD84D"),
      };
    }),
  };
}

// A WS goal `game_event` → the flash + slam celebration view-model.
export function deriveLiveGoal(game: Game, participant: 1 | 2, score1: number, score2: number): LiveGoalVM {
  const isBr = participant === 1;
  const c = isBr ? "#FFD84D" : "#7FB8E8";
  const name = (isBr ? game.team1_name : game.team2_name) ?? "";
  const code = (s: string | null) => (s ?? "").slice(0, 3).toUpperCase();
  return {
    flashOn: true,
    flashBg: isBr
      ? "radial-gradient(ellipse at 50% 40%, rgba(255,216,77,.9), rgba(255,216,77,0) 72%)"
      : "radial-gradient(ellipse at 50% 40%, rgba(127,184,232,.9), rgba(127,184,232,0) 72%)",
    slamOn: true,
    slamWord: "GOAL!",
    slamSub: name.toUpperCase(),
    slamColor: c,
    slamGlow: hexA(c, 0.55),
    goalBg: isBr
      ? "radial-gradient(ellipse at 50% 40%, rgba(255,216,77,.32), rgba(6,9,15,.97) 66%)"
      : "radial-gradient(ellipse at 50% 40%, rgba(127,184,232,.32), rgba(6,9,15,.97) 66%)",
    goalFlagEl: <CountryFlag name={isBr ? game.team1_name : game.team2_name} size={84} />,
    goalTeamName: name.toUpperCase() + " SCORE",
    goalScore: `${code(game.team1_name)} ${score1} – ${score2} ${code(game.team2_name)}`,
  };
}
