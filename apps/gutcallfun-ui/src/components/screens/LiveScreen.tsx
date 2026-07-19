"use client";

import { useApp } from "@/state/context";
import { Fragment } from "react";

export function LiveScreen() {
  const vm = useApp();
  return (
    <div data-screen-label="Live companion" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "24px 16px 42px", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 2px" }}>
        <button onClick={vm.goHome} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(220,230,245,.55)", fontFamily: "Barlow,sans-serif", fontSize: 13, fontWeight: 600, padding: "2px 0" }}>‹ Matches</button>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ fontSize: 13 }}>🏆</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 13, letterSpacing: ".7px", color: "#F2F6FC" }}>WORLD CUP 26</div>
          <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(220,230,245,.3)" }} />
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 11, letterSpacing: ".7px", color: "#FFD84D", background: "rgba(255,216,77,.12)", border: "1px solid rgba(255,216,77,.35)", borderRadius: 6, padding: "2px 7px" }}>SEMI-FINAL</div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", marginTop: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 96 }}>{vm.brFlag}<div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 13, color: "#FFD84D", whiteSpace: "nowrap" }}>BRAZIL</div></div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 46, lineHeight: 1, letterSpacing: 2 }}>{vm.scoreBr} – {vm.scoreAr}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 96 }}>{vm.arFlag}<div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 13, color: "#7FB8E8", whiteSpace: "nowrap" }}>ARGENTINA</div></div>
      </div>

      <div style={{ borderRadius: 18, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", padding: "13px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2.2px", color: "rgba(220,230,245,.45)" }}>MATCH PRESSURE</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: vm.attCol }}>{vm.attText}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", margin: "10px 2px 4px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: "rgba(255,216,77,.7)" }}>◀ BRAZIL</div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: "rgba(127,184,232,.7)" }}>ARGENTINA ▶</div>
        </div>
        <div style={{ position: "relative", height: 16, borderRadius: 8, background: "#0A1120", boxShadow: "inset 0 2px 6px rgba(0,0,0,.6)" }}>
          <div style={{ position: "absolute", top: 2, bottom: 2, left: vm.fillLeft, width: vm.fillWidth, background: vm.fillBg, boxShadow: vm.fillGlow, borderRadius: vm.fillRad }} />
          <div style={{ position: "absolute", top: 2, bottom: 2, left: vm.fillLeft, width: vm.fillWidth, pointerEvents: "none" }}><div style={{ width: "100%", height: "100%", background: vm.pulseBg, borderRadius: vm.fillRad, filter: "blur(7px)", animation: `kfPulse ${vm.pulseDur} ease-in-out infinite` }} /></div>
          <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.16)", borderRadius: 2, transform: "translateX(-1px)" }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {vm.stagePills.map((p, i) => (
            <Fragment key={i}>
              <div style={{ flex: 1, textAlign: "center", padding: "5px 0", borderRadius: 7, fontSize: "9.5px", fontWeight: 700, letterSpacing: ".8px", background: p.bg, color: p.col, border: `1px solid ${p.bd}`, boxShadow: p.glow, animation: p.anim }}>{p.label}</div>
            </Fragment>
          ))}
        </div>
      </div>

      <div style={{ borderRadius: 18, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", padding: "13px 14px" }}>
        {vm.hasMatchSquad && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>{vm.matchSquadEmoji}</span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".4px" }}>{vm.matchSquadName}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: "rgba(220,230,245,.4)" }}>YOU'RE {vm.matchStanding}</div>
                </div>
              </div>
              <button onClick={vm.openSquadPicker} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 9, padding: "6px 11px", cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 11, letterSpacing: ".5px", color: "rgba(220,230,245,.7)" }}>CHANGE</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 13 }}>
              {vm.matchSquadRow.map((m, i) => (
                <Fragment key={i}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, borderRadius: 11, padding: "7px 11px", background: m.rowBg, border: `1px solid ${m.rowBd}` }}>
                    <div style={{ width: 16, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 14, color: m.rankCol }}>{m.rank}</div>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#0D1626", boxShadow: `0 0 0 2px ${m.ringCss}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{m.emoji}</div>
                    <div style={{ flex: 1, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: ".3px", color: m.nameCol }}>{m.name}</div>
                    {m.hasR && (
                      <>
                        <div style={{ fontSize: 15, animation: "kfPing .4s cubic-bezier(.2,1.4,.4,1) both" }}>{m.r}</div>
                      </>
                    )}
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, color: m.ptsCol, minWidth: 24, textAlign: "right" }}>{m.pts}</div>
                  </div>
                </Fragment>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, paddingTop: 11, borderTop: "1px solid rgba(255,255,255,.07)" }}>
              <div style={{ flex: 1, display: "flex", gap: 6, justifyContent: "space-between" }}>
                {vm.reactOpts.map((e, i) => (
                  <Fragment key={i}>
                    <button onClick={e.send} style={{ flex: 1, height: 38, borderRadius: 11, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", cursor: "pointer", fontSize: 19, display: "flex", alignItems: "center", justifyContent: "center" }}>{e.em}</button>
                  </Fragment>
                ))}
              </div>
            </div>
          </>
        )}
        {vm.noMatchSquad && (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, padding: "8px 0 4px" }}>
              <div style={{ fontSize: 26 }}>👥</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, letterSpacing: ".4px" }}>PICK YOUR SQUAD</div>
              <div style={{ fontSize: "11.5px", lineHeight: 1.4, color: "rgba(220,230,245,.5)", maxWidth: 230 }}>Choose one squad to duel with for this match — compare points live as the game unfolds.</div>
              <button onClick={vm.openSquadPicker} style={{ marginTop: 2, height: 44, padding: "0 22px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 14, letterSpacing: ".8px", cursor: "pointer" }}>CHOOSE SQUAD</button>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: "auto", borderRadius: 18, background: "linear-gradient(135deg, rgba(255,216,77,.1), rgba(255,255,255,.02))", border: "1px solid rgba(255,216,77,.28)", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2.2px", color: "rgba(220,230,245,.5)" }}>YOUR POINTS</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 42, lineHeight: 1.05, color: "#FFD84D", textShadow: "0 0 24px rgba(255,216,77,.35)" }}>{vm.dispPts}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: "rgba(220,230,245,.6)", background: "rgba(255,255,255,.06)", borderRadius: 999, padding: "4px 10px" }}>{vm.rankChip}</div>
          <button onClick={() => { vm.goHome(); vm.navRanks(); }} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.13)", borderRadius: 10, padding: "8px 13px", fontFamily: "Barlow,sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", color: "#DCE6F5", cursor: "pointer" }}>GLOBAL {vm.globalRank} →</button>
        </div>
      </div>
      </div>
    </div>
  );
}
