import type { ReactNode } from "react";
import type { Beat, Fixture, GlobalRow, OutcomeKey, Squad, TeamKey } from "./constants";

// ---- Runtime state (ported verbatim from GutCallApp.fresh()) ----

export type Screen = "home" | "pre" | "live" | "post";
export type NavTab = "matches" | "ranks" | "squad" | "profile" | "rewards";
export type AuthStep = "connect" | "username" | "done";

export interface CommLine {
  t: string;
  dim: boolean;
}

export interface LocalSquadMember {
  n: string;
  ini: string;
  emoji: string;
  c: string;
  pts: number;
  r: string | null;
  mov: string;
}

export interface ActiveWindow {
  minN: number;
  my: number;
  team: TeamKey;
  outcome: OutcomeKey;
  beats: Beat[];
  squadResults?: [number, OutcomeKey][];
  left: number;
  total: number;
  pick: OutcomeKey | null;
}

export interface SlamState {
  word: string;
  sub: string;
  team: TeamKey;
}

export interface HistEntry {
  min: number;
  clock: string;
  pick: OutcomeKey | null;
  outcome: OutcomeKey;
  earned: number;
  my: number;
}

export interface AppState {
  screen: Screen;
  mi: number;
  auto: boolean;
  clock: string;
  phase: string;
  score: { br: number; ar: number };
  tension: number;
  jitter: number;
  dispT: number;
  stage: number;
  attTeam: TeamKey | null;
  comm: CommLine[];
  win: ActiveWindow | null;
  beatsOn: boolean;
  pts: number;
  dispPts: number;
  squad: LocalSquadMember[];
  flash: TeamKey | "wh" | null;
  slam: SlamState | null;
  shake: boolean;
  homeTab: "upcoming" | "past";
  navTab: NavTab;
  squadView: "list" | "detail";
  openSquadIdx: number;
  matchSquadIdx: number | null;
  myReact: string | null;
  squads: Squad[];
  modal: "create" | "join" | "add" | "picksquad" | null;
  form: { name: string; emoji: string; code: string; user: string };
  ended: boolean;
  pre: { winner: "br" | "draw" | "ar" | null; goals: "0-1" | "2-3" | "4+" | null };
  hist: HistEntry[];
  toast: string | null;
  settled: boolean;
  authStep: AuthStep;
  onbUser: string;
  winDrag?: number;
}

// ---- View-model row/item shapes (consumed by components) ----

export interface StagePill {
  label: string;
  bg: string;
  col: string;
  bd: string;
  glow: string;
  anim: string;
}

export interface WinOpt {
  label: string;
  pts: string;
  on: () => void;
  bg: string;
  col: string;
  bd: string;
  op: string;
  ptsCol: string;
}

export interface SquadCard {
  name: string;
  emoji: string;
  ring: string;
  myRank: string;
  count: string;
  onClick: () => void;
}

export interface EmojiOpt {
  em: string;
  pick: () => void;
  bd: string;
  bg: string;
}

export interface Medaled {
  rank: string;
  name: string;
  emoji: string;
  ring: string;
  pts: string;
  medalBg: string;
  medalBd: string;
  numCol: string;
  nameCol: string;
}

export interface RestRow {
  rank: string;
  name: string;
  emoji: string;
  ring: string;
  pts: string;
  rowBg: string;
  rowBd: string;
  rankCol: string;
  nameCol: string;
  ptsCol: string;
}

export interface OpenSquadVM {
  name: string;
  emoji: string;
  ring: string;
  code: string;
  count: string;
  top3: Medaled[];
  rest: RestRow[];
}

export interface RankRow {
  rank: string;
  name: string;
  pts: string;
  emoji: string;
  ring: string;
  medalBg?: string;
  medalBd?: string;
  numCol?: string;
  rowBg?: string;
  rowBd?: string;
  rankCol?: string;
  nameCol?: string;
  ptsCol?: string;
}

export interface RecentMatch {
  comp: string;
  score: string;
  pts: string;
  hEl: ReactNode;
  aEl: ReactNode;
}

export interface SquadPickItem {
  name: string;
  emoji: string;
  ring: string;
  count: string;
  pick: () => void;
  selBd: string;
  selBg: string;
}

export interface ReactOpt {
  em: string;
  send: () => void;
}

export interface MatchSquadRow {
  rank: string;
  name: string;
  emoji: string;
  pts: string;
  r: string;
  hasR: boolean;
  isYou: boolean;
  ringCss: string;
  nameCol: string;
  rowBg: string;
  rowBd: string;
  rankCol: string;
  ptsCol: string;
}

