"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useCurrentUser, useSquad, useSquadParticipants } from "@/services/api/hooks";
import { squadToMatchPanel } from "@/services/adapters/squads";
import { getRealData, setRealData, subscribeRealData } from "@/state/realData";

// Builds the in-match "your squad" duel panel from the squad the user picked
// (SquadModal writes matchSquadId to the store). Fetches that squad + its real
// members and injects the panel view-model; clears it when nothing is picked.
export function MatchSquadBridge() {
  const matchSquadId = useSyncExternalStore(
    subscribeRealData,
    () => getRealData().matchSquadId ?? null,
    () => null,
  );
  const me = useCurrentUser();
  const squad = useSquad(matchSquadId);
  const participants = useSquadParticipants(matchSquadId);

  useEffect(() => {
    if (!matchSquadId || !squad.data) {
      setRealData({ matchSquadPanel: null });
      return;
    }
    setRealData({
      matchSquadPanel: squadToMatchPanel(squad.data, participants.data?.items ?? [], me.data?.id),
    });
  }, [matchSquadId, squad.data, participants.data, me.data]);

  return null;
}
