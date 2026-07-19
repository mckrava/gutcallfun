"use client";

import { useApp } from "@/state/context";
import { useRecapData } from "./useRecapData";
import { MatchEkg } from "@/components/common/MatchEkg";

// Real post-match recap — score / points / ranks / calls all from useRecapData.
export function PostScreen() {
  const vm = useApp();
  const r = useRecapData();
  return (
    <div
      data-screen-label="Post-match EKG"
      style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "24px 20px 40px", overflow: "auto" }}
    >
      <button onClick={vm.goHome} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", color: "rgba(220,230,245,.55)", fontFamily: "Barlow,sans-serif", fontSize: 13, fontWeight: 600, padding: "2px 0" }}>‹ Matches</button>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 64 }}>{r.brFlag}<div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 13, color: "#FFD84D" }}>{r.t1}</div></div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 44, lineHeight: 1, letterSpacing: 2 }}>{r.scoreBr} – {r.scoreAr}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 64 }}>{r.arFlag}<div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 13, color: "#7FB8E8" }}>{r.t2}</div></div>
      </div>

      <div style={{ marginTop: 16, borderRadius: 20, background: "linear-gradient(165deg,#131F38 0%,#0A1120 75%)", border: "1px solid rgba(255,255,255,.1)", padding: 16, boxShadow: "0 18px 50px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, lineHeight: 1, color: "#F2F6FC" }}>GC</div>
              <svg viewBox="0 0 40 12" width="18" height="5" style={{ display: "block" }}><polyline points="2,6 12,6 16,2 20,10 24,6 30,6 33,4 38,6" fill="none" stroke="#FFD84D" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, letterSpacing: "1.5px" }}>YOUR MATCH EKG</div>
          </div>
          <div style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: 1, color: "rgba(220,230,245,.4)" }}>{r.ftLine}</div>
        </div>
        <div style={{ margin: "12px 0 4px" }}><MatchEkg hist={r.ekgHist} t1={r.t1} t2={r.t2} /></div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "9.5px", color: "rgba(220,230,245,.5)" }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD84D" }} />Goals</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "9.5px", color: "rgba(220,230,245,.5)" }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: "#3DDC84" }} />Your calls landed</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "9.5px", color: "rgba(220,230,245,.5)" }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF4D5E" }} />Missed</div>
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "14px 0" }} />
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, color: "#FFD84D", lineHeight: 1 }}>{r.totalPts}</div>
            <div style={{ marginTop: 3, fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: "rgba(220,230,245,.45)" }}>POINTS</div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,.08)" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, lineHeight: 1 }}>{r.rankLine}</div>
            <div style={{ marginTop: 3, fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: "rgba(220,230,245,.45)" }}>IN {r.squadName}</div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,.08)" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, lineHeight: 1, color: "#7FB8E8" }}>{r.globalRank}</div>
            <div style={{ marginTop: 3, fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: "rgba(220,230,245,.45)" }}>GLOBAL</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 16 }} />
      <button onClick={vm.share} style={{ height: 52, borderRadius: 15, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 17, letterSpacing: "1.5px", cursor: "pointer", boxShadow: "0 10px 30px rgba(255,200,0,.28)", flexShrink: 0 }}>SHARE YOUR MATCH EKG</button>
    </div>
  );
}