export interface FixtureCard extends Fixture {
  onClick: () => void;
  hFlagEl: ReactNode;
  aFlagEl: ReactNode;
}

// The live "Match Details" screen, driven by a real game's REST detail + the
// WebSocket snapshot stream. When present it overrides the mock-simulation
// fields the LiveScreen reads; absent = the demo simulation (backward compat).
export interface LiveMatchVM {
  headerComp: string;
  headerStage: string | null;
  t1Name: string;
  t2Name: string;
  t1Flag: ReactNode;
  t2Flag: ReactNode;
  scoreBr: string;
  scoreAr: string;
  attText: string;
  attCol: string;
  fillLeft: string;
  fillWidth: string;
  fillBg: string;
  fillGlow: string;
  fillRad: string;
  pulseBg: string;
  pulseDur: string;
  stagePills: StagePill[];
}

// The in-match "your squad" duel panel, driven by the squad the user picked
// for this match + its real members.
export interface MatchSquadPanelVM {
  name: string;
  emoji: string;
  standing: string;
  rows: MatchSquadRow[];
}

// Real prediction window driven by a WS `question` event. Same shape the
// renderVals `winVals` object carries, so it drops in wholesale.
export interface LiveWindowVM {
  winOpen: boolean;
  winTeamColor: string;
  winGlow: string;
  winHead: string;
  ringOffset: string;
  ringColor: string;
  ringNum: string;
  winNote: string;
  winOpts: WinOpt[];
}

// Real goal celebration driven by a WS `game_event` (type=goal). Overrides the
// mock flash/slam fields for a couple of seconds.
export interface LiveGoalVM {
  flashOn: boolean;
  flashBg: string;
  slamOn: boolean;
  slamWord: string;
  slamSub: string;
  slamColor: string;
  slamGlow: string;
  goalBg: string;
  goalFlagEl: ReactNode;
  goalTeamName: string;
  goalScore: string;
}

// Compact "you called it" win — shown when the caller's OWN answer resolves
// correct (their pick == resolved_option_id). A gambling-style payout pop, not a
// full-screen takeover: it floats over the live screen and auto-dismisses. See
// components/overlays/WinToast and deriveWinToast.
export interface LiveWinToastVM {
  points: number;
  headline: string; // punchy copy scaled to the reward ("NICE CALL!" → "JACKPOT!")
  outcomeLabel: string; // the outcome they correctly called ("GOAL", "SHOT"…)
  emoji: string; // celebratory glyph, also scaled to the reward
}

// The "LIVE NOW" hero on the Matches screen, driven by a real live game.
export interface LiveHeroVM {
  gameId: number;
  comp: string;
  stage: string | null;
  team1Name: string;
  team2Name: string;
  team1Col: string;
  team2Col: string;
  team1Flag: ReactNode;
  team2Flag: ReactNode;
  score: string;
  onEnter: () => void;
  // "Who's in" — real users who joined this game.
  whoInAvatars: { emoji: string; ring: string }[];
  whoInText: string;
}

export interface PostRow {
  l: string;
  r: string;
  col: string;
}

export interface SquadListItem {
  n: string;
  ini: string;
  c: string;
  mov: string;
  pts: string;
  tot: string;
}

export interface SquadRowItem {
  n: string;
  ini: string;
  c: string;
  pts: string;
  r: string;
  hasR: boolean;
}

export interface ChipOpt {
  label: string;
  on: () => void;
  bg: string;
  col: string;
  bd: string;
}

type Handler = () => void;
type ChangeHandler = (e: React.ChangeEvent<HTMLInputElement>) => void;
type PointerHandler = (e: React.PointerEvent) => void;

// The full view-model — the return of the controller's renderVals(). A wide,
// flat object the presentation components read from.
export interface ViewModel {
  // demo/embed (unused by product screens but kept for parity)
  showControls: boolean;
  wrapMinH: string;
  wrapPad: string;
  wrapBg: string;

  // screen flags
  isHome: boolean;
  isPre: boolean;
  isLive: boolean;
  isPost: boolean;
  isAuth: boolean;
  isUsername: boolean;

  // bottom-nav
  navTab: NavTab;
  isMatches: boolean;
  isRanks: boolean;
  isSquadTab: boolean;
  isProfile: boolean;
  isRewards: boolean;
  navMatches: Handler;
  navRanks: Handler;
  navSquadTab: Handler;
  navProfile: Handler;
  navRewards: Handler;
  cMatches: string; oMatches: string;
  cRanks: string; oRanks: string;
  cSquad: string; oSquad: string;
  cRewards: string; oRewards: string;
  cProfile: string; oProfile: string;

