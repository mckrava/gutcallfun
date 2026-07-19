import type { Game, GameParticipant } from "@/services/api/types";
import type { FixtureCard, LiveHeroVM } from "@/state/types";
import { CountryFlag } from "@/components/common/CountryFlag";
import { avatarFor } from "./avatar";

// The live-hero "who's in" strip from a game's real joined users — real avatar
// emojis only (no names), plus a "+N are in" overflow count.
function buildWhoIn(participants: GameParticipant[]): { whoInAvatars: { emoji: string; ring: string }[]; whoInText: string } {
  const whoInAvatars = participants.slice(0, 4).map((p) => ({
    emoji: p.emoji ?? avatarFor(p.user_id).emoji,
    ring: avatarFor(p.user_id).ring,
  }));
  const total = participants.length;
  if (total === 0) return { whoInAvatars, whoInText: "Be the first to join" };
  const more = total - whoInAvatars.length;
  const whoInText = `${more > 0 ? `+${more} ` : ""}are in`;
  return { whoInAvatars, whoInText };
}

// Team accent colours for the live hero — the design pairs a warm and a cool
// side (the backend's jersey colours are null), so we keep the mock's palette.
const TEAM1_COL = "#FFD84D";
const TEAM2_COL = "#7FB8E8";

// Format a game's kickoff for the "COMING UP" card's right-hand label, e.g.
// "Sun · 22:00". Client-local (the bridge runs post-hydration) so there's no
// server/client timezone split.
function formatWhen(startsAt: string | null): string {
  if (!startsAt) return "";
  const d = new Date(startsAt);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} · ${time}`;
}

const scoreLine = (g: Game) => `${g.score_p1} – ${g.score_p2}`;

// Team codes (hc/ac) aren't rendered on these cards — only names and flag
// elements are — so they're left empty; flags resolve from the country NAME via
// CountryFlag, visually identical to the mock's code-keyed Flag.
function upcomingCard(g: Game): FixtureCard {
  return {
    comp: (g.competition ?? "").toUpperCase(),
    hc: "",
    hn: g.team1_name ?? "TBD",
    ac: "",
    an: g.team2_name ?? "TBD",
    when: formatWhen(g.starts_at),
    accent: avatarFor(String(g.id)).ring,
    gameId: g.id,
    onClick: () => {},
    hFlagEl: <CountryFlag name={g.team1_name} size={38} />,
    aFlagEl: <CountryFlag name={g.team2_name} size={38} />,
  };
}

// Finished game → "Your results" card. No myPts: the caller has no per-game
// score yet (needs auth + answers), so the points badge is omitted downstream.
// `onClick` opens THIS game's recap (mirrors liveHero's onEnter wiring below) —
// the id is threaded through from the caller (adaptGames), never guessed.
function pastCard(g: Game, onClick: () => void): FixtureCard {
  return {
    comp: (g.competition ?? "").toUpperCase(),
    hc: "",
    hn: g.team1_name ?? "TBD",
    ac: "",
    an: g.team2_name ?? "TBD",
    score: scoreLine(g),
    accent: avatarFor(String(g.id)).ring,
    gameId: g.id,
    onClick,
    hFlagEl: <CountryFlag name={g.team1_name} size={36} />,
    aFlagEl: <CountryFlag name={g.team2_name} size={36} />,
  };
}

function liveHero(g: Game, onEnter: () => void, participants: GameParticipant[]): LiveHeroVM {
  return {
    gameId: g.id,
    comp: (g.competition ?? "").toUpperCase(),
    stage: null,
    team1Name: (g.team1_name ?? "TBD").toUpperCase(),
    team2Name: (g.team2_name ?? "TBD").toUpperCase(),
    team1Col: TEAM1_COL,
    team2Col: TEAM2_COL,
    team1Flag: <CountryFlag name={g.team1_name} size={58} />,
    team2Flag: <CountryFlag name={g.team2_name} size={58} />,
    score: scoreLine(g),
    onEnter,
    ...buildWhoIn(participants),
  };
}

// Split a full games page into the three match-list sections. Ordering matches
// GET /games (starts_at asc); past shows most-recent first.
export function adaptGames(
  games: Game[],
  opts: {
    onEnterLive: (game: Game) => void;
    onEnterPost: (game: Game) => void;
    liveParticipants?: GameParticipant[];
  },
): { laterMatches: FixtureCard[]; pastMatches: FixtureCard[]; liveHero: LiveHeroVM | null } {
  const scheduled = games
    .filter((g) => g.status === "scheduled")
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  const finished = games
    .filter((g) => g.status === "finished")
    .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""));
  const live = games.find((g) => g.status === "live") ?? null;

  return {
    laterMatches: scheduled.map(upcomingCard),
    pastMatches: finished.map((g) => pastCard(g, () => opts.onEnterPost(g))),
    liveHero: live ? liveHero(live, () => opts.onEnterLive(live), opts.liveParticipants ?? []) : null,
  };
}
