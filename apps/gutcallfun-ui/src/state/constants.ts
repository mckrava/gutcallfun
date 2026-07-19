// Static game data, ported verbatim from the prototype (GutCallApp instance
// constants). These never change at runtime.

export type TeamKey = "br" | "ar";
export type OutcomeKey = "fizzle" | "chance" | "big" | "goal";

export interface Fixture {
  comp: string;
  hc: string;
  hn: string;
  ac: string;
  an: string;
  when?: string;
  score?: string;
  myPts?: string;
  accent: string;
}

export interface Team {
  code: string;
  name: string;
  nice: string;
  c: string;
  c2: string;
  dark: string;
}

export interface SquadMember {
  name: string;
  emoji: string;
  ring: string;
  pts: string;
  you?: boolean;
}

export interface Squad {
  name: string;
  emoji: string;
  ring: string;
  code: string;
  myRank: string;
  members: SquadMember[];
}

export interface Beat {
  d: number;
  t: number;
  stage: number;
  comm: string;
  goal?: TeamKey;
  scorer?: string;
  shake?: boolean;
}

export interface MatchWindow {
  minN: number;
  my: number;
  team: TeamKey;
  outcome: OutcomeKey;
  beats: Beat[];
  squadResults?: [number, OutcomeKey][];
}

export interface Moment {
  clock?: string;
  stage?: number;
  t?: number;
  team?: TeamKey | null;
  phase?: string;
  comm?: string;
  squad?: [number, string][];
  end?: boolean;
  window?: MatchWindow;
  autoBeats?: Beat[];
}

export interface GlobalRow {
  rank: string;
  name: string;
  sub: string;
  pts: number;
  mov: string;
  ring: string;
  ini: string;
}

export const FIXTURES: { later: Fixture[]; past: Fixture[] } = {
  later: [
    { comp: "WORLD CUP 26 · SEMI-FINAL", hc: "FRA", hn: "France", ac: "ENG", an: "England", when: "Tomorrow · 21:00", accent: "#8FA9FF" },
    { comp: "WORLD CUP 26 · 3RD PLACE", hc: "NED", hn: "Netherlands", ac: "GER", an: "Germany", when: "Sat · 18:00", accent: "#FF8A3D" },
    { comp: "WORLD CUP 26 · FINAL", hc: "SF1", hn: "Semi 1", ac: "SF2", an: "Semi 2", when: "Sun · 20:00", accent: "#FFD84D" },
  ],
  past: [
    { comp: "WC26 · QUARTER-FINAL", hc: "BRA", hn: "Brazil", ac: "CRO", an: "Croatia", score: "2 – 1", myPts: "+40", accent: "#FFD84D" },
    { comp: "WC26 · QUARTER-FINAL", hc: "ARG", hn: "Argentina", ac: "COL", an: "Colombia", score: "2 – 1", myPts: "+25", accent: "#7FB8E8" },
    { comp: "WC26 · ROUND OF 16", hc: "FRA", hn: "France", ac: "MAR", an: "Morocco", score: "1 – 0", myPts: "+15", accent: "#8FA9FF" },
  ],
};

export const TEAMS: Record<TeamKey, Team> = {
  br: { code: "BRA", name: "BRAZIL", nice: "Brazil", c: "#FFD84D", c2: "#FFB300", dark: "#221A00" },
  ar: { code: "ARG", name: "ARGENTINA", nice: "Argentina", c: "#7FB8E8", c2: "#4E93D9", dark: "#081826" },
};

export const STAGES = [
  { label: "SAFE", c: "#3DDC84" },
  { label: "ATTACK", c: "#FFD84D" },
  { label: "DANGER", c: "#FF8A3D" },
  { label: "BIG CHANCE", c: "#FF4D5E" },
];

