"use client";

import { createContext, useContext } from "react";
import type { ViewModel } from "./types";

// Navigation/sync actions that route pages call in effects to keep the engine
// state consistent with the URL (deep-links, back button).
export interface AppActions {
  setNav: (tab: "matches" | "ranks" | "squad" | "profile" | "rewards") => void;
  enterLive: () => void;
  goPost: () => void;
  goHome: () => void;
  restart: () => void;
  openSquadDetail: (i: number) => void;
  openSquadRoute: (i: number) => void;
  backSquadList: () => void;
  connectWallet: () => void;
  saveUsername: () => void;
}

export const AppContext = createContext<ViewModel | null>(null);
export const AppActionsContext = createContext<AppActions | null>(null);

export function useApp(): ViewModel {
  const vm = useContext(AppContext);
  if (!vm) throw new Error("useApp must be used within <AppProvider>");
  return vm;
}

export function useAppActions(): AppActions {
  const a = useContext(AppActionsContext);
  if (!a) throw new Error("useAppActions must be used within <AppProvider>");
  return a;
}
