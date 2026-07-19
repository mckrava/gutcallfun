"use client";

import { useApp } from "@/state/context";

// Compact "you called it" win — shown when the caller's own answer resolves
// correct. Deliberately NOT full-screen (that is GoalSlam): a floating card
// anchored in the upper third, with no page-wide dim, so the live screen stays
// readable underneath. Auto-dismisses (LiveMatchBridge timer); tap to close
// early. Styled like a slot-machine payout — gold burst, big +points, a shine
// sweep and a pulsing ring.
export function WinToast() {
  const vm = useApp();
  if (!vm.winToastOn) return null;
  return (
    <div
      onClick={vm.dismissWinToast}
      style={{
        position: "absolute",
        top: "18%",
        left: 0,
        right: 0,
        zIndex: 43,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          width: "min(300px, 82%)",
          padding: "16px 20px 18px",
          borderRadius: 20,
          background:
            "radial-gradient(120% 120% at 50% 0%, rgba(255,216,77,.22), rgba(13,18,30,.96) 62%)",
          border: "1px solid rgba(255,216,77,.55)",
          boxShadow:
            "0 18px 44px rgba(0,0,0,.5), 0 0 28px rgba(255,200,0,.28), inset 0 1px 0 rgba(255,255,255,.14)",
          textAlign: "center",
          animation: "kfPop .5s cubic-bezier(.2,1.3,.4,1) both",
        }}
      >
        {/* Shine sweep across the card. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(115deg, transparent 30%, rgba(255,255,255,.16) 48%, transparent 66%)",
            transform: "translateX(-100%)",
            animation: "kfShine 1.1s .18s ease-out both",
            pointerEvents: "none",
          }}
        />

        {/* Burst glyph inside a pulsing ring. */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "radial-gradient(circle at 50% 40%, rgba(255,216,77,.35), rgba(255,216,77,.06) 70%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              animation: "kfEnter 1.4s ease-out infinite, kfFloat 2.4s ease-in-out infinite",
            }}
          >
            {vm.winToastEmoji}
          </div>
        </div>

        <div
          style={{
            fontFamily: "'Barlow Condensed',sans-serif",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "1.6px",
            color: "#FFE99A",
            textShadow: "0 0 16px rgba(255,216,77,.5)",
            animation: "kfRise .45s .1s both",
          }}
        >
          {vm.winToastHeadline}
        </div>

        <div
          style={{
            marginTop: 2,
            fontFamily: "'Barlow Condensed',sans-serif",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 52,
            lineHeight: 1,
            letterSpacing: "1px",
            color: "#FFD84D",
            textShadow: "0 0 30px rgba(255,216,77,.6), 0 4px 0 rgba(0,0,0,.28)",
            animation: "kfSlam .55s .06s cubic-bezier(.2,1.3,.4,1) both",
          }}
        >
          {vm.winToastPoints}
        </div>
        <div
          style={{
            marginTop: 1,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "2.4px",
            color: "rgba(220,230,245,.55)",
            animation: "kfRise .45s .2s both",
          }}
        >
          POINTS
        </div>

        <div
          style={{
            marginTop: 11,
            display: "inline-block",
            fontFamily: "'Barlow Condensed',sans-serif",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "1.4px",
            color: "#0E1220",
            background: "linear-gradient(135deg,#FFD84D,#FFB300)",
            borderRadius: 999,
            padding: "5px 14px",
            boxShadow: "0 4px 14px rgba(255,200,0,.3)",
            animation: "kfRise .45s .28s both",
          }}
        >
          YOU CALLED {vm.winToastOutcome}
        </div>
      </div>
    </div>
  );
}
