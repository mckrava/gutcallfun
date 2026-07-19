import type { LeaderboardEntry } from "@/services/api/types";
import type { RankRow } from "@/state/types";
import { avatarFor } from "./avatar";

// Medal palettes for the top-3 rows — copied verbatim from the prototype's
// hardcoded rankTop3 so gold/silver/bronze render pixel-identically. `ring`
// here is the medal colour (rank-based), not the per-user ring.
const MEDALS = [
  { ring: "#FFD84D", medalBg: "linear-gradient(135deg,rgba(255,216,77,.22),rgba(255,216,77,.05))", medalBd: "rgba(255,216,77,.5)", numCol: "#FFD84D" },
  { ring: "#C9D6E8", medalBg: "linear-gradient(135deg,rgba(201,214,232,.16),rgba(201,214,232,.04))", medalBd: "rgba(201,214,232,.42)", numCol: "#C9D6E8" },
  { ring: "#D69A5C", medalBg: "linear-gradient(135deg,rgba(214,154,92,.16),rgba(214,154,92,.04))", medalBd: "rgba(214,154,92,.42)", numCol: "#D69A5C" },
];

const fmtPts = (n: number) => n.toLocaleString("en-US");
const fmtName = (handle: string) => (handle.startsWith("@") ? handle : `@${handle}`);

// Build the two ranking sections from a single ranked leaderboard page.
// `meId` (when known — i.e. authenticated) highlights the caller's row exactly
// like the mock's `you` flag. Top 3 → medal rows; the rest → "around you" rows.
export function leaderboardToRankRows(
  entries: LeaderboardEntry[],
  meId?: string | null,
): { rankTop3: RankRow[]; rankAround: RankRow[] } {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);

  const rankTop3: RankRow[] = sorted.slice(0, 3).map((e, i) => {
    const medal = MEDALS[i] ?? MEDALS[2];
    return {
      rank: String(e.rank),
      name: fmtName(e.handle),
      pts: fmtPts(e.total_points),
      emoji: e.emoji ?? avatarFor(e.user_id).emoji,
      ring: medal.ring,
      medalBg: medal.medalBg,
      medalBd: medal.medalBd,
      numCol: medal.numCol,
    };
  });

  const rankAround: RankRow[] = sorted.slice(3).map((e) => {
    const you = !!meId && e.user_id === meId;
    return {
      rank: String(e.rank),
      name: fmtName(e.handle),
      pts: fmtPts(e.total_points),
      emoji: e.emoji ?? avatarFor(e.user_id).emoji,
      ring: avatarFor(e.user_id).ring,
      rowBg: you ? "rgba(255,216,77,.1)" : "rgba(255,255,255,.035)",
      rowBd: you ? "rgba(255,216,77,.45)" : "rgba(255,255,255,.08)",
      rankCol: you ? "#FFD84D" : "rgba(220,230,245,.5)",
      nameCol: you ? "#FFD84D" : "#F2F6FC",
      ptsCol: you ? "#FFD84D" : "#3DDC84",
    };
  });

  return { rankTop3, rankAround };
}
