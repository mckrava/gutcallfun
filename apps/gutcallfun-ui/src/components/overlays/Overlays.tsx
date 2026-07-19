"use client";

import { BettingWindow } from "./BettingWindow";
import { SquadModal } from "./SquadModal";
import { GoalFlash } from "./GoalFlash";
import { GoalSlam } from "./GoalSlam";
import { Toast } from "./Toast";

// Dispatcher for all state-driven overlays. Each self-gates on its flag (renders
// null when off). The Resolution popup and the Leaderboard modal were removed.
export function Overlays() {
  return (
    <>
      <BettingWindow />
      <SquadModal />
      <GoalFlash />
      <GoalSlam />
      <Toast />
    </>
  );
}
