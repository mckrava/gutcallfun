"use client";

import { useApp } from "@/state/context";
import { Fragment } from "react";
import SolanaWhite from "@/icons/SolanaWhite.svg";

// Ported verbatim from the "Profile" screen in the old template.
export function ProfileScreen() {
  const vm = useApp();
  return (
    <div data-screen-label="Profile" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "24px 24px 92px", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
        <div style={{ width: 66, height: 66, borderRadius: "50%", background: "#0D1626", boxShadow: "0 0 0 2.5px #FFD84D, 0 0 22px rgba(255,216,77,.28)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>🦊</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: ".3px", lineHeight: 1 }}>@gutcaller</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, alignSelf: "flex-start", background: "rgba(153,69,255,.14)", border: "1px solid rgba(153,69,255,.4)", borderRadius: 999, padding: "4px 10px" }}>
            <img src={SolanaWhite.src} alt="" style={{ height: 10, display: "block" }} />
            <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11, color: "#CDBBFF", letterSpacing: ".3px" }}>7Xn9…4pQr</span>
          </div>
        </div>
        <button onClick={vm.logout} style={{ flexShrink: 0, alignSelf: "center", background: "rgba(255,77,94,.1)", border: "1px solid rgba(255,77,94,.32)", color: "#FF6B78", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 12, letterSpacing: ".8px", borderRadius: 10, padding: "7px 11px", cursor: "pointer" }}>LOG OUT</button>
      </div>

      <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ borderRadius: 14, padding: "14px 15px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)" }}><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 26, color: "#FFD84D" }}>7</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: "rgba(220,230,245,.45)", marginTop: 2 }}>MATCHES</div></div>
        <div style={{ borderRadius: 14, padding: "14px 15px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)" }}><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 26, color: "#3DDC84" }}>640</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: "rgba(220,230,245,.45)", marginTop: 2 }}>TOTAL POINTS</div></div>
        <div style={{ borderRadius: 14, padding: "14px 15px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)" }}><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 26, color: "#7FB8E8" }}>4🔥</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: "rgba(220,230,245,.45)", marginTop: 2 }}>BEST STREAK</div></div>
        <div style={{ borderRadius: 14, padding: "14px 15px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)" }}><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 26, color: "#FF8A3D" }}>58%</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: "rgba(220,230,245,.45)", marginTop: 2 }}>CALLS LANDED</div></div>
      </div>

      <div style={{ marginTop: 22, fontSize: "10.5px", fontWeight: 700, letterSpacing: "2.5px", color: "rgba(220,230,245,.45)" }}>RECENT MATCHES</div>
      <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 8 }}>
        {vm.recentMatches.map((m, i) => (
          <Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, borderRadius: 13, padding: "11px 13px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{m.hEl}<div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, letterSpacing: ".5px" }}>{m.score}</div>{m.aEl}</div>
              <div style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: "1.2px", color: "rgba(220,230,245,.4)" }}>{m.comp}</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, color: "#3DDC84", background: "rgba(61,220,132,.12)", border: "1px solid rgba(61,220,132,.3)", borderRadius: 8, padding: "2px 9px" }}>{m.pts}</div>
            </div>
          </Fragment>
        ))}
      </div>

      <div style={{ marginTop: 22, fontSize: "10.5px", fontWeight: 700, letterSpacing: "2.5px", color: "rgba(220,230,245,.45)" }}>SETTINGS</div>
      <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={vm.demoToast} style={{ textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 13, padding: "14px 15px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)", cursor: "pointer", color: "#F2F6FC" }}><span style={{ fontSize: 14, fontWeight: 600, fontFamily: "Barlow,sans-serif" }}>Notifications</span><span style={{ color: "rgba(220,230,245,.4)" }}>›</span></button>
        <button onClick={vm.demoToast} style={{ textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 13, padding: "14px 15px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)", cursor: "pointer", color: "#F2F6FC" }}><span style={{ fontSize: 14, fontWeight: 600, fontFamily: "Barlow,sans-serif" }}>Wallet &amp; security</span><span style={{ color: "rgba(220,230,245,.4)" }}>›</span></button>
        <button onClick={vm.demoToast} style={{ textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 13, padding: "14px 15px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)", cursor: "pointer", color: "#F2F6FC" }}><span style={{ fontSize: 14, fontWeight: 600, fontFamily: "Barlow,sans-serif" }}>Help &amp; feedback</span><span style={{ color: "rgba(220,230,245,.4)" }}>›</span></button>
      </div>
    </div>
  );
}
