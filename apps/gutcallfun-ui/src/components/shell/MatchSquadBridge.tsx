"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useCurrentUser, useLeaderboard, useSquad } from "@/services/api/hooks";
import { squadToMatchPanel } from "@/services/adapters/squads";
import { getRealData, setRealData, subscribeRealData } from "@/state/realData";

// Builds the in-match "your squad" duel panel from the squad the user picked
// (SquadModal writes matchSquadId to the store). Fetches that squad plus the
// GAME-SCOPED squad leaderboard and injects the panel view-model; clears it
// when nothing is picked.
//
// Rows come from GET /leaderboard?game_id&squad_id, not /squads/:id/participants.
// Participant rows carry each member's points across the squad's whole history,
// so this "duel" panel used to rank teammates by matches nobody was watching — a
// squadmate who did nothing tonight could sit at #1 all match. game_id scopes it
// to tonight's race; squad_id excludes members who joined this same game solo or
// for a different squad (the backend derives both from user_game.squad_id).
export function MatchSquadBridge() {
  const matchSquadId = useSyncExternalStore(
    subscribeRealData,
    () => getRealData().matchSquadId ?? null,
    () => null,
  );
  const liveGameId = useSyncExternalStore(
    subscribeRealData,
    () => getRealData().liveGameId ?? null,
    () => null,
  );

  const me = useCurrentUser();
  const squad = useSquad(matchSquadId);

  // Both ids are required. Querying with only squad_id would return the squad's
  // LIFETIME board, silently reintroducing the bug this replaced — so when
  // there is no live game the panel gets no rows rather than the wrong ones.
  const scoped = matchSquadId != null && liveGameId != null;
  const board = useLeaderboard(
    scoped ? { game_id: liveGameId, squad_id: matchSquadId, limit: 50 } : undefined,
    // Gated: an unscoped call here would fetch the global board — a second,
    // pointless request whose rows are lifetime totals, not this match's.
    { enabled: scoped },
  );

  useEffect(() => {
    if (!matchSquadId || !squad.data) {
      setRealData({ matchSquadPanel: null });
      return;
    }
    // Derived inside the effect: a `rows` array computed during render is a new
    // reference every pass and would re-trigger this effect forever as a dep.
    const rows = scoped ? (board.data?.items ?? []) : [];
    setRealData({
      matchSquadPanel: squadToMatchPanel(squad.data, rows, me.data?.id),
    });
  }, [matchSquadId, squad.data, board.data, me.data, scoped]);

  return null;
}
