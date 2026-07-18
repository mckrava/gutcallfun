"use client";

import { useApp } from "@/state/context";
import { Fragment } from "react";

export function SquadsListScreen() {
  const vm = useApp();
  return (
    <div data-screen-label="Squads" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "24px 24px 100px" }}>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, letterSpacing: ".5px" }}>SQUADS</div>
      <div style={{ marginTop: 4, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>Watch together, climb together.</div>

      <div style={{ flex: 1, overflowY: "auto", margin: "18px -6px 0", padding: "2px 6px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {vm.squadCards.map((sq, i) => (
          <Fragment key={i}>
            <button onClick={sq.onClick} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13, borderRadius: 15, padding: "14px 15px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)", cursor: "pointer", color: "#F2F6FC" }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: "#0D1626", boxShadow: `0 0 0 2px ${sq.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{sq.emoji}</div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: ".3px" }}>{sq.name}</div>
                <div style={{ fontSize: "11.5px", color: "rgba(220,230,245,.45)" }}>{sq.count}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 18, color: "#FFD84D" }}>{sq.myRank}</div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: "rgba(220,230,245,.4)" }}>YOUR RANK</div>
              </div>
            </button>
          </Fragment>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={vm.openCreate} style={{ flex: 1, height: 50, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".8px", cursor: "pointer", boxShadow: "0 8px 24px rgba(255,200,0,.25)" }}>+ CREATE SQUAD</button>
        <button onClick={vm.openJoin} style={{ flex: 1, height: 50, borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", color: "#F2F6FC", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".8px", cursor: "pointer" }}>JOIN BY CODE</button>
      </div>
    </div>
  );
}
