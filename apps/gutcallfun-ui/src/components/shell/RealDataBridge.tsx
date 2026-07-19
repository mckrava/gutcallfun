"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser, useGameParticipants, useGames, useJoinGame, useLeaderboard, useMyGameParticipation } from "@/services/api/hooks";
import { queryKeys } from "@/services/api/queryKeys";
import { useAppActions } from "@/state/context";
import { adaptGames } from "@/services/adapters/matches";
import { leaderboardToRankRows } from "@/services/adapters/rankings";
import { getRealData, setRealData, subscribeRealData } from "@/state/realData";

// Fetches read-only backend data via react-query and pushes adapted view-model
// rows into the real-data store, which MatchController reads in renderVals().
// Renders nothing — a pure data conduit; all shape-mapping lives in adapters.
export function RealDataBridge() {
  const { enterLive } = useAppActions();
  const qc = useQueryClient();
  const me = useCurrentUser();
  const games = useGames({ limit: 100 });
  const leaderboard = useLeaderboard({ limit: 50 });

  // The squad the user picked for this match (SquadModal writes it here).
  // Read from the store rather than passed down, for the same reason the panel
  // reads it: nothing above these bridges owns that selection.
  const matchSquadId = useSyncExternalStore(
    subscribeRealData,
    () => getRealData().matchSquadId ?? null,
    () => null,
  );

  const liveGame = games.data?.items.find((g) => g.status === "live") ?? null;
  const joinGame = useJoinGame(liveGame?.id ?? -1);
  const participants = useGameParticipants(liveGame?.id ?? null);
  // Kept in a ref so the join callback below stays current without making the
  // mutation's unstable identity an effect dependency. Assigned in an effect,
  // not during render — a render-phase ref write is unsafe under concurrent
  // rendering, where a render can be discarded.
  const joinGameRef = useRef(joinGame);
  useEffect(() => {
    joinGameRef.current = joinGame;
  });

  // Publish which game is live so MatchSquadBridge can scope its board to it.
  useEffect(() => {
    setRealData({ liveGameId: liveGame?.id ?? null });
  }, [liveGame?.id]);

  // Restore the squad pick from the server on load.
  //
  // matchSquadId lives in a module-level store that resets on every page load,
  // and nothing used to read user_game.squad_id back — so a refresh appeared to
  // lose a squad selection that was in fact persisted correctly. Only fills a
  // slot that is still empty, so a pick made during this session always wins
  // over a stale server read.
  const myParticipation = useMyGameParticipation(liveGame?.id ?? null, {
    enabled: !!me.data?.id,
  });
  const serverSquadId = myParticipation.data?.user_game?.squad_id ?? null;
  useEffect(() => {
    if (serverSquadId == null) return;
    if (getRealData().matchSquadId != null) return;
    setRealData({ matchSquadId: serverSquadId });
  }, [serverSquadId]);

  useEffect(() => {
    if (!games.data) return;
    // All three match sections + the live hero's "who's in" strip.
    const { laterMatches, pastMatches, liveHero } = adaptGames(games.data.items, {
      liveParticipants: participants.data?.items ?? [],
      onEnterLive: (game) => {
        // Entering a live game joins it, so the caller shows up in "who's in".
        //
        // squad_id is sent when one is already known: the backend records it on
        // user_game and every squad-scoped leaderboard derives from that column.
        // Omit the key entirely when no squad is picked — sending
        // squad_id: null would be rejected by the DTO validator, and an omitted
        // squad_id never clears an association the server already holds.
        // Picking a squad later re-joins and updates the row (see SquadModal).
        joinGameRef.current.mutate(
          matchSquadId != null ? { squad_id: matchSquadId } : {},
          { onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.games.participants(game.id) }) },
        );
        enterLive();
      },
    });
    setRealData({ laterMatches, pastMatches, liveHero });
    // `joinGame` is deliberately NOT a dependency: useMutation returns a new
    // object every render, so depending on it re-ran this effect on every
    // render, and each run wrote to the real-data store. Every write forces a
    // MatchController update, which re-runs its route sync — the write storm
    // behind the `_rsc` navigation storm. The ref keeps the callback current
    // without tying the effect to that identity.
  }, [games.data, participants.data, enterLive, qc, matchSquadId]);

  useEffect(() => {
    if (!leaderboard.data) return;
    // meId drives the "you" highlight. It was omitted here, so the caller's own
    // row rendered like everyone else's on the global board.
    const { rankTop3, rankAround } = leaderboardToRankRows(leaderboard.data.items, me.data?.id);
    // The caller's real global rank for the LiveScreen footer (was a mock
    // formula on the simulation's point total). null when the caller isn't on
    // the fetched slice, so renderVals falls back to the mock rather than "#".
    const myRank = leaderboard.data.items.find((e) => e.user_id === me.data?.id)?.rank;
    setRealData({ rankTop3, rankAround, liveGlobalRank: myRank != null ? `#${myRank}` : null });
  }, [leaderboard.data, me.data?.id]);

  return null;
}
