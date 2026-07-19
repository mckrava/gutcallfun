"use client";

import { useCurrentUser, useMyScoreProfile } from "@/services/api/hooks";

export function RewardsScreen() {
  const me = useCurrentUser();
  const profile = useMyScoreProfile({ enabled: !!me.data });
  const points = profile.data?.total_points ?? 0;
  return (
    <div
      data-screen-label="Rewards"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "24px 24px 92px" }}
    >
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, letterSpacing: ".5px" }}>REWARDS</div>
      <div style={{ marginTop: 4, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>Turn your calls into perks.</div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 16, paddingBottom: 20 }}>
        <div style={{ width: 88, height: 88, borderRadius: 24, background: "linear-gradient(135deg,rgba(153,69,255,.25),rgba(20,241,149,.18))", border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, boxShadow: "0 14px 40px rgba(0,0,0,.4)" }}>🎁</div>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 26, letterSpacing: ".5px" }}>COMING SOON</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(220,230,245,.55)", maxWidth: 250 }}>Redeem your GC points for boosts, custom squad kits and match-ticket raffles. Keep calling — your points are already stacking up.</div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,216,77,.12)", border: "1px solid rgba(255,216,77,.35)", borderRadius: 999, padding: "7px 14px" }}><span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 14, color: "#FFD84D" }}>{points}</span><span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,216,77,.7)" }}>points banked</span></div>
      </div>
    </div>
  );
}
