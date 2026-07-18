"use client";

import React from "react";
import { Flag } from "@/components/common/Flag";
import { MatchEkg } from "@/components/common/MatchEkg";
import {
  FIXTURES,
  GLOBALS,
  HOT,
  LBL,
  LBLR,
  MOMENTS,
  OPTS,
  PTS,
  RINGS,
  SQUADS,
  STAGES,
  TEAMS,
  type OutcomeKey,
  type TeamKey,
} from "./constants";
import { AppActionsContext, AppContext, type AppActions } from "./context";
import type { AppState, ViewModel } from "./types";

interface ControllerProps {
  children: React.ReactNode;
  navigate: (path: string) => void;
  pathname: string;
  startScreen?: string;
  windowSeconds?: number;
  embed?: boolean;
  motion?: string;
}

// Ported verbatim from the prototype logic class. All simulation/state logic is
// unchanged; only the presentation is replaced — render() now feeds renderVals()
// through React context instead of the DOM template runtime, and state changes
// are mirrored to the URL (componentDidUpdate → navigate).
export default class MatchController extends React.Component<ControllerProps, AppState> {
  _timers: ReturnType<typeof setTimeout>[] = [];
  _ct?: ReturnType<typeof setInterval>;
  _lerp?: ReturnType<typeof setInterval>;
  _autoI?: ReturnType<typeof setInterval>;
  _raf = 0;
  _reactT?: ReturnType<typeof setTimeout>;
  _key?: (e: KeyboardEvent) => void;
  _ptsTotal = 0;
  _dispNow = 0;
  _dispT = 0;
  _jitV = 0;
  _jitAt = 0;
  _winT0 = 0;
  _dragY0 = 0;
  _dragging = false;

  state: AppState = this.fresh();

  fresh(): AppState {
    return {
      screen: "home", mi: -1, auto: false, clock: "—", phase: "PRE",
      score: { br: 0, ar: 0 }, tension: 0, jitter: 0, dispT: 0, stage: 0, attTeam: null,
      comm: [{ t: "Build-up at the Azteca. Kickoff imminent…", dim: false }],
      win: null, res: null, beatsOn: false, pts: 0, dispPts: 0,
      squad: [
        { n: "Dmytro", ini: "DM", emoji: "🐯", c: "#FF8A3D", pts: 0, r: null, mov: "▲1" },
        { n: "Olia", ini: "OL", emoji: "🐸", c: "#C08BFF", pts: 0, r: null, mov: "—" },
        { n: "Max", ini: "MX", emoji: "🐙", c: "#3DDC84", pts: 0, r: null, mov: "▼1" },
        { n: "Sasha", ini: "SA", emoji: "🚀", c: "#FF5E8A", pts: 0, r: null, mov: "▲1" },
      ],
      lb: false, lbTab: "squad", flash: null, slam: null, shake: false, homeTab: "upcoming", navTab: "matches", squadView: "list", openSquadIdx: 0, matchSquadIdx: null, myReact: null, squads: SQUADS, modal: null, form: { name: "", emoji: "⚽", code: "", user: "" },
      ended: false, pre: { winner: null, goals: null }, hist: [], toast: null, settled: false, authStep: "connect", onbUser: "",
    };
  }

  componentDidMount() {
    this._timers = [];
    this._ptsTotal = 0;
    this._dispNow = 0;
    const ss = this.props.startScreen;
    if (ss === "pre") this.setState({ screen: "pre" });
    if (ss === "live") this.enterLive();
    if (ss === "post") this.setState({ screen: "post", clock: "90+5'", phase: "FT", score: { br: 1, ar: 1 }, ended: true });
    if (ss === "lb") { this.enterLive(); this._t(() => this.setState({ lb: true }), 60); }
    this._dispT = 0; this._jitV = 0; this._jitAt = 0;
    this._lerp = setInterval(() => {
      if (this.state.screen !== "live") return;
      const now = performance.now();
      if (now - this._jitAt > 1050) {
        this._jitAt = now;
        this._jitV = (Math.random() - 0.5) * (0.06 + this.state.stage * 0.05);
      }
      const st = this.state;
      const target = Math.max(-1, Math.min(1, st.tension + (st.stage > 0 ? this._jitV : this._jitV * 0.5)));
      const d = target - this._dispT;
      if (Math.abs(d) < 0.002) return;
      this._dispT += d * 0.16;
      this.setState({ dispT: this._dispT });
    }, 80);
    this._autoI = setInterval(() => {
      if (!this.state.auto) return;
      const s = this.state;
      if (s.screen === "home" || s.screen === "pre") { this.next(); return; }
      if (s.screen !== "live") return;
      if (s.res) { this.setState({ res: null }); return; }
      if (s.win || s.beatsOn) return;
      if (s.ended) { this.setState({ auto: false }); this.goPost(); return; }
      this.next();
    }, 2600);
    this._key = (e: KeyboardEvent) => {
      const s = this.state;
      if (s.win && ["1", "2", "3", "4"].includes(e.key)) { this.pick(OPTS[+e.key - 1].k); return; }
      if (e.key === " " || e.key === "ArrowRight") { e.preventDefault(); this.next(); }
    };
    window.addEventListener("keydown", this._key);
    this.syncRoute();
  }
  componentDidUpdate() {
    this.syncRoute();
  }
  componentWillUnmount() {
    this.clearAll();
    clearInterval(this._autoI); clearInterval(this._lerp);
    if (this._key) window.removeEventListener("keydown", this._key);
  }

  // Mirror engine state → URL. Called after mount and every update; only pushes
  // when the derived route differs from the current path.
  routeForState(): string {
    const s = this.state;
    if (s.authStep === "connect") return "/signin";
    if (s.authStep === "username") return "/onboarding";
    if (s.screen === "live") return "/live";
    if (s.screen === "post") return "/recap";
    const tab = s.navTab;
    if (tab === "ranks") return "/rankings";
    if (tab === "squad") return s.squadView === "detail" ? "/squads/" + s.openSquadIdx : "/squads";
    if (tab === "profile") return "/profile";
    if (tab === "rewards") return "/rewards";
    return "/matches";
  }
  syncRoute() {
    const desired = this.routeForState();
    if (this.props.pathname !== desired) this.props.navigate(desired);
  }

