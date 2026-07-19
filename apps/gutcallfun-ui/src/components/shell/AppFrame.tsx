"use client";

import type { ReactNode } from "react";
import { useApp } from "@/state/context";
import { Overlays } from "@/components/overlays/Overlays";

// Reproduces the original two-level root: the centered 440px mobile column
// (from the old page.tsx <main>) wrapping the "GutCall app" root div, which
// carries the shake animation, gradient, base color and font. Screen content
// and the floating overlays render inside it.
export function AppFrame({ children }: { children: ReactNode }) {
  const vm = useApp();
  return (
    <main
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 440,
        margin: "0 auto",
        minHeight: "100dvh",
        height: "100dvh",
        overflow: "hidden",
        background: "radial-gradient(130% 70% at 50% -8%, #14213C 0%, #0A101D 46%, #060A12 100%)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "radial-gradient(130% 70% at 50% -8%, #14213C 0%, #0A101D 46%, #060A12 100%)",
          color: "#F2F6FC",
          fontFamily: "Barlow,system-ui,sans-serif",
          animation: vm.appAnim,
        }}
      >
        {children}
        <Overlays />
      </div>
    </main>
  );
}
