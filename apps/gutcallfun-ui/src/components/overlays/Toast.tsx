"use client";

import { useApp } from "@/state/context";

// Ported verbatim from the toastOn overlay.
export function Toast() {
  const vm = useApp();
  if (!vm.toastOn) return null;
  return (
    <div style={{ position: "absolute", bottom: 56, left: "50%", transform: "translateX(-50%)", zIndex: 50, background: "#1B2942", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "9px 18px", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap", animation: "kfRise .3s ease-out both", boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}>
      {vm.toastText}
    </div>
  );
}