  clearAll() {
    (this._timers || []).forEach(clearTimeout); this._timers = [];
    clearInterval(this._ct); cancelAnimationFrame(this._raf);
  }
  _t(fn: () => void, ms: number) { const id = setTimeout(fn, ms); this._timers.push(id); return id; }

  hexA(h: string, a: number) {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  commPush(s: AppState, t: string) {
    const prev = (s.comm && s.comm[0]) ? [{ t: s.comm[0].t, dim: true }] : [];
    return [{ t: t, dim: false }].concat(prev);
  }

  next = () => {
    const s = this.state;
    if (s.screen === "home") { this.setState({ screen: "pre" }); return; }
    if (s.screen === "pre") { this.enterLive(); return; }
    if (s.screen === "post") { this.restart(); return; }
    if (s.win || s.beatsOn) return;
    if (s.res) { this.setState({ res: null }); return; }
    if (s.ended) { this.goPost(); return; }
    const mi = s.mi + 1;
    if (mi >= MOMENTS.length) { this.goPost(); return; }
    this.applyMoment(mi);
  };

  applyMoment(mi: number) {
    const m = MOMENTS[mi];
    this.setState((s) => {
      const p: Partial<AppState> = { mi: mi };
      if (m.clock) p.clock = m.clock;
      if (m.phase) p.phase = m.phase;
      if (m.comm) p.comm = this.commPush(s, m.comm);
      if (m.stage != null) { p.stage = m.stage; p.tension = m.t; p.attTeam = m.team || null; }
      if (m.end) p.ended = true;
      return p as AppState;
    });
    if (m.squad) this.react(m.squad);
    if (m.window) this.openWindow(m.window);
    if (m.autoBeats) this.runBeats(m.autoBeats, null);
  }

  react(pairs: [number, string][]) {
    this.setState((s) => ({ squad: s.squad.map((q, i) => { const hit = pairs.find((p) => p[0] === i); return hit ? Object.assign({}, q, { r: hit[1] }) : q; }) }));
    this._t(() => this.setState((s) => ({ squad: s.squad.map((q) => Object.assign({}, q, { r: null })) })), 3400);
  }

  openWindow(w: import("./constants").MatchWindow) {
    const total = this.props.windowSeconds ?? 5;
    this._winT0 = performance.now();
    this.setState((s) => ({ win: Object.assign({}, w, { left: total, total: total, pick: null }), stage: Math.max(s.stage, 1), attTeam: w.team }));
    clearInterval(this._ct);
    this._ct = setInterval(() => {
      const left = total - (performance.now() - this._winT0) / 1000;
      if (left <= 0) {
        clearInterval(this._ct);
        this.resolveWindow();
      } else {
        this.setState((s) => (s.win ? { win: Object.assign({}, s.win, { left: left }) } : null));
      }
    }, 100);
  }

  pick = (k: OutcomeKey) => {
    this.setState((s) => (s.win && !s.win.pick ? { win: Object.assign({}, s.win, { pick: k }) } : null));
  };

  resolveWindow() {
    const snap = this.state.win;
    if (!snap) return;
    // The result popup (res) was removed — the goal slam + points feedback are
    // enough. We still score the window, award points and record history.
    let earned = 0;
    let pickK: OutcomeKey | null = null;
    this.setState((s) => {
      const win = s.win;
      if (!win) return null;
      pickK = win.pick;
      const correct = pickK === win.outcome;
      earned = correct && pickK ? PTS[pickK] : 0;
      const squad = s.squad.map((q, i) => {
        const sr = (win.squadResults || []).find((p) => p[0] === i);
        if (!sr) return q;
        if (sr[1] === win.outcome) {
          const g = PTS[sr[1]];
          return Object.assign({}, q, { pts: q.pts + g, r: "+" + g });
        }
        return Object.assign({}, q, { r: "😵" });
      });
      return {
        win: null, beatsOn: true, squad: squad,
        hist: s.hist.concat([{ min: win.minN, clock: s.clock, pick: pickK, outcome: win.outcome, earned: earned, my: win.my }]),
      };
    });
    this._t(() => this.setState((s) => ({ squad: s.squad.map((q) => Object.assign({}, q, { r: null })) })), 4600);
    this.runBeats(snap.beats, () => {
      if (earned) this.award(earned);
    });
  }

  runBeats(beats: import("./constants").Beat[], done: (() => void) | null) {
    this.setState({ beatsOn: true });
    let acc = 0;
    beats.forEach((b) => {
      acc += b.d;
      this._t(() => {
        this.setState((s) => {
          const p: Partial<AppState> = { tension: b.t, stage: b.stage, comm: this.commPush(s, b.comm) };
          if (b.goal) {
            const score = Object.assign({}, s.score); score[b.goal]++;
            p.score = score; p.flash = b.goal; p.shake = true;
            p.slam = { word: "GOAL", sub: (b.scorer || "") + " · " + s.clock, team: b.goal };
          }
          if (b.shake) { p.shake = true; p.flash = "wh"; }
          return p as AppState;
        });
        if (b.goal || b.shake) this._t(() => this.setState({ flash: null, shake: false }), 950);
        if (b.goal) this._t(() => this.setState({ slam: null }), 1800);
      }, acc);
    });
    this._t(() => { this.setState({ beatsOn: false }); if (done) done(); }, acc + 700);
  }

  award(n: number) {
    this._ptsTotal = (this._ptsTotal || 0) + n;
    this.setState((s) => ({ pts: s.pts + n }));
    cancelAnimationFrame(this._raf);
    const from = this._dispNow || 0;
    const to = this._ptsTotal;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 850);
      const e = 1 - Math.pow(1 - p, 3);
      this._dispNow = Math.round(from + (to - from) * e);
      this.setState({ dispPts: this._dispNow });
      if (p < 1) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  enterLive = () => {
    this.setState({ screen: "live" });
    if (this.state.mi < 0) {
      this._t(() => { if (this.state.mi < 0 && this.state.screen === "live") this.applyMoment(0); }, 420);
    }
  };

  goPost = () => {
    const s = this.state;
    if (s.screen === "post") return;
    if (!s.settled) {
      const bW = s.pre.winner === "draw" ? 10 : 0;
      const bG = s.pre.goals === "2-3" ? 10 : 0;
      this.setState((st) => ({ settled: true, squad: st.squad.map((q) => (q.n === "Dmytro" || q.n === "Max") ? Object.assign({}, q, { pts: q.pts + 10 }) : q) }));
      if (bW + bG) this.award(bW + bG);
    }
    this.setState({ screen: "post", lb: false, res: null, auto: false, clock: "90+5'", phase: "FT", score: { br: 1, ar: 1 }, ended: true });
  };

  restart = () => { this.clearAll(); this._ptsTotal = 0; this._dispNow = 0; this._dispT = 0; this._jitV = 0; this.setState(this.fresh()); };

  flagEl(code: string, size: number, ring?: string) {
    return <Flag code={code} size={size} ring={ring} />;
  }
  buildEkg() {
    return <MatchEkg hist={this.state.hist} />;
  }

  goHome = () => this.setState({ screen: "home" });
  goPre = () => this.setState({ screen: "pre" });
  cycleSquad = () => this.setState((s) => ({ matchSquadIdx: ((s.matchSquadIdx || 0) + 1) % SQUADS.length }));
  pickSquad = (i: number) => this.setState({ matchSquadIdx: i, modal: null });
  openSquadPicker = () => this.setState({ modal: "picksquad" });
  sendReact = (em: string) => { this.setState({ myReact: em }); clearTimeout(this._reactT); this._reactT = setTimeout(() => this.setState({ myReact: null }), 3000); };
  tabUpcoming = () => this.setState({ homeTab: "upcoming" });
  tabPast = () => this.setState({ homeTab: "past" });
  setNav = (t: AppState["navTab"]) => this.setState({ navTab: t, squadView: "list" });
  openSquadDetail = (i: number) => this.setState({ squadView: "detail", openSquadIdx: i });
  // Deep-link entry for /squads/[idx]: sets nav tab + detail view in one update
  // so the URL mirror doesn't briefly bounce through the list route.
  openSquadRoute = (i: number) => this.setState({ navTab: "squad", squadView: "detail", openSquadIdx: i });
  backSquadList = () => this.setState({ squadView: "list" });
  openModal = (m: AppState["modal"]) => this.setState({ modal: m, form: { name: "", emoji: "⚽", code: "", user: "" } });
  closeModal = () => this.setState({ modal: null });
  setForm = (k: keyof AppState["form"], v: string) => this.setState((s) => ({ form: Object.assign({}, s.form, { [k]: v }) }));
  doCreate = () => {
    const f = this.state.form; const name = (f.name || "").trim() || "New Squad";
    const code = (name.replace(/[^a-z]/gi, "").slice(0, 5).toUpperCase()) || "SQUAD";
    const sq = { name: name, emoji: f.emoji || "⚽", ring: RINGS[Math.floor(Math.random() * RINGS.length)], code: code, myRank: "#1",
      members: [{ name: "@gutcaller", emoji: "🦊", ring: "#FFD84D", pts: "640", you: true }] };
    this.setState((s) => ({ squads: s.squads.concat([sq]), modal: null, squadView: "detail", openSquadIdx: s.squads.length }));
  };
  doJoin = () => {
    const code = (this.state.form.code || "").trim().toUpperCase() || "SQUAD";
    const sq = { name: code.charAt(0) + code.slice(1).toLowerCase() + " Squad", emoji: "🎟️", ring: "#7FB8E8", code: code, myRank: "#3",
      members: [
        { name: "@host", emoji: "🐺", ring: "#FFD84D", pts: "720" },
        { name: "@mia", emoji: "🐸", ring: "#3DDC84", pts: "610" },
        { name: "@gutcaller", emoji: "🦊", ring: "#FFD84D", pts: "640", you: true },
      ] };
    this.setState((s) => ({ squads: s.squads.concat([sq]), modal: null, squadView: "detail", openSquadIdx: s.squads.length }));
  };
  doAddMember = () => {
    const u = (this.state.form.user || "").trim(); if (!u) { this.closeModal(); return; }
    const handle = u[0] === "@" ? u : "@" + u;
    const emojis = ["🐼", "🐧", "🦉", "🐨", "🐝", "🦁", "🐰", "🐢"];
    this.setState((s) => {
      const idx = s.openSquadIdx || 0;
      const squads = s.squads.map((sq, i) => i === idx ? Object.assign({}, sq, { members: sq.members.concat([{ name: handle, emoji: emojis[sq.members.length % emojis.length], ring: RINGS[sq.members.length % RINGS.length], pts: String(300 + Math.floor(Math.random() * 220)) }]) }) : sq);
      return { squads: squads, modal: null };
    });
  };
  logout = () => { this.setState({ toast: "Demo only — wallet stays connected" }); this._t(() => this.setState({ toast: null }), 2200); };
  demoToast = () => { this.setState({ toast: "Only the live semi-final is playable in this demo" }); this._t(() => this.setState({ toast: null }), 2200); };
  demoWindow = () => { const m = MOMENTS.find((x) => x.window); if (!m || !m.window) return; clearInterval(this._ct); this.setState({ screen: "live", win: Object.assign({}, m.window, { left: 5, total: 5, pick: null }), winDrag: 0 }); };
  dismissWin = () => { clearInterval(this._ct); this.setState({ win: null, winDrag: 0 }); };
  demoGoal = () => { clearInterval(this._ct); this.setState({ screen: "live", flash: "br", shake: true, slam: { word: "GOAL", sub: "RODRYGO · 12'", team: "br" }, score: { br: 1, ar: 0 } }); this._t(() => this.setState({ flash: null, shake: false }), 950); };
  dismissGoal = () => this.setState({ slam: null, flash: null, shake: false });
  connectWallet = () => this.setState({ authStep: "username" });
  saveUsername = () => this.setState({ authStep: "done" });
  showOnboarding = () => this.setState({ authStep: "connect", onbUser: "" });
  setOnb = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ onbUser: e.target.value });
  winDown = (e: React.PointerEvent) => { this._dragY0 = e.clientY; this._dragging = true; };
  winMove = (e: React.PointerEvent) => { if (!this._dragging) return; const dy = Math.max(0, e.clientY - this._dragY0); this.setState({ winDrag: dy }); };
  winUp = () => { if (!this._dragging) return; this._dragging = false; if ((this.state.winDrag || 0) > 70) this.dismissWin(); else this.setState({ winDrag: 0 }); };
  toggleAuto = () => {
    const was = this.state.auto;
    this.setState({ auto: !was });
    if (!was) this._t(() => { if (this.state.auto) this.next(); }, 250);
  };
  openLb = () => this.setState({ lb: true });
  closeLb = () => this.setState({ lb: false });
  tabSquad = () => this.setState({ lbTab: "squad" });
  tabGlobal = () => this.setState({ lbTab: "global" });
  share = () => {
    this.setState({ toast: "Link copied — flex responsibly 🔥" });
    this._t(() => this.setState({ toast: null }), 2000);
  };

  renderVals(): ViewModel {
    const s = this.state, T = TEAMS;
    const emb = this.props.embed ?? false;
    const motion = (this.props.motion ?? "full") === "full";
    const t = Math.max(-1, Math.min(1, s.dispT));
    const mag = Math.abs(t);
    const fillW = Math.max(2.5, mag * 48);
    const isBr = t >= 0;
    const glowA = 0.25 + s.stage * 0.16;
    const attT = s.attTeam ? T[s.attTeam] : (isBr ? T.br : T.ar);

    const stagePills = STAGES.map((sg, i) => {
      const on = s.screen === "live" && s.mi >= 0 && i <= s.stage;
      const hot = on && i === s.stage && s.stage > 0;
      return {
        label: sg.label,
        bg: on ? this.hexA(sg.c, 0.16) : "rgba(255,255,255,.03)",
        col: on ? sg.c : "rgba(255,255,255,.25)",
        bd: on ? this.hexA(sg.c, 0.5) : "rgba(255,255,255,.07)",
        glow: hot && motion ? "0 0 14px " + this.hexA(sg.c, 0.35) : "none",
        anim: (i === 3 && s.stage === 3 && motion) ? "kfDot .55s ease-in-out infinite" : "none",
      };
    });

    const win = s.win;
    const C = 131.9;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let winVals: any = { winOpen: false, winTeamColor: "#FFD84D", winGlow: "rgba(0,0,0,0)", winHead: "", ringOffset: "0", ringColor: "#FFD84D", ringNum: "", winOpts: [], winNote: "" };
    if (win) {
      const TT = T[win.team];
      winVals = {
        winOpen: true,
        winTeamColor: TT.c,
        winGlow: this.hexA(TT.c, 0.22),
        winHead: TT.name + " IS BUILDING AN ATTACK",
        ringOffset: String(C * (1 - win.left / win.total)),
        ringColor: win.left <= 1.7 ? "#FF4D5E" : TT.c,
        ringNum: String(Math.ceil(win.left)),
        winNote: win.pick ? "Locked: " + LBL[win.pick] + " — eyes on the TV" : "Tap to lock your call · points scale with difficulty",
        winOpts: OPTS.map((o) => {
          const sel = win.pick === o.k;
          const locked = !!win.pick;
          return {
            label: o.label, pts: "+" + PTS[o.k],
            on: () => this.pick(o.k),
            bg: sel ? "linear-gradient(135deg," + TT.c + "," + TT.c2 + ")" : "rgba(255,255,255,.045)",
            col: sel ? TT.dark : "#F2F6FC",
            bd: sel ? TT.c : "rgba(255,255,255,.13)",
            op: locked && !sel ? "0.32" : "1",
            ptsCol: sel ? TT.dark : HOT[o.k],
          };
        }),
      };
    }

    const res = s.res;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resVals: any = { resOpen: false, resReached: "", resReachedCol: "#fff", resGlow: "rgba(0,0,0,0)", resPickLine: "", resPts: "", resPtsCol: "#fff", resTitle: "", resSquadLine: "" };
    if (res) {
      resVals = {
        resOpen: true,
        resReached: LBLR[res.outcome],
        resReachedCol: HOT[res.outcome],
        resGlow: this.hexA(HOT[res.outcome], 0.28),
        resPickLine: res.pick ? "Your call: " + LBL[res.pick] : "You let this one ride — no pick",
        resPts: "+" + res.earned,
        resPtsCol: res.earned ? "#3DDC84" : "rgba(255,255,255,.4)",
        resTitle: res.correct ? (res.outcome === "goal" ? "CALLED IT — OUT OF NOTHING!" : "NAILED IT") : (res.pick ? "SO CLOSE" : "NO PICK THIS TIME"),
        resSquadLine: res.squadLine,
      };
    }

    const rank = 1 + s.squad.filter((q) => q.pts > s.pts).length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lbRows: any[] = [];
    if (s.lbTab === "squad") {
      const entries = [{ name: "You", sub: "that's you", pts: s.pts, ring: "#FFD84D", ini: "YOU", you: true, mov: s.pts > 0 ? "▲" : "—" }]
        .concat(s.squad.map((q) => ({ name: q.n, sub: "squad", pts: q.pts, ring: q.c, ini: q.ini, you: false, mov: q.mov })));
      entries.sort((a, b) => b.pts - a.pts);
      lbRows = entries.map((q, i) => ({
        rank: String(i + 1), rankCol: i === 0 ? "#FFD84D" : i === 1 ? "#C9D6E8" : i === 2 ? "#C08D5A" : "rgba(255,255,255,.45)",
        ini: q.ini, ring: q.ring, name: q.name, sub: q.sub, pts: String(q.pts),
        mov: q.mov, movCol: q.mov.indexOf("▲") === 0 ? "#3DDC84" : q.mov.indexOf("▼") === 0 ? "#FF4D5E" : "rgba(255,255,255,.3)",
        bg: q.you ? "rgba(255,216,77,.09)" : "rgba(255,255,255,.02)",
        bd: q.you ? "rgba(255,216,77,.35)" : "rgba(255,255,255,.06)",
      }));
    } else {
      const yr = Math.max(1204, 15832 - s.pts * 95);
      lbRows = GLOBALS.map((q) => ({
        rank: q.rank, rankCol: q.rank === "1" ? "#FFD84D" : "rgba(255,255,255,.45)",
        ini: q.ini, ring: q.ring, name: q.name, sub: q.sub, pts: String(q.pts),
        mov: q.mov, movCol: q.mov.indexOf("▲") === 0 ? "#3DDC84" : q.mov.indexOf("▼") === 0 ? "#FF4D5E" : "rgba(255,255,255,.3)",
        bg: "rgba(255,255,255,.02)", bd: "rgba(255,255,255,.06)",
      })).concat([{
        rank: "#" + yr.toLocaleString("en-US"), rankCol: "#FFD84D",
        ini: "YOU", ring: "#FFD84D", name: "You", sub: "worldwide", pts: String(s.pts),
        mov: "▲" + (s.pts * 95).toLocaleString("en-US"), movCol: "#3DDC84",
        bg: "rgba(255,216,77,.09)", bd: "rgba(255,216,77,.35)",
      }]);
    }

    const mkChip = (sel: boolean) => ({
      bg: sel ? "rgba(255,216,77,.15)" : "rgba(255,255,255,.04)",
      col: sel ? "#FFD84D" : "#DCE6F5",
      bd: sel ? "rgba(255,216,77,.55)" : "rgba(255,255,255,.12)",
    });
    const winnerOpts = [{ k: "br", label: "Brazil" }, { k: "draw", label: "Draw" }, { k: "ar", label: "Argentina" }]
      .map((o) => Object.assign({ label: o.label, on: () => this.setState((st) => ({ pre: Object.assign({}, st.pre, { winner: o.k as AppState["pre"]["winner"] }) })) }, mkChip(s.pre.winner === o.k)));
    const goalsOpts = [{ k: "0-1", label: "0–1" }, { k: "2-3", label: "2–3" }, { k: "4+", label: "4+" }]
      .map((o) => Object.assign({ label: o.label, on: () => this.setState((st) => ({ pre: Object.assign({}, st.pre, { goals: o.k as AppState["pre"]["goals"] }) })) }, mkChip(s.pre.goals === o.k)));

    const scenes = [
      { k: "home", label: "Home", on: this.goHome },
      { k: "live", label: "Live", on: this.enterLive },
      { k: "post", label: "Post / EKG", on: this.goPost },
    ].map((sc) => ({
      label: sc.label, on: sc.on,
      bg: s.screen === sc.k ? "rgba(255,216,77,.14)" : "rgba(255,255,255,.04)",
      col: s.screen === sc.k ? "#FFD84D" : "rgba(220,230,245,.7)",
      bd: s.screen === sc.k ? "rgba(255,216,77,.5)" : "rgba(255,255,255,.1)",
    }));

    let nextLabel: string;
    if (s.screen === "home") nextLabel = "START THE DEMO ▶";
    else if (s.screen === "pre") nextLabel = "SKIP TO LIVE ▶";
    else if (s.screen === "post") nextLabel = "REPLAY THE MATCH ⟲";
    else if (win) nextLabel = "PICK ON THE PHONE · " + Math.ceil(win.left) + "S";
    else if (s.beatsOn) nextLabel = "ATTACK UNFOLDING…";
    else if (s.res) nextLabel = "CONTINUE ▶";
    else if (s.ended) nextLabel = "SEE YOUR MATCH EKG →";
    else nextLabel = "NEXT MOMENT · " + (MOMENTS[s.mi + 1] ? MOMENTS[s.mi + 1].clock : "FT");

    const busy = !!win || s.beatsOn;

    const phaseMap: Record<string, [string, string]> = { PRE: ["#9FB3C8", "rgba(159,179,200,.12)"], LIVE: ["#FF4D5E", "rgba(255,77,94,.13)"], HT: ["#FFD84D", "rgba(255,216,77,.12)"], FT: ["#9FB3C8", "rgba(159,179,200,.12)"] };
    const ph = phaseMap[s.phase] || phaseMap.PRE;

    const best = s.hist.reduce<AppState["hist"][number] | null>((a, h) => (h.earned > (a ? a.earned : 0) ? h : a), null);
    const postRows = s.hist.map((h) => ({
      l: h.clock + " · reached " + LBL[h.outcome] + " — you called " + (h.pick ? LBL[h.pick] : "nothing"),
      r: h.earned ? "+" + h.earned : "0",
      col: h.earned ? "#3DDC84" : "rgba(255,255,255,.4)",
    }));
    if (s.pre.winner || s.pre.goals) {
      if (s.pre.winner) postRows.push({ l: "Pre-match · winner: " + ({ br: "Brazil", draw: "Draw", ar: "Argentina" } as Record<string, string>)[s.pre.winner], r: s.pre.winner === "draw" ? "+10" : "0", col: s.pre.winner === "draw" ? "#3DDC84" : "rgba(255,255,255,.4)" });
      if (s.pre.goals) postRows.push({ l: "Pre-match · total goals: " + s.pre.goals, r: s.pre.goals === "2-3" ? "+10" : "0", col: s.pre.goals === "2-3" ? "#3DDC84" : "rgba(255,255,255,.4)" });
    } else {
      postRows.push({ l: "Pre-match · skipped", r: "—", col: "rgba(255,255,255,.3)" });
    }

    const vm = Object.assign({
      showControls: !emb,
      wrapMinH: emb ? "auto" : "100vh",
      wrapPad: emb ? "0" : "34px 28px",
      wrapBg: emb ? "transparent" : "radial-gradient(90% 70% at 50% 0%, #0B1322 0%, #04060B 62%)",
      isHome: s.screen === "home", isPre: s.screen === "pre", isLive: s.screen === "live", isPost: s.screen === "post",
      navTab: s.navTab || "matches",
      isMatches: (s.navTab || "matches") === "matches", isRanks: s.navTab === "ranks", isSquadTab: s.navTab === "squad", isProfile: s.navTab === "profile", isRewards: s.navTab === "rewards",
      navMatches: () => this.setNav("matches"), navRanks: () => this.setNav("ranks"), navSquadTab: () => this.setNav("squad"), navProfile: () => this.setNav("profile"), navRewards: () => this.setNav("rewards"),
      cMatches: (s.navTab || "matches") === "matches" ? "#FFD84D" : "#DCE6F5",
      oMatches: (s.navTab || "matches") === "matches" ? "1" : ".5",
      cRanks: s.navTab === "ranks" ? "#FFD84D" : "#DCE6F5",
      oRanks: s.navTab === "ranks" ? "1" : ".42",
      cSquad: s.navTab === "squad" ? "#FFD84D" : "#DCE6F5",
      oSquad: s.navTab === "squad" ? "1" : ".42",
      cRewards: s.navTab === "rewards" ? "#FFD84D" : "#DCE6F5",
      oRewards: s.navTab === "rewards" ? "1" : ".42",
      cProfile: s.navTab === "profile" ? "#FFD84D" : "#DCE6F5",
      oProfile: s.navTab === "profile" ? "1" : ".42",
      squadList: s.squad.map((q) => ({ n: q.n, ini: q.ini, c: q.c, mov: q.mov, pts: String(120 + s.squad.indexOf(q) * -13 + 40), tot: String(680 - s.squad.indexOf(q) * 55) })),
      isSquadList: (s.squadView || "list") !== "detail",
      isSquadDetail: s.squadView === "detail",
      backSquadList: this.backSquadList,
      squadCards: s.squads.map((sq, i) => ({ name: sq.name, emoji: sq.emoji, ring: sq.ring, myRank: sq.myRank, count: sq.members.length + " members", onClick: () => this.openSquadDetail(i) })),
      openCreate: () => this.openModal("create"), openJoin: () => this.openModal("join"), openAdd: () => this.openModal("add"),
      closeModal: this.closeModal, doCreate: this.doCreate, doJoin: this.doJoin, doAddMember: this.doAddMember,
      modalOpen: !!s.modal, modalCreate: s.modal === "create", modalJoin: s.modal === "join", modalAdd: s.modal === "add", modalPick: s.modal === "picksquad",
      formName: s.form.name, formCode: s.form.code, formUser: s.form.user,
      setName: (e: React.ChangeEvent<HTMLInputElement>) => this.setForm("name", e.target.value),
      setCode: (e: React.ChangeEvent<HTMLInputElement>) => this.setForm("code", e.target.value.toUpperCase()),
      setUser: (e: React.ChangeEvent<HTMLInputElement>) => this.setForm("user", e.target.value),
      emojiOpts: ["⚽", "🔥", "⚡", "🏆", "🐉", "👑"].map((em) => ({ em: em, pick: () => this.setForm("emoji", em), bd: s.form.emoji === em ? "#FFD84D" : "rgba(255,255,255,.12)", bg: s.form.emoji === em ? "rgba(255,216,77,.14)" : "rgba(255,255,255,.04)" })),
      openSquad: (function (sq) {
        const sorted = sq.members.slice().sort((a, b) => parseInt(b.pts.replace(/,/g, "")) - parseInt(a.pts.replace(/,/g, "")));
        const medal = [
          { bg: "linear-gradient(135deg,rgba(255,216,77,.22),rgba(255,216,77,.05))", bd: "rgba(255,216,77,.5)", num: "#FFD84D" },
          { bg: "linear-gradient(135deg,rgba(201,214,232,.16),rgba(201,214,232,.04))", bd: "rgba(201,214,232,.42)", num: "#C9D6E8" },
          { bg: "linear-gradient(135deg,rgba(214,154,92,.16),rgba(214,154,92,.04))", bd: "rgba(214,154,92,.42)", num: "#D69A5C" },
        ];
        return {
          name: sq.name, emoji: sq.emoji, ring: sq.ring, code: sq.code, count: sq.members.length + " members",
          top3: sorted.slice(0, 3).map((m, i) => ({
            rank: String(i + 1), name: m.name, emoji: m.emoji, ring: m.ring, pts: m.pts,
            medalBg: medal[i].bg, medalBd: medal[i].bd, numCol: medal[i].num,
            nameCol: m.you ? "#FFD84D" : "#F2F6FC",
          })),
          rest: sorted.slice(3).map((m, i) => ({
            rank: String(i + 4), name: m.name, emoji: m.emoji, ring: m.ring, pts: m.pts,
            rowBg: m.you ? "rgba(255,216,77,.1)" : "rgba(255,255,255,.035)",
            rowBd: m.you ? "rgba(255,216,77,.45)" : "rgba(255,255,255,.08)",
            rankCol: m.you ? "#FFD84D" : "rgba(220,230,245,.5)",
            nameCol: m.you ? "#FFD84D" : "#F2F6FC",
            ptsCol: m.you ? "#FFD84D" : "#3DDC84",
          })),
        };
      })(this.state.squads[s.openSquadIdx || 0]),
      globalList: GLOBALS,
      rankTop3: [
        { rank: "1", name: "@thiago", pts: "2,240", emoji: "🦊", ring: "#FFD84D", medalBg: "linear-gradient(135deg,rgba(255,216,77,.22),rgba(255,216,77,.05))", medalBd: "rgba(255,216,77,.5)", numCol: "#FFD84D" },
        { rank: "2", name: "@lapulga10", pts: "2,205", emoji: "🐸", ring: "#C9D6E8", medalBg: "linear-gradient(135deg,rgba(201,214,232,.16),rgba(201,214,232,.04))", medalBd: "rgba(201,214,232,.42)", numCol: "#C9D6E8" },
        { rank: "3", name: "@yellowwall", pts: "2,190", emoji: "🐙", ring: "#D69A5C", medalBg: "linear-gradient(135deg,rgba(214,154,92,.16),rgba(214,154,92,.04))", medalBd: "rgba(214,154,92,.42)", numCol: "#D69A5C" },
      ],
      rankAround: [
        { rank: "126", name: "@mateus", pts: "664", emoji: "🐼", ring: "#8FA9FF", you: false },
        { rank: "127", name: "@sofia_g", pts: "651", emoji: "🚀", ring: "#3DDC84", you: false },
        { rank: "128", name: "@gutcaller", pts: "640", emoji: "🦊", ring: "#FFD84D", you: true },
        { rank: "129", name: "@kunle", pts: "628", emoji: "🐢", ring: "#FF8A5C", you: false },
        { rank: "130", name: "@dani", pts: "615", emoji: "🐵", ring: "#C08BFF", you: false },
      ].map((q) => ({
        rank: q.rank, name: q.name, pts: q.pts, emoji: q.emoji, ring: q.ring,
        rowBg: q.you ? "rgba(255,216,77,.1)" : "rgba(255,255,255,.035)",
        rowBd: q.you ? "rgba(255,216,77,.45)" : "rgba(255,255,255,.08)",
        rankCol: q.you ? "#FFD84D" : "rgba(220,230,245,.5)",
        nameCol: q.you ? "#FFD84D" : "#F2F6FC",
        ptsCol: q.you ? "#FFD84D" : "#3DDC84",
      })),
      logout: this.logout,
      demoToast: this.demoToast,
      recentMatches: [
        { comp: "WC26 · QUARTER-FINAL", score: "2 – 1", pts: "+40", hEl: this.flagEl("BRA", 26), aEl: this.flagEl("ARG", 26) },
        { comp: "WC26 · ROUND OF 16", score: "1 – 0", pts: "+15", hEl: this.flagEl("FRA", 26), aEl: this.flagEl("MAR", 26) },
        { comp: "WC26 · GROUP F", score: "3 – 2", pts: "+30", hEl: this.flagEl("NED", 26), aEl: this.flagEl("GER", 26) },
        { comp: "WC26 · GROUP C", score: "2 – 1", pts: "+25", hEl: this.flagEl("ARG", 26), aEl: this.flagEl("COL", 26) },
      ],
      isUpcoming: (s.homeTab || "upcoming") === "upcoming", isPast: (s.homeTab || "upcoming") === "past",
      tabUpcoming: this.tabUpcoming, tabPast: this.tabPast,
      upCol: (s.homeTab || "upcoming") === "upcoming" ? "#F2F6FC" : "rgba(220,230,245,.4)",
      upBar: (s.homeTab || "upcoming") === "upcoming" ? "#FFD84D" : "transparent",
      pastCol: (s.homeTab || "upcoming") === "past" ? "#F2F6FC" : "rgba(220,230,245,.4)",
      pastBar: (s.homeTab || "upcoming") === "past" ? "#FFD84D" : "transparent",
      liveClick: this.enterLive, liveComp: "WORLD CUP 26 · SEMI-FINAL", liveClock: "84' · LIVE", liveScore: "1 – 1",
      brFlag: this.flagEl("BRA", 48), arFlag: this.flagEl("ARG", 48),
      matchSquadName: s.matchSquadIdx != null ? SQUADS[s.matchSquadIdx].name : "",
      matchSquadEmoji: s.matchSquadIdx != null ? SQUADS[s.matchSquadIdx].emoji : "",
      hasMatchSquad: s.matchSquadIdx != null,
      noMatchSquad: s.matchSquadIdx == null,
      openSquadPicker: this.openSquadPicker,
      squadPickList: SQUADS.map((sq, i) => ({ name: sq.name, emoji: sq.emoji, ring: sq.ring, count: sq.members.length + " members", pick: () => this.pickSquad(i), selBd: s.matchSquadIdx === i ? "#FFD84D" : "rgba(255,255,255,.08)", selBg: s.matchSquadIdx === i ? "rgba(255,216,77,.08)" : "rgba(255,255,255,.035)" })),
      reactOpts: ["🔥", "😱", "⚽", "🤡", "👎"].map((em) => ({ em: em, send: () => this.sendReact(em) })),
      matchStanding: (function (squad, myPts) { const better = squad.filter((q) => q.pts > myPts).length; return "#" + (better + 1) + " of " + (squad.length + 1); })(s.squad, s.pts),
      matchSquadRow: (function (squad, myPts, myReact) {
        const all = [{ name: "You", emoji: "🦊", ring: "#FFD84D", pts: myPts, r: myReact, isYou: true }]
          .concat(squad.map((q) => ({ name: q.n, emoji: q.emoji, ring: q.c, pts: q.pts, r: q.r, isYou: false })));
        all.sort((a, b) => b.pts - a.pts);
        return all.map((m, i) => {
          return { rank: String(i + 1), name: m.name, emoji: m.emoji, pts: String(m.pts), r: m.r || "", hasR: !!m.r, isYou: m.isYou,
            ringCss: m.isYou ? "#FFD84D" : m.ring, nameCol: m.isYou ? "#FFD84D" : "rgba(220,230,245,.55)",
            rowBg: m.isYou ? "rgba(255,216,77,.1)" : "rgba(255,255,255,.035)", rowBd: m.isYou ? "rgba(255,216,77,.4)" : "rgba(255,255,255,.07)",
            rankCol: m.isYou ? "#FFD84D" : "rgba(220,230,245,.45)", ptsCol: m.isYou ? "#FFD84D" : "#3DDC84" };
        });
      })(s.squad, s.pts, s.myReact),
      laterMatches: FIXTURES.later.map((m) => Object.assign({}, m, { onClick: this.demoToast, hFlagEl: this.flagEl(m.hc, 38, m.accent), aFlagEl: this.flagEl(m.ac, 38, m.accent) })),
      pastMatches: FIXTURES.past.map((m) => Object.assign({}, m, { onClick: this.demoToast, hFlagEl: this.flagEl(m.hc, 36, m.accent), aFlagEl: this.flagEl(m.ac, 36, m.accent) })),
      appAnim: s.shake && motion ? "kfShake .55s cubic-bezier(.36,.07,.19,.97) both" : "none",
      next: this.next, restart: this.restart, toggleAuto: this.toggleAuto, demoWindow: this.demoWindow, demoGoal: this.demoGoal,
      dismissWin: this.dismissWin, winDown: this.winDown, winMove: this.winMove, winUp: this.winUp, winDragT: (s.winDrag || 0) + "px",
      goHome: this.goHome, goPre: this.goPre, enterLive: this.enterLive,
      nextLabel: nextLabel, nextPe: busy ? "none" : "auto", nextOp: busy ? "0.5" : "1",
      autoLabel: s.auto ? "❚❚ Pause auto-play" : "▶ Auto-play the match",
      autoBg: s.auto ? "rgba(255,77,94,.12)" : "rgba(61,220,132,.1)",
      autoBd: s.auto ? "rgba(255,77,94,.4)" : "rgba(61,220,132,.35)",
      autoCol: s.auto ? "#FF8A94" : "#7DEBAC",
      scenes: scenes,
      clock: s.clock, phaseLabel: s.phase, phaseCol: ph[0], phaseBg: ph[1],
      phaseDotAnim: s.phase === "LIVE" ? "kfDot 1.1s ease-in-out infinite" : "none",
      scoreBr: String(s.score.br), scoreAr: String(s.score.ar),
      attText: s.stage === 0 ? "ALL QUIET" : attT.code + " " + ["", "BUILDING", "THREATENING", "BIG CHANCE"][s.stage],
      attCol: s.stage === 0 ? "rgba(255,255,255,.35)" : attT.c,
      fillLeft: (isBr ? 50 : 50 - fillW) + "%", fillWidth: fillW + "%",
      fillBg: isBr ? "linear-gradient(90deg, rgba(255,216,77,.12), #FFD84D)" : "linear-gradient(270deg, rgba(127,184,232,.12), #7FB8E8)",
      fillGlow: "0 0 " + (10 + s.stage * 8) + "px " + (isBr ? this.hexA("#FFD84D", glowA) : this.hexA("#7FB8E8", glowA)),
      fillRad: isBr ? "0 8px 8px 0" : "8px 0 0 8px",
      pulseBg: isBr ? "#FFD84D" : "#7FB8E8",
      pulseDur: [2.6, 1.5, 0.95, 0.55][s.stage] + "s",
      stagePills: stagePills,
      commMain: s.comm[0] ? s.comm[0].t : "", commPrev: s.comm[1] ? s.comm[1].t : "",
      squadRow: s.squad.map((q) => ({ n: q.n, ini: q.ini, c: q.c, pts: String(q.pts), r: q.r || "", hasR: !!q.r })),
      dispPts: String(s.dispPts), rankChip: "#" + rank + " IN SQUAD", openLb: this.openLb,
      lbOpen: s.lb, closeLb: this.closeLb, tabSquad: this.tabSquad, tabGlobal: this.tabGlobal,
      tabSqBg: s.lbTab === "squad" ? "rgba(255,216,77,.16)" : "transparent",
      tabSqCol: s.lbTab === "squad" ? "#FFD84D" : "rgba(220,230,245,.55)",
      tabGlBg: s.lbTab === "global" ? "rgba(255,216,77,.16)" : "transparent",
      tabGlCol: s.lbTab === "global" ? "#FFD84D" : "rgba(220,230,245,.55)",
      lbRows: lbRows,
      dismissRes: () => this.setState({ res: null }),
      flashOn: !!s.flash,
      flashBg: s.flash === "br" ? "radial-gradient(ellipse at 50% 40%, rgba(255,216,77,.9), rgba(255,216,77,0) 72%)" : s.flash === "ar" ? "radial-gradient(ellipse at 50% 40%, rgba(127,184,232,.9), rgba(127,184,232,0) 72%)" : "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,.65), rgba(255,255,255,0) 72%)",
      slamOn: !!s.slam,
      slamWord: s.slam ? s.slam.word : "", slamSub: s.slam ? s.slam.sub : "",
      slamColor: s.slam ? T[s.slam.team].c : "#fff",
      slamGlow: s.slam ? this.hexA(T[s.slam.team].c, 0.55) : "rgba(0,0,0,0)",
      goalBg: s.slam ? (s.slam.team === "br" ? "radial-gradient(ellipse at 50% 40%, rgba(255,216,77,.32), rgba(6,9,15,.97) 66%)" : "radial-gradient(ellipse at 50% 40%, rgba(127,184,232,.32), rgba(6,9,15,.97) 66%)") : "transparent",
      goalFlagEl: s.slam ? this.flagEl(s.slam.team === "br" ? "BRA" : "ARG", 84) : null,
      goalTeamName: s.slam ? T[s.slam.team].nice.toUpperCase() + " SCORE" : "",
      goalScore: s.slam ? ("BRA " + s.score.br + " – " + s.score.ar + " ARG") : "",
      dismissGoal: this.dismissGoal,
      isAuth: s.authStep === "connect", isUsername: s.authStep === "username",
      connectWallet: this.connectWallet, saveUsername: this.saveUsername, showOnboarding: this.showOnboarding,
      onbUser: s.onbUser, setOnb: this.setOnb,
      toastOn: !!s.toast, toastText: s.toast || "",
      winnerOpts: winnerOpts, goalsOpts: goalsOpts,
      ftScore: "BRAZIL " + s.score.br + " – " + s.score.ar + " ARGENTINA",
      totalPts: String(s.pts),
      rankLine: "#" + rank,
      globalPct: "TOP " + Math.max(1, 40 - Math.floor(s.pts / 4)) + "%",
      globalRank: "#" + Math.max(204, 8420 - s.pts * 11).toLocaleString("en-US"),
      postSquadName: (s.matchSquadIdx != null ? SQUADS[s.matchSquadIdx].name : "YOUR SQUAD").toUpperCase(),
      bestCall: best ? "Called " + LBL[best.pick!] + " at " + best.clock + " (+" + best.earned + ")" : "None landed — the match owned you tonight",
      postRows: postRows,
      ekgSvg: s.screen === "post" ? this.buildEkg() : null,
      share: this.share,
    }, winVals, resVals);
    return vm as unknown as ViewModel;
  }

  actions: AppActions = {
    setNav: (t) => this.setNav(t),
    enterLive: () => this.enterLive(),
    goPost: () => this.goPost(),
    goHome: () => this.goHome(),
    restart: () => this.restart(),
    openSquadDetail: (i) => this.openSquadDetail(i),
    openSquadRoute: (i) => this.openSquadRoute(i),
    backSquadList: () => this.backSquadList(),
    connectWallet: () => this.connectWallet(),
    saveUsername: () => this.saveUsername(),
  };

  render() {
    return (
      <AppContext.Provider value={this.renderVals()}>
        <AppActionsContext.Provider value={this.actions}>
          {this.props.children}
        </AppActionsContext.Provider>
      </AppContext.Provider>
    );
  }
}
