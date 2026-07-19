"use client";

import { useApp } from "@/state/context";

// Ported verbatim from the flashOn overlay.
export function GoalFlash() {
  const vm = useApp();
  if (!vm.flashOn) return null;
  return <div style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none", background: vm.flashBg, animation: "kfFlash .9s ease-out both" }} />;
}