  // matches tab
  appAnim: string;
  isUpcoming: boolean;
  isPast: boolean;
  tabUpcoming: Handler;
  tabPast: Handler;
  upCol: string; upBar: string; pastCol: string; pastBar: string;
  liveClick: Handler;
  liveComp: string; liveClock: string; liveScore: string;
  brFlag: ReactNode; arFlag: ReactNode;
  hasLiveGame: boolean;
  liveHero: LiveHeroVM | null;
  // Live "Match Details" header + team names (real game overrides the mock).
  liveHdrComp: string;
  liveHdrStage: string | null;
  liveT1: string;
  liveT2: string;
  laterMatches: FixtureCard[];
  pastMatches: FixtureCard[];

  // rankings
  rankTop3: RankRow[];
  rankAround: RankRow[];
  globalList: GlobalRow[];

  // squads
  squadList: SquadListItem[];
  isSquadList: boolean;
  isSquadDetail: boolean;
  currentSquadId: number;
  backSquadList: Handler;
  squadCards: SquadCard[];
  openCreate: Handler;
  openJoin: Handler;
  openAdd: Handler;
  openSquad: OpenSquadVM;

  // modals
  closeModal: Handler;
  doCreate: Handler;
  doJoin: Handler;
  doAddMember: Handler;
  modalOpen: boolean;
  modalCreate: boolean;
  modalJoin: boolean;
  modalAdd: boolean;
  modalPick: boolean;
  formName: string; formCode: string; formUser: string;
  setName: ChangeHandler; setCode: ChangeHandler; setUser: ChangeHandler;
  emojiOpts: EmojiOpt[];
  squadPickList: SquadPickItem[];

  // profile
  logout: Handler;
  demoToast: Handler;
  comingSoon: Handler;
  recentMatches: RecentMatch[];

  // live companion
  goHome: Handler;
  goPre: Handler;
  enterLive: Handler;
  clock: string;
  phaseLabel: string;
  phaseCol: string;
  phaseBg: string;
  phaseDotAnim: string;
  scoreBr: string;
  scoreAr: string;
  attText: string;
  attCol: string;
  fillLeft: string;
  fillWidth: string;
  fillBg: string;
  fillGlow: string;
  fillRad: string;
  pulseBg: string;
  pulseDur: string;
  stagePills: StagePill[];
  commMain: string;
  commPrev: string;
  squadRow: SquadRowItem[];
  matchSquadName: string;
  matchSquadEmoji: string;
  hasMatchSquad: boolean;
  noMatchSquad: boolean;
  openSquadPicker: Handler;
  matchStanding: string;
  matchSquadRow: MatchSquadRow[];
  reactOpts: ReactOpt[];
  dispPts: string;
  rankChip: string;

  // betting window overlay
  winOpen: boolean;
  winTeamColor: string;
  winGlow: string;
  winHead: string;
  ringOffset: string;
  ringColor: string;
  ringNum: string;
  winOpts: WinOpt[];
  winNote: string;
  dismissWin: Handler;
  winDown: PointerHandler;
  winMove: PointerHandler;
  winUp: PointerHandler;
  winDragT: string;

  // flash + slam overlays
  flashOn: boolean;
  flashBg: string;
  slamOn: boolean;
  slamWord: string;
  slamSub: string;
  slamColor: string;
  slamGlow: string;
  goalBg: string;
  goalFlagEl: ReactNode;
  goalTeamName: string;
  goalScore: string;
  dismissGoal: Handler;

  // correct-answer win celebration (compact, auto-dismissing)
  winToastOn: boolean;
  winToastPoints: string;
  winToastHeadline: string;
  winToastOutcome: string;
  winToastEmoji: string;
  dismissWinToast: Handler;

  // auth / onboarding
  connectWallet: Handler;
  saveUsername: Handler;
  showOnboarding: Handler;
  onbUser: string;
  setOnb: ChangeHandler;

  // toast
  toastOn: boolean;
  toastText: string;

  // post-match EKG
  winnerOpts: ChipOpt[];
  goalsOpts: ChipOpt[];
  ftScore: string;
  totalPts: string;
  rankLine: string;
  globalPct: string;
  globalRank: string;
  postSquadName: string;
  bestCall: string;
  postRows: PostRow[];
  ekgSvg: ReactNode;
  share: Handler;

  // demo controls (unused by product template)
  next: Handler;
  restart: Handler;
  toggleAuto: Handler;
  demoWindow: Handler;
  demoGoal: Handler;
  nextLabel: string;
  nextPe: string;
  nextOp: string;
  autoLabel: string;
  autoBg: string;
  autoBd: string;
  autoCol: string;
  scenes: ChipOpt[];
}
