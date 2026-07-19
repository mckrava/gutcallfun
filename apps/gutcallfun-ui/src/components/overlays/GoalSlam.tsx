"use client";

import { useApp } from "@/state/context";

// Ported verbatim from the slamOn overlay.
export function GoalSlam() {
  const vm = useApp();
  if (!vm.slamOn) return null;
  return (
    <div onClick={vm.dismissGoal} style={{ position: "absolute", inset: 0, zIndex: 41, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: vm.goalBg, cursor: "pointer" }}>
      <div style={{ animation: "kfSlam .55s cubic-bezier(.2,1.3,.4,1) both" }}>{vm.goalFlagEl}</div>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 84, lineHeight: ".85", letterSpacing: "3px", color: vm.slamColor, textShadow: `0 0 40px ${vm.slamGlow}, 0 6px 0 rgba(0,0,0,.25)`, animation: "kfSlam .55s .05s cubic-bezier(.2,1.3,.4,1) both" }}>{vm.slamWord}!</div>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "3px", color: "#F2F6FC", opacity: 0.9, animation: "kfRise .5s .22s both" }}>{vm.goalTeamName}</div>
      <div style={{ marginTop: 2, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 17, color: "rgba(220,230,245,.75)", animation: "kfRise .5s .3s both" }}>{vm.slamSub}</div>
      <div style={{ marginTop: 8, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 22, letterSpacing: "1.5px", color: "#F2F6FC", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: "7px 18px", animation: "kfRise .5s .38s both" }}>{vm.goalScore}</div>
      <div style={{ position: "absolute", bottom: 34, fontSize: 11, fontWeight: 600, letterSpacing: "1px", color: "rgba(220,230,245,.4)", animation: "kfRise .5s .5s both" }}>tap to continue</div>
    </div>
  );
}
