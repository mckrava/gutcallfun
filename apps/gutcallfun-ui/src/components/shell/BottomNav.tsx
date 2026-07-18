"use client";

import { useApp } from "@/state/context";

// Ported verbatim from the bottom nav bar inside the "App shell".
export function BottomNav() {
  const vm = useApp();
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 76, background: "rgba(8,12,20,.92)", borderTop: "1px solid rgba(255,255,255,.09)", backdropFilter: "blur(12px)", display: "flex", alignItems: "stretch", padding: "8px 8px 14px", zIndex: 30 }}>
      <button onClick={vm.navRanks} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: vm.cRanks, opacity: vm.oRanks }}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v4a6 6 0 0 1-12 0z" /><path d="M6 6H3.5a2.5 2.5 0 0 0 3 3.5" /><path d="M18 6h2.5a2.5 2.5 0 0 1-3 3.5" /><line x1="12" y1="14" x2="12" y2="17" /><line x1="8.5" y1="20" x2="15.5" y2="20" /></svg>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 10, letterSpacing: "0.8px" }}>RANKS</span>
      </button>
      <button onClick={vm.navSquadTab} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: vm.cSquad, opacity: vm.oSquad }}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6a3 3 0 0 1 0 6" /><path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5" /></svg>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 10, letterSpacing: "0.8px" }}>SQUAD</span>
      </button>
      <button onClick={vm.navMatches} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: vm.cMatches, opacity: vm.oMatches, position: "relative" }}>
        <div style={{ position: "absolute", top: -26, width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#FFD84D,#FFB300)", boxShadow: "0 6px 20px rgba(255,200,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1C2333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><line x1="12" y1="5" x2="12" y2="19" /><circle cx="12" cy="12" r="2.4" fill="#1C2333" /></svg>
        </div>
        <div style={{ width: 22, height: 22 }} />
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 10, letterSpacing: "0.8px" }}>MATCHES</span>
      </button>
      <button onClick={vm.navRewards} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: vm.cRewards, opacity: vm.oRewards }}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M4 12h16" /><path d="M12 8v12" /><path d="M12 8S9.5 4 7.5 4.5 8 8 12 8z" /><path d="M12 8s2.5-4 4.5-3.5S16 8 12 8z" /></svg>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 10, letterSpacing: "0.8px" }}>REWARDS</span>
      </button>
      <button onClick={vm.navProfile} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: vm.cProfile, opacity: vm.oProfile }}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" /></svg>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 10, letterSpacing: "0.8px" }}>PROFILE</span>
      </button>
    </div>
  );
}
