import type { ListAnswersQuery, ListGameEventsQuery, ListQuestionsQuery, ListSquadsQuery, PaginationQuery } from "./types";

// Stable query-key factory so hooks and manual cache updates/invalidations stay
// in sync. Keep every read through here.
export const queryKeys = {
  games: {
    all: ["games"] as const,
    list: (query?: PaginationQuery) => ["games", "list", query ?? {}] as const,
    detail: (gameId: number) => ["games", "detail", gameId] as const,
    events: (gameId: number, query?: ListGameEventsQuery) => ["games", gameId, "events", query ?? {}] as const,
    questions: (gameId: number, query?: ListQuestionsQuery) => ["games", gameId, "questions", query ?? {}] as const,
    participants: (gameId: number) => ["games", gameId, "participants"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (query?: PaginationQuery) => ["users", "list", query ?? {}] as const,
    me: ["users", "me"] as const,
    myScoreProfile: ["users", "me", "score-profile"] as const,
    detail: (userId: string) => ["users", "detail", userId] as const,
    scoreProfile: (userId: string) => ["users", userId, "score-profile"] as const,
  },
  answers: {
    all: ["answers"] as const,
    list: (query?: ListAnswersQuery) => ["answers", "list", query ?? {}] as const,
  },
  squads: {
    all: ["squads"] as const,
    list: (query?: ListSquadsQuery) => ["squads", "list", query ?? {}] as const,
    detail: (squadId: number) => ["squads", "detail", squadId] as const,
    participants: (squadId: number, query?: PaginationQuery) => ["squads", squadId, "participants", query ?? {}] as const,
    scoreProfile: (squadId: number) => ["squads", squadId, "score-profile"] as const,
  },
  leaderboard: (query?: PaginationQuery) => ["leaderboard", query ?? {}] as const,
  questionOutcomes: ["question-outcomes"] as const,
};
