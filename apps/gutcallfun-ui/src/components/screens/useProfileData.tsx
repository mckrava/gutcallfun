"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAnswers, useCurrentUser, useGames, useMyScoreProfile } from "@/services/api/hooks";
import { avatarFor } from "@/services/adapters/avatar";
import { CountryFlag } from "@/components/common/CountryFlag";
import type { RecentMatch } from "@/state/types";

// Composes the real profile view from the session user, score profile, answers
// and games. Everything shown on the Profile screen comes from here — no mock.
export function useProfileData() {
  const { publicKey } = useWallet();
  const me = useCurrentUser();
  const profile = useMyScoreProfile({ enabled: !!me.data });
  const answers = useAnswers({ limit: 100 });
  const games = useGames({ limit: 100 });

  const user = me.data ?? null;
  const address = publicKey?.toBase58() ?? "";
  const walletShort = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "—";

  const emoji = user?.emoji ?? (user ? avatarFor(user.id).emoji : "🦊");
  const handle = user ? `@${user.handle}` : "@—";

  const totalPoints = profile.data?.total_points ?? 0;
  const matches = profile.data?.games_played ?? 0;

  const { callsLanded, bestStreak, recentMatches } = useMemo(() => {
    const all = answers.data?.items ?? [];
    const resolved = all.filter((a) => a.awarded_points != null);
    const landed = resolved.filter((a) => a.successful_outcome === true).length;
    const pct = resolved.length ? Math.round((landed / resolved.length) * 100) : null;

    // Longest run of consecutive successful calls (chronological).
    const chrono = [...resolved].sort((a, b) => a.created_at.localeCompare(b.created_at));
    let streak = 0;
    let best = 0;
    for (const a of chrono) {
      if (a.successful_outcome === true) { streak++; best = Math.max(best, streak); }
      else streak = 0;
    }

    // Recent answered games: sum my points per game, newest first, joined to games.
    const gameList = games.data?.items ?? [];
    const byGame = new Map<number, { pts: number; last: string }>();
    for (const a of all) {
      const cur = byGame.get(a.game_id) ?? { pts: 0, last: "" };
      cur.pts += a.awarded_points ?? 0;
      if (a.created_at > cur.last) cur.last = a.created_at;
      byGame.set(a.game_id, cur);
    }
    const recent: RecentMatch[] = [...byGame.entries()]
      .sort((a, b) => b[1].last.localeCompare(a[1].last))
      .slice(0, 5)
      .map(([gameId, agg]) => {
        const g = gameList.find((x) => x.id === gameId);
        return {
          comp: (g?.competition ?? "").toUpperCase(),
          score: g ? `${g.score_p1} – ${g.score_p2}` : "—",
          pts: `+${agg.pts}`,
          hEl: <CountryFlag name={g?.team1_name} size={26} />,
          aEl: <CountryFlag name={g?.team2_name} size={26} />,
        };
      })
      .filter((_, i, arr) => arr.length > 0);

    return {
      callsLanded: pct == null ? "—" : `${pct}%`,
      bestStreak: `${best}🔥`,
      recentMatches: recent,
    };
  }, [answers.data, games.data]);

  return { emoji, handle, walletShort, totalPoints, matches, callsLanded, bestStreak, recentMatches };
}
