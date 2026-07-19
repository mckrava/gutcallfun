"use client";

import { useSyncExternalStore } from "react";
import { useAnswers, useCurrentUser, useGameRecap, useGames, useLeaderboard } from "@/services/api/hooks";
import { getRealData, subscribeRealData } from "@/state/realData";
import { CountryFlag } from "@/components/common/CountryFlag";
import type { HistEntry } from "@/state/types";
import type { RecapPressurePoint } from "@/services/api/types";

const code = (name: string | null | undefined) => (name ?? "").slice(0, 3).toUpperCase();

/** Nearest-minute sample from the pressure series; 0 when the series is empty. */
function sampleNearest(pressure: RecapPressurePoint[], minute: number): number {
  if (pressure.length === 0) return 0;
  let nearest = pressure[0];
  let bestDist = Math.abs(pressure[0].minute - minute);
  for (const p of pressure) {
    const dist = Math.abs(p.minute - minute);
    if (dist < bestDist) {
      nearest = p;
      bestDist = dist;
    }
  }
  return nearest.value;
}

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
  // Auth-guarded — gate on having a resolved session, or an unauthenticated
  // fetch is a guaranteed 401 that never gets retried (staleTime: 30s).
  const recap = useGameRecap(game?.id ?? null, { enabled: me.data != null });
  const matchSquad = useSyncExternalStore(subscribeRealData, () => getRealData().matchSquadPanel ?? null, () => null);

  const t1 = code(game?.team1_name);
  const t2 = code(game?.team2_name);
  const scoreBr = String(game?.score_p1 ?? 0);
  const scoreAr = String(game?.score_p2 ?? 0);

  const mine = answers.data?.items ?? [];

  // --- Fallback path: answers-derived (no match-minute, no server ranks). ---
  // Kept exactly as-is for when recap.data is absent or the query errored —
  // the screen must still render.
  const fallbackTotalPts = mine.reduce((sum, a) => sum + (a.awarded_points ?? 0), 0);
  const fallbackResolved = mine
    .filter((a) => a.awarded_points != null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const fallbackEkgHist: HistEntry[] = fallbackResolved.map((a, i) => ({
    min: Math.round(((i + 0.6) / Math.max(1, fallbackResolved.length)) * 90),
    clock: "",
    pick: null,
    outcome: "fizzle",
    earned: a.awarded_points ?? 0,
    my: a.successful_outcome ? 0.6 : -0.55,
  }));
  const myRank = leaderboard.data?.items.find((e) => e.user_id === me.data?.id)?.rank;
  const fallbackGlobalRank = myRank ? `#${myRank}` : "—";
  const fallbackSquadName = (matchSquad?.name ?? "YOUR SQUAD").toUpperCase();
  const fallbackRankLine = matchSquad ? matchSquad.standing.split(" ")[0] : "—";

  const r = recap.data;

  // --- Real path: everything r supplies takes precedence. ---
  const pressure = r?.pressure ?? [];
  const goals = r?.goals.map((g) => ({ minute: g.minute, participant: g.participant ?? 1 })) ?? [];

  const realEkgHist: HistEntry[] = r
    ? r.calls
        .filter((c): c is typeof c & { minute: number } => c.minute != null)
        .map((c) => ({
          min: c.minute,
          clock: "",
          pick: null,
          outcome: "fizzle",
          earned: c.awarded_points ?? 0,
          my: sampleNearest(pressure, c.minute),
        }))
    : [];

  const totalPts = r ? r.me.total_points : fallbackTotalPts;
  const ekgHist = r ? realEkgHist : fallbackEkgHist;
  const globalRank = r ? (r.ranks.global ? `#${r.ranks.global.rank}` : "—") : fallbackGlobalRank;
  const rankLine = r ? (r.ranks.squad ? `#${r.ranks.squad.rank}` : "—") : fallbackRankLine;
  const squadName = r ? (r.me.squad_name ?? "YOUR SQUAD").toUpperCase() : fallbackSquadName;

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
    pressure,
    goals,
  };
}
