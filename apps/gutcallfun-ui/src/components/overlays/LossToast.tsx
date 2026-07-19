"use client";

import { useApp } from "@/state/context";

// Wrong-answer notice — the restrained counterpart to WinToast. A small
// HORIZONTAL card, muted red/slate, no page-wide dim and no big points: it reads
// as a quick "not this time" notice, not a celebration. Anchored low — just
// above the "YOUR POINTS" footer card (pinned to the screen bottom), so the miss
// sits next to the points it didn't move. Auto-dismisses (LiveMatchBridge timer,
// shorter than the win); tap to close.
export function LossToast() {
  const vm = useApp();
  if (!vm.lossToastOn) return null;
  return (
    <div
      onClick={vm.dismissLossToast}
      style={{
        position: "absolute",
        bottom: 138,
        left: 0,
        right: 0,
        zIndex: 42,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "min(300px, 82%)",
          padding: "12px 16px",
          borderRadius: 16,
          background:
            "radial-gradient(120% 120% at 50% 0%, rgba(255,77,94,.13), rgba(13,18,30,.96) 66%)",
          border: "1px solid rgba(255,120,130,.34)",
          boxShadow: "0 14px 34px rgba(0,0,0,.45)",
          animation: "kfRise .32s ease-out both",
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: "50%",
            background: "rgba(255,77,94,.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 21,
          }}
        >
          {vm.lossToastEmoji}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Barlow Condensed',sans-serif",
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "1px",
              color: "#FFB3BA",
              lineHeight: 1,
            }}
          >
            {vm.lossToastHeadline}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "1.6px",
              color: "rgba(220,230,245,.55)",
            }}
          >
            {vm.lossToastOutcome}
          </div>
        </div>
      </div>
    </div>
  );
}
