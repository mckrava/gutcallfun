"use client";

import { useApp } from "@/state/context";
import { Fragment } from "react";
import arrow from "@/icons/arrow.svg";

export function MatchesScreen() {
  const vm = useApp();
  return (
    <div data-screen-label="Matches" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "24px 24px 92px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, lineHeight: 1, color: "#F2F6FC" }}>GC</div>
          <svg viewBox="0 0 40 12" width="34" height="10" style={{ display: "block" }}><polyline points="2,6 12,6 16,2 20,10 24,6 30,6 33,4 38,6" fill="none" stroke="#FFD84D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div style={{ width: 1, height: 38, background: "rgba(255,255,255,.12)" }}></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 26, letterSpacing: "1px", lineHeight: 1 }}>GUT<span style={{ color: "#FFD84D" }}>CALL</span></div>
          <div style={{ font: "700 8px/1 Barlow,sans-serif", letterSpacing: "2px", color: "rgba(220,230,245,.5)" }}>LIVE FOOTBALL · <span style={{ color: "#FFD84D" }}>PREDICT FOR FUN</span></div>
        </div>
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 22, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <button onClick={vm.tabUpcoming} style={{ border: "none", background: "none", padding: "0 0 11px", cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: "1.2px", color: vm.upCol, borderBottom: `2px solid ${vm.upBar}`, marginBottom: "-1px" }}>UPCOMING</button>
        <button onClick={vm.tabPast} style={{ border: "none", background: "none", padding: "0 0 11px", cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: "1.2px", color: vm.pastCol, borderBottom: `2px solid ${vm.pastBar}`, marginBottom: "-1px" }}>PAST</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", margin: "16px -6px 0", padding: "2px 6px 8px", display: "flex", flexDirection: "column", gap: 20 }}>

      {vm.isUpcoming && (<>
        {vm.hasLiveGame && vm.liveHero && (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#FF4D5E", animation: "kfDot 1.1s ease-in-out infinite" }}></div>
            <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "2.5px", color: "#FF6B78" }}>LIVE NOW</div>
          </div>
          <button onClick={vm.liveHero.onEnter} style={{ width: "100%", display: "block", textAlign: "left", border: "none", cursor: "pointer", borderRadius: 22, padding: 0, background: "none", color: "#F2F6FC" }}>
          <div style={{ borderRadius: 22, background: "linear-gradient(165deg,#182642 0%,#0A1120 100%)", border: "1px solid rgba(255,216,77,.35)", padding: 18, boxShadow: "0 14px 44px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "-40%", right: "-20%", width: 220, height: 220, background: "radial-gradient(circle, rgba(255,216,77,.13), transparent 68%)", pointerEvents: "none" }}></div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, position: "relative" }}>
              <div style={{ fontSize: 14, lineHeight: 1 }}>🏆</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 14, letterSpacing: "1px", color: "#F2F6FC" }}>{vm.liveHero.comp}</div>
              {vm.liveHero.stage && (<>
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(220,230,245,.3)" }}></div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 12, letterSpacing: "1px", color: "#FFD84D", background: "rgba(255,216,77,.12)", border: "1px solid rgba(255,216,77,.35)", borderRadius: 6, padding: "2px 9px" }}>{vm.liveHero.stage}</div>
              </>)}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "20px 4px 18px", position: "relative" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 104 }}>
                <div style={{ width: 58, height: 58, borderRadius: "50%", boxShadow: `0 0 0 2.5px ${vm.liveHero.team1Col}, 0 0 22px rgba(255,216,77,.3)` }}>
                  {vm.liveHero.team1Flag}
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 18, letterSpacing: ".5px", color: vm.liveHero.team1Col }}>{vm.liveHero.team1Name}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 42, lineHeight: ".9", letterSpacing: "1px" }}>{vm.liveHero.score}</div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "1.5px", color: "rgba(220,230,245,.4)" }}>SCORE</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 104 }}>
                <div style={{ width: 58, height: 58, borderRadius: "50%", boxShadow: `0 0 0 2.5px ${vm.liveHero.team2Col}, 0 0 22px rgba(127,184,232,.3)` }}>
                  {vm.liveHero.team2Flag}
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 18, letterSpacing: ".5px", color: vm.liveHero.team2Col }}>{vm.liveHero.team2Name}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 14, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex" }}>
                  {vm.liveHero.whoInAvatars.map((a, i) => (
                    <div key={i} style={{ width: 26, height: 26, borderRadius: "50%", background: "#0D1626", border: `2px solid ${a.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, marginLeft: i === 0 ? 0 : "-6px", boxShadow: "0 0 0 2.5px #101a2e" }}>{a.emoji}</div>
                  ))}
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: ".3px", color: "rgba(220,230,245,.6)" }}>{vm.liveHero.whoInText}</div>
              </div>
              <div className="enter-btn" style={{ display: "flex", alignItems: "center", background: "linear-gradient(135deg,#FFD84D,#FFB300)", borderRadius: 9, padding: "8px 14px" }}><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 14, letterSpacing: ".5px", color: "#221A00", display: "inline-flex", alignItems: "center", gap: 5 }}>ENTER<img src={arrow.src} alt="" style={{ height: 13, display: "block" }} /></div></div>
            </div>
          </div>
          </button>
        </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "2.5px", color: "rgba(220,230,245,.45)" }}>COMING UP</div>
          {vm.laterMatches.map((m, i) => (<Fragment key={i}>
            <button onClick={m.onClick} style={{ width: "100%", display: "block", textAlign: "left", cursor: "pointer", borderRadius: 16, padding: 0, border: "none", background: "none", color: "#F2F6FC" }}>
            <div style={{ borderRadius: 16, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)", padding: "14px 15px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.4px", color: m.accent }}>{m.comp}</div>
                <div style={{ fontSize: "10.5px", fontWeight: 600, color: "rgba(220,230,245,.5)" }}>{m.when}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {m.hFlagEl}
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, letterSpacing: ".5px" }}>{m.hn}</div>
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 600, fontSize: 14, color: "rgba(220,230,245,.3)" }}>VS</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, letterSpacing: ".5px" }}>{m.an}</div>
                  {m.aFlagEl}
                </div>
              </div>
            </div>
            </button>
          </Fragment>))}
        </div>
      </>)}

      {vm.isPast && (<>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "2.5px", color: "rgba(220,230,245,.45)" }}>YOUR RESULTS</div>
          {vm.pastMatches.map((m, i) => (<Fragment key={i}>
            <button onClick={m.onClick} style={{ width: "100%", display: "block", textAlign: "left", cursor: "pointer", borderRadius: 16, padding: 0, border: "none", background: "none", color: "#F2F6FC" }}>
            <div style={{ borderRadius: 16, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)", padding: "14px 15px", display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.4px", color: m.accent }}>{m.comp}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, width: 112 }}>
                  {m.hFlagEl}
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".3px" }}>{m.hn}</div>
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 24, letterSpacing: "1px" }}>{m.score}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9, width: 112, justifyContent: "flex-end" }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".3px", textAlign: "right" }}>{m.an}</div>
                  {m.aFlagEl}
                </div>
              </div>
              {m.myPts && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 11 }}>
                <div style={{ fontSize: "10.5px", color: "rgba(220,230,245,.45)" }}>You earned this match</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, color: "#3DDC84", background: "rgba(61,220,132,.12)", border: "1px solid rgba(61,220,132,.3)", borderRadius: 8, padding: "2px 11px" }}>{m.myPts}</div>
              </div>
              )}
            </div>
            </button>
          </Fragment>))}
        </div>
      </>)}

      </div>
    </div>
  );
}
