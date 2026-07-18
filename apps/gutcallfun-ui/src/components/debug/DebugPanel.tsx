"use client";

/* =========================================================================
 * TEMPORARY DEBUG PANEL — for manually triggering match events while testing.
 * TO REMOVE: delete this file (src/components/debug/) and remove the two
 * <DebugPanel/> lines in src/components/shell/AppFrame.tsx.
 * ========================================================================= */

import type { CSSProperties } from "react";
import { useApp } from "@/state/context";

const wrap: CSSProperties = {
  position: "fixed",
  right: 6,
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 99999,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 8,
  borderRadius: 12,
  background: "rgba(20,6,26,.82)",
  border: "1px dashed #FF3DD0",
  backdropFilter: "blur(4px)",
};

const label: CSSProperties = {
  fontFamily: "'Barlow Condensed',sans-serif",
  fontStyle: "italic",
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: "1.5px",
  color: "#FF7BE0",
  textAlign: "center",
};

const btn: CSSProperties = {
  cursor: "pointer",
  border: "1px solid rgba(255,61,208,.5)",
  background: "rgba(255,61,208,.12)",
  color: "#FFD8F4",
  borderRadius: 8,
  padding: "6px 9px",
  fontFamily: "Barlow,sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".3px",
  whiteSpace: "nowrap",
};

export function DebugPanel() {
  const vm = useApp();
  return (
    <div style={wrap}>
      <div style={label}>DEBUG</div>
      <button style={btn} onClick={vm.next}>▶ Next moment</button>
      <button style={btn} onClick={vm.demoWindow}>❓ Prediction</button>
      <button style={btn} onClick={vm.demoGoal}>⚽ Goal anim</button>
      <button style={btn} onClick={vm.toggleAuto}>⏯ Auto-play</button>
      <button style={btn} onClick={vm.restart}>↻ Restart</button>
    </div>
  );
}
