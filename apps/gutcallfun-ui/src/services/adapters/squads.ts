import type { Squad, SquadParticipant } from "@/services/api/types";
import type { MatchSquadPanelVM, MatchSquadRow, Medaled, RestRow } from "@/state/types";
import { avatarFor } from "./avatar";

// Medal palettes for the top-3 rows (gold/silver/bronze) — same as rankings.
const MEDALS = [
  { medalBg: "linear-gradient(135deg,rgba(255,216,77,.22),rgba(255,216,77,.05))", medalBd: "rgba(255,216,77,.5)", numCol: "#FFD84D" },
  { medalBg: "linear-gradient(135deg,rgba(201,214,232,.16),rgba(201,214,232,.04))", medalBd: "rgba(201,214,232,.42)", numCol: "#C9D6E8" },
  { medalBg: "linear-gradient(135deg,rgba(214,154,92,.16),rgba(214,154,92,.04))", medalBd: "rgba(214,154,92,.42)", numCol: "#D69A5C" },
];

/**
 * Minimal shape shared by `SquadParticipant` and `LeaderboardEntry` so the
 * member-row helpers and the match panel can be fed from either. Leaderboard
 * rows carry a server-computed `rank` (shared across ties); participant rows do
 * not, and fall back to array position.
 */
export interface RankableMember {
  user_id: string;
  handle: string | null;
  emoji: string | null;
  total_points: number;
  rank?: number;
}

const nameOf = (p: RankableMember) => (p.handle ? `@${p.handle}` : `@${p.user_id.slice(0, 6)}`);
const emojiOf = (p: RankableMember) => p.emoji ?? avatarFor(p.user_id).emoji;
const ringOf = (p: RankableMember) => avatarFor(p.user_id).ring;

// Split a squad's (points-desc) participants into medal + rest rows, matching
// the mock's Squad-detail styling. `meId` highlights the caller's row.
export function squadMembersToRows(
  participants: SquadParticipant[],
  meId?: string | null,
): { top3: Medaled[]; rest: RestRow[] } {
  const sorted = [...participants].sort((a, b) => b.total_points - a.total_points);

  const top3: Medaled[] = sorted.slice(0, 3).map((p, i) => {
    const medal = MEDALS[i] ?? MEDALS[2];
    return {
      rank: String(i + 1),
      name: nameOf(p),
      emoji: emojiOf(p),
      ring: ringOf(p),
      pts: String(p.total_points),
      medalBg: medal.medalBg,
      medalBd: medal.medalBd,
      numCol: medal.numCol,
      nameCol: meId && p.user_id === meId ? "#FFD84D" : "#F2F6FC",
    };
  });

  const rest: RestRow[] = sorted.slice(3).map((p, i) => {
    const you = !!meId && p.user_id === meId;
    return {
      rank: String(i + 4),
      name: nameOf(p),
      emoji: emojiOf(p),
      ring: ringOf(p),
      pts: String(p.total_points),
      rowBg: you ? "rgba(255,216,77,.1)" : "rgba(255,255,255,.035)",
      rowBd: you ? "rgba(255,216,77,.45)" : "rgba(255,255,255,.08)",
      rankCol: you ? "#FFD84D" : "rgba(220,230,245,.5)",
      nameCol: you ? "#FFD84D" : "#F2F6FC",
      ptsCol: you ? "#FFD84D" : "#3DDC84",
    };
  });

  return { top3, rest };
}

// The picked squad + its members → the in-match duel panel. `meId` is
// highlighted and labelled "You"; standing is the caller's rank in the squad.
//
// Feed this the GAME-SCOPED squad leaderboard, not the squad participant list:
// participants carry points earned across the whole squad history, which made
// this panel rank teammates by matches that are not the one being watched.
export function squadToMatchPanel(
  squad: Squad,
  participants: RankableMember[],
  meId?: string | null,
): MatchSquadPanelVM {
  const sorted = [...participants].sort((a, b) => b.total_points - a.total_points);
  const rows: MatchSquadRow[] = sorted.map((p, i) => {
    const you = !!meId && p.user_id === meId;
    return {
      rank: String(p.rank ?? i + 1),
      name: you ? "You" : nameOf(p),
      emoji: emojiOf(p),
      pts: String(p.total_points),
      r: "",
      hasR: false,
      isYou: you,
      ringCss: you ? "#FFD84D" : ringOf(p),
      nameCol: you ? "#FFD84D" : "rgba(220,230,245,.55)",
      rowBg: you ? "rgba(255,216,77,.1)" : "rgba(255,255,255,.035)",
      rowBd: you ? "rgba(255,216,77,.4)" : "rgba(255,255,255,.07)",
      rankCol: you ? "#FFD84D" : "rgba(220,230,245,.45)",
      ptsCol: you ? "#FFD84D" : "#3DDC84",
    };
  });
  const myIdx = sorted.findIndex((p) => !!meId && p.user_id === meId);
  const myRank = myIdx >= 0 ? (sorted[myIdx].rank ?? myIdx + 1) : null;
  const standing = myRank !== null ? `#${myRank} OF ${sorted.length}` : `${sorted.length} MEMBERS`;
  return { name: squad.name, emoji: squad.emoji ?? "⚽", standing, rows };
}
