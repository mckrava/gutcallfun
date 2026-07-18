"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import MatchController from "./MatchController";

// Bridges the Next.js router into the (class-based) MatchController, which keeps
// all simulation state and mirrors it to the URL.
export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const navigate = useCallback((path: string) => router.push(path), [router]);

  return (
    <MatchController navigate={navigate} pathname={pathname}>
      {children}
    </MatchController>
  );
}
