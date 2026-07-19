"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGameParticipants, useGames, useJoinGame, useLeaderboard } from "@/services/api/hooks";
import { queryKeys } from "@/services/api/queryKeys";
import { useAppActions } from "@/state/context";
import { adaptGames } from "@/services/adapters/matches";
import { leaderboardToRankRows } from "@/services/adapters/rankings";
import { setRealData } from "@/state/realData";

// Fetches read-only backend data via react-query and pushes adapted view-model
// rows into the real-data store, which MatchController reads in renderVals().
// Renders nothing — a pure data conduit; all shape-mapping lives in adapters.
export function RealDataBridge() {
  const { enterLive } = useAppActions();
  const qc = useQueryClient();
  const games = useGames({ limit: 100 });
  const leaderboard = useLeaderboard({ limit: 50 });

  const liveGame = games.data?.items.find((g) => g.status === "live") ?? null;
  const joinGame = useJoinGame(liveGame?.id ?? -1);
  const participants = useGameParticipants(liveGame?.id ?? null);

  useEffect(() => {
    if (!games.data) return;
    // All three match sections + the live hero's "who's in" strip.
    const { laterMatches, pastMatches, liveHero } = adaptGames(games.data.items, {
      liveParticipants: participants.data?.items ?? [],
      onEnterLive: (game) => {
        // Entering a live game joins it, so the caller shows up in "who's in".
        joinGame.mutate(
          {},
          { onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.games.participants(game.id) }) },
        );
        enterLive();
      },
    });
    setRealData({ laterMatches, pastMatches, liveHero });
  }, [games.data, participants.data, enterLive, joinGame, qc]);

  useEffect(() => {
    if (!leaderboard.data) return;
    const { rankTop3, rankAround } = leaderboardToRankRows(leaderboard.data.items);
    setRealData({ rankTop3, rankAround });
  }, [leaderboard.data]);

  return null;
}