export const PTS: Record<OutcomeKey, number> = { fizzle: 5, chance: 15, big: 35, goal: 80 };
export const LBL: Record<OutcomeKey, string> = { fizzle: "fizzled out", chance: "a shot", big: "a big chance", goal: "a GOAL" };
export const LBLR: Record<OutcomeKey, string> = { fizzle: "FIZZLED OUT", chance: "A SHOT", big: "A BIG CHANCE", goal: "GOAL!" };
export const HOT: Record<OutcomeKey, string> = { fizzle: "#9FB3C8", chance: "#FFD84D", big: "#FF8A3D", goal: "#FF4D5E" };

export const OPTS: { k: OutcomeKey; label: string }[] = [
  { k: "fizzle", label: "Fizzles out" },
  { k: "chance", label: "Ends in a shot" },
  { k: "big", label: "A big chance" },
  { k: "goal", label: "GOAL" },
];

export const MOMENTS: Moment[] = [
  { clock: "1'", stage: 0, t: 0.02, team: null, phase: "LIVE", comm: "Kickoff at the Azteca — Brazil get us underway.", squad: [[1, "👋"]] },
  { clock: "6'", stage: 1, t: 0.32, team: "br", comm: "Vinícius turns his man — Brazil push up the left." },
  { clock: "9'", stage: 2, t: 0.55, team: "br", comm: "Brazil camped on the edge of the box. The noise is rising.", squad: [[2, "👀"]] },
  { clock: "12'", window: { minN: 12, my: 0.95, team: "br", outcome: "goal",
    beats: [
      { d: 900, t: 0.72, stage: 2, comm: "Cutback to Rodrygo on the penalty spot…" },
      { d: 1250, t: 0.9, stage: 3, comm: "He's through — one on one with Martínez!" },
      { d: 1050, t: 1, stage: 3, comm: "GOOOAL! Rodrygo buries it low. 1–0 Brazil!", goal: "br", scorer: "RODRYGO" },
    ],
    squadResults: [[0, "goal"], [1, "chance"], [3, "fizzle"]] } },
  { clock: "18'", stage: 0, t: 0.12, team: null, comm: "The Seleção milk it. Argentina restart, jaws set.", squad: [[2, "😤"]] },
  { clock: "27'", stage: 1, t: -0.35, team: "ar", comm: "Argentina answer — De Paul threads it into the half-space." },
  { clock: "34'", window: { minN: 34, my: -0.15, team: "ar", outcome: "fizzle",
    beats: [
      { d: 1000, t: -0.5, stage: 1, comm: "Messi slows it down, waiting for the run…" },
      { d: 1250, t: -0.12, stage: 0, comm: "…and the flag is up. Offside. It fizzles out." },
    ],
    squadResults: [[1, "fizzle"], [2, "goal"]] } },
  { clock: "45+1'", stage: 0, t: 0, team: null, phase: "HT", comm: "Half-time: Brazil 1–0 Argentina. Breathe.", squad: [[3, "😮‍💨"]] },
  { clock: "52'", stage: 2, t: -0.62, team: "ar", phase: "LIVE", comm: "Álvarez spins and shoots — Alisson parries it away!", squad: [[3, "😱"]] },
  { clock: "58'", autoBeats: [
      { d: 800, t: -0.75, stage: 2, comm: "Argentina spring the counter — three on two!" },
      { d: 1150, t: -1, stage: 3, comm: "Álvarez slots it. 1–1 — too quick to call!", goal: "ar", scorer: "ÁLVAREZ" },
    ], squad: [[1, "💙"], [0, "😱"]] },
  { clock: "64'", stage: 0, t: -0.1, team: null, comm: "All square. The Azteca catches its breath." },
  { clock: "71'", stage: 1, t: 0.34, team: "br", comm: "Brazil turn the screw — wave after yellow wave." },
  { clock: "84'", stage: 2, t: 0.6, team: "br", comm: "Corner after corner. Argentina hanging on.", squad: [[2, "🫣"]] },
  { clock: "90+2'", window: { minN: 92, my: 0.55, team: "br", outcome: "big",
    beats: [
      { d: 1000, t: 0.88, stage: 3, comm: "Cross comes in — header from six yards…" },
      { d: 1150, t: 0.55, stage: 2, comm: "OFF THE BAR! It stays 1–1!", shake: true },
    ],
    squadResults: [[3, "big"], [0, "big"]] } },
  { clock: "90+5'", stage: 0, t: 0, team: null, phase: "FT", end: true, comm: "Full-time: 1–1. What a ride. Your Match EKG is ready.", squad: [[0, "🤝"]] },
];

