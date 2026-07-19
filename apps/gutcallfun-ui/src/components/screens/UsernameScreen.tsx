"use client";

import { useApp } from "@/state/context";
import arrow from "@/icons/arrow.svg";
import SolanaWhite from "@/icons/SolanaWhite.svg";

// Ported verbatim from the "Choose username" screen (isUsername block).
export function UsernameScreen() {
  const vm = useApp();
  return (
    <div
      data-screen-label="Choose username"
      style={{ position: "absolute", inset: 0, zIndex: 60, background: "radial-gradient(130% 70% at 50% -6%, #14213C 0%, #0A101D 46%, #060A12 100%)", display: "flex", flexDirection: "column", padding: "24px 30px 40px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, alignSelf: "center", background: "rgba(153,69,255,.14)", border: "1px solid rgba(153,69,255,.4)", borderRadius: 999, padding: "5px 12px" }}>
        <img src={SolanaWhite.src} alt="" style={{ height: 10, display: "block" }} />
        <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11, color: "#CDBBFF" }}>7Xn9…4pQr connected</span>
      </div>
      <div style={{ marginTop: 34, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 32, letterSpacing: "0.5px" }}>CHOOSE YOUR USERNAME</div>
      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: "rgba(220,230,245,.55)" }}>This is how your squad and the leaderboards will see you. You can change it later.</div>
      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 8, height: 56, borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", padding: "0 16px" }}>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 22, color: "rgba(220,230,245,.4)" }}>@</span>
        <input
          value={vm.onbUser}
          onChange={vm.setOnb}
          placeholder="username"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#F2F6FC", fontFamily: "Barlow,sans-serif", fontSize: 17 }}
        />
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={vm.saveUsername}
        style={{ width: "100%", height: 56, borderRadius: 15, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 17, letterSpacing: "0.8px", cursor: "pointer", boxShadow: "0 10px 30px rgba(255,200,0,.28)", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
      >
        ENTER GUTCALL<img src={arrow.src} alt="" style={{ height: 16, display: "block" }} />
      </button>
    </div>
  );
}
