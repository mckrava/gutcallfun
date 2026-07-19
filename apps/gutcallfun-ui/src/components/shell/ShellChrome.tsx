"use client";

import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

// The "App shell" from the old template: a flex column holding the active tab
// screen (each screen is flex:1 with its own padding) and the pinned bottom nav.
export function ShellChrome({ children }: { children: ReactNode }) {
  return (
    <div data-screen-label="App shell" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {children}
      <BottomNav />
    </div>
  );
}
