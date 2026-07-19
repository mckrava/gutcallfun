"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser, useGameParticipants, useGames, useJoinGame, useLeaderboard } from "@/services/api/hooks";
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

  // Publish which game is live so MatchSquadBridge can scope its board to it.
  useEffect(() => {
    setRealData({ liveGameId: liveGame?.id ?? null });
  }, [liveGame?.id]);

  useEffect(() => {
    if (!games.data) return;
    // All three match sections + the live hero's "who's in" strip.
    const { laterMatches, pastMatches, liveHero } = adaptGames(games.data.items, {
      liveParticipants: participants.data?.items ?? [],
      onEnterLive: (game) => {
        // Entering a live game joins it, so the caller shows up in "who's in".
        //
        // squad_id MUST be sent: the backend records it on user_game and every
        // squad-scoped leaderboard is derived from that column. Joining with
        // {} makes the user a solo participant permanently for this game — the
        // row is written once and join is idempotent, so a later squad pick
        // does NOT backfill it, and they simply never appear on their squad's
        // board for this match. Omit the key entirely when no squad is picked;
        // sending squad_id: null would be rejected by the DTO validator.
        joinGame.mutate(
          matchSquadId != null ? { squad_id: matchSquadId } : {},
          { onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.games.participants(game.id) }) },
        );
        enterLive();
      },
    });
    setRealData({ laterMatches, pastMatches, liveHero });
  }, [games.data, participants.data, enterLive, joinGame, qc, matchSquadId]);

  useEffect(() => {
    if (!leaderboard.data) return;
    // meId drives the "you" highlight. It was omitted here, so the caller's own
    // row rendered like everyone else's on the global board.
    const { rankTop3, rankAround } = leaderboardToRankRows(leaderboard.data.items, me.data?.id);
    setRealData({ rankTop3, rankAround });
  }, [leaderboard.data, me.data?.id]);

  return null;
}
