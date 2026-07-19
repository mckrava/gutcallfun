"use client";

import { useApp } from "@/state/context";
import { Fragment } from "react";

export function RankingsScreen() {
  const vm = useApp();
  return (
    <div data-screen-label="Rankings" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "24px 24px 92px" }}>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, letterSpacing: ".5px" }}>RANKINGS</div>
      <div style={{ marginTop: 4, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>Where you stand across every match.</div>

      <div style={{ flex: 1, overflowY: "auto", margin: "18px -6px 0", padding: "2px 6px 8px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {vm.rankTop3.map((q, i) => (
            <Fragment key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 13, borderRadius: 15, padding: "12px 14px", background: q.medalBg, border: `1px solid ${q.medalBd}` }}>
                <div style={{ width: 44, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 34, lineHeight: ".8", color: q.numCol, textAlign: "center" }}>#{q.rank}</div>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#0D1626", boxShadow: `0 0 0 2px ${q.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{q.emoji}</div>
                <div style={{ flex: 1, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: ".3px" }}>{q.name}</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 19, color: q.numCol }}>{q.pts}</div><div style={{ fontSize: "7.5px", fontWeight: 700, letterSpacing: "1.2px", color: "rgba(220,230,245,.4)" }}>PTS</div></div>
              </div>
            </Fragment>
          ))}
        </div>

        {/* Only shown when there is anyone below the top 3. With a handful of
            registered users the board is 3 rows and this section is legitimately
            empty — rendering a bare divider over blank space reads as a broken
            or unfinished screen. */}
        {vm.rankAround.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "20px 2px 12px" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.08)" }}></div>
            <div style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "2px", color: "rgba(220,230,245,.4)" }}>AROUND YOU</div>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.08)" }}></div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {vm.rankAround.map((q, i) => (
            <Fragment key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 13, padding: "10px 13px", background: q.rowBg, border: `1px solid ${q.rowBd}` }}>
                <div style={{ width: 34, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, color: q.rankCol }}>{q.rank}</div>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#0D1626", boxShadow: `0 0 0 2px ${q.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{q.emoji}</div>
                <div style={{ flex: 1, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: ".3px", color: q.nameCol }}>{q.name}</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 17, color: q.ptsCol }}>{q.pts}</div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
