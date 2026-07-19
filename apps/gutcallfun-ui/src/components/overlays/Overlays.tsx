"use client";

import { usePathname } from "next/navigation";
import { BettingWindow } from "./BettingWindow";
import { SquadModal } from "./SquadModal";
import { GoalFlash } from "./GoalFlash";
import { GoalSlam } from "./GoalSlam";
import { WinToast } from "./WinToast";
import { LossToast } from "./LossToast";
import { ReactionBubbles } from "./ReactionBubbles";
import { Toast } from "./Toast";

// The match-details route. Its screen sets the engine `screen` to "live", but we
// deliberately gate on the PATHNAME, not that engine state: `setNav` (a bottom-nav
// tab tap) changes the tab without clearing `screen`, so `s.screen === "live"`
// can linger true after the user has left the match — which leaked the goal /
// window / win overlays onto other screens. The pathname is exactly what is on
// screen and cannot desync from it.
const MATCH_DETAILS_ROUTE = "/live";

// Dispatcher for all state-driven overlays. Each self-gates on its flag (renders
// null when off). The Resolution popup and the Leaderboard modal were removed.
export function Overlays() {
  const onMatchDetails = usePathname() === MATCH_DETAILS_ROUTE;
  return (
    <>
      {/* Match-event overlays — the prediction window and the goal / win
          celebrations belong to the live match-details screen only. Off it
          (Squads, Rankings, Profile, sign-in…) a WS question / goal / win must
          not pop over an unrelated screen. The WS bridge keeps writing their
          data in the background; it just isn't rendered until the user is back
          on the match. */}
      {onMatchDetails && (
        <>
          <BettingWindow />
          <GoalFlash />
          <GoalSlam />
          <WinToast />
          <LossToast />
          <ReactionBubbles />
        </>
      )}
      {/* Screen-agnostic: the squad picker is a user-opened modal and the toast
          is a generic notice — both may show on any screen. */}
      <SquadModal />
      <Toast />
    </>
  );
}
