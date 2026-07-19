"use client";

import { useSyncExternalStore } from "react";
import { useAnswers, useCurrentUser, useGames, useLeaderboard } from "@/services/api/hooks";
import { getRealData, subscribeRealData } from "@/state/realData";
import { CountryFlag } from "@/components/common/CountryFlag";
import type { HistEntry } from "@/state/types";

const code = (name: string | null | undefined) => (name ?? "").slice(0, 3).toUpperCase();

// The post-match recap for the game the user just watched (the current live
// game). All numbers are real: score, my match points, my rank in the squad I
// dueled, my global rank, and the EKG's call dots (my real answers).
export function useRecapData() {
  const me = useCurrentUser();
  const games = useGames({ limit: 100 });
  const game = games.data?.items.find((g) => g.status === "live")
    ?? games.data?.items.find((g) => g.status === "finished")
    ?? null;
  const answers = useAnswers(game ? { game_id: game.id, limit: 100 } : undefined);
  const leaderboard = useLeaderboard({ limit: 100 });
  const matchSquad = useSyncExternalStore(subscribeRealData, () => getRealData().matchSquadPanel ?? null, () => null);

  const t1 = code(game?.team1_name);
  const t2 = code(game?.team2_name);
  const scoreBr = String(game?.score_p1 ?? 0);
  const scoreAr = String(game?.score_p2 ?? 0);

  const mine = answers.data?.items ?? [];
  const totalPts = mine.reduce((sum, a) => sum + (a.awarded_points ?? 0), 0);

  // My calls as EKG dots, spread across the timeline by order (answers carry no
  // match-minute); green when they landed (earned > 0), red when they missed.
  const resolved = mine
    .filter((a) => a.awarded_points != null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ekgHist: HistEntry[] = resolved.map((a, i) => ({
    min: Math.round(((i + 0.6) / Math.max(1, resolved.length)) * 90),
    clock: "",
    pick: null,
    outcome: "fizzle",
    earned: a.awarded_points ?? 0,
    my: a.successful_outcome ? 0.6 : -0.55,
  }));

  const myRank = leaderboard.data?.items.find((e) => e.user_id === me.data?.id)?.rank;
  const globalRank = myRank ? `#${myRank}` : "—";

  const squadName = (matchSquad?.name ?? "YOUR SQUAD").toUpperCase();
  const rankLine = matchSquad ? matchSquad.standing.split(" ")[0] : "—";

  return {
    t1,
    t2,
    scoreBr,
    scoreAr,
    ftLine: `${t1} ${scoreBr} – ${scoreAr} ${t2}`,
    brFlag: <CountryFlag name={game?.team1_name} size={40} />,
    arFlag: <CountryFlag name={game?.team2_name} size={40} />,
    totalPts: String(totalPts),
    rankLine,
    squadName,
    globalRank,
    ekgHist,
  };
}