export const EKG: [number, number][] = [
  [0, 0], [6, 0.32], [9, 0.55], [12, 0.9], [12.6, 1], [18, 0.12], [27, -0.35], [33, -0.5], [35, -0.12], [45, 0], [52, -0.62], [57, -0.75], [58, -1], [64, -0.1], [71, 0.34], [84, 0.6], [91, 0.88], [92, 0.55], [95, 0],
];

export const GLOBALS: GlobalRow[] = [
  { rank: "1", name: "Thiago · São Paulo", sub: "BRA", pts: 220, mov: "—", ring: "#FFD84D", ini: "TH" },
  { rank: "2", name: "LaPulga10", sub: "ARG", pts: 205, mov: "▲1", ring: "#7FB8E8", ini: "LP" },
  { rank: "3", name: "YellowWall", sub: "BRA", pts: 190, mov: "▼1", ring: "#FFD84D", ini: "YW" },
  { rank: "4", name: "Camila R.", sub: "MEX", pts: 184, mov: "▲2", ring: "#3DDC84", ini: "CR" },
];

export const SQUADS: Squad[] = [
  { name: "The Degens", emoji: "🔥", ring: "#FF8A3D", code: "DEGEN", myRank: "#3",
    members: [
      { name: "@thiago", emoji: "🐯", ring: "#FFD84D", pts: "820" },
      { name: "@sofia_g", emoji: "🚀", ring: "#3DDC84", pts: "710" },
      { name: "@gutcaller", emoji: "🦊", ring: "#FFD84D", pts: "640", you: true },
      { name: "@kunle", emoji: "🐢", ring: "#FF8A5C", pts: "512" },
      { name: "@dani", emoji: "🐵", ring: "#C08BFF", pts: "430" },
      { name: "@bea", emoji: "🐼", ring: "#8FA9FF", pts: "388" },
    ] },
  { name: "Azteca Boys", emoji: "⚡", ring: "#7FB8E8", code: "AZTEC", myRank: "#1",
    members: [
      { name: "@gutcaller", emoji: "🦊", ring: "#FFD84D", pts: "640", you: true },
      { name: "@marco", emoji: "🐙", ring: "#7FB8E8", pts: "600" },
      { name: "@lena", emoji: "🐸", ring: "#3DDC84", pts: "540" },
      { name: "@pavlo", emoji: "🐧", ring: "#C08BFF", pts: "410" },
    ] },
  { name: "Sunday League", emoji: "🍺", ring: "#3DDC84", code: "SNDAY", myRank: "#5",
    members: [
      { name: "@omar", emoji: "🦁", ring: "#FFD84D", pts: "910" },
      { name: "@yuki", emoji: "🐺", ring: "#8FA9FF", pts: "780" },
      { name: "@carla", emoji: "🐝", ring: "#3DDC84", pts: "660" },
      { name: "@nate", emoji: "🐳", ring: "#7FB8E8", pts: "655" },
      { name: "@gutcaller", emoji: "🦊", ring: "#FFD84D", pts: "640", you: true },
      { name: "@ravi", emoji: "🦉", ring: "#FF8A5C", pts: "590" },
      { name: "@zoe", emoji: "🐰", ring: "#C08BFF", pts: "540" },
      { name: "@finn", emoji: "🐨", ring: "#FF5E8A", pts: "505" },
      { name: "@ada", emoji: "🐞", ring: "#3DDC84", pts: "470" },
    ] },
];

export const RINGS = ["#FF8A3D", "#7FB8E8", "#3DDC84", "#C08BFF", "#FF5E8A", "#FFD84D"];
