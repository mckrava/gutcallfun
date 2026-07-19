"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { answersApi, gamesApi, leaderboardApi, questionOutcomesApi, squadsApi, usersApi } from "./endpoints";
import { queryKeys } from "./queryKeys";
import type {
  CreateAnswerBody,
  CreateSquadBody,
  CreateSquadParticipantBody,
  JoinGameBody,
  JoinSquadBody,
  LeaderboardQuery,
  ListAnswersQuery,
  ListSquadsQuery,
  ListGameEventsQuery,
  ListQuestionsQuery,
  PaginationQuery,
  UpdateUserBody,
} from "./types";

// ---- Games ----
export function useGames(query?: PaginationQuery) {
  return useQuery({ queryKey: queryKeys.games.list(query), queryFn: () => gamesApi.list(query) });
}
export function useGame(gameId: number | null) {
  return useQuery({
    queryKey: queryKeys.games.detail(gameId ?? -1),
    queryFn: () => gamesApi.get(gameId as number),
    enabled: gameId != null,
  });
}
export function useGameEvents(gameId: number | null, query?: ListGameEventsQuery) {
  return useQuery({
    queryKey: queryKeys.games.events(gameId ?? -1, query),
    queryFn: () => gamesApi.events(gameId as number, query),
    enabled: gameId != null,
  });
}
export function useGameQuestions(gameId: number | null, query?: ListQuestionsQuery) {
  return useQuery({
    queryKey: queryKeys.games.questions(gameId ?? -1, query),
    queryFn: () => gamesApi.questions(gameId as number, query),
    enabled: gameId != null,
  });
}
export function useGameParticipants(gameId: number | null) {
  return useQuery({
    queryKey: queryKeys.games.participants(gameId ?? -1),
    queryFn: () => gamesApi.participants(gameId as number, { limit: 50 }),
    enabled: gameId != null,
  });
}
export function useJoinGame(gameId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JoinGameBody) => gamesApi.join(gameId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.games.detail(gameId) }),
  });
}

// ---- Users ----
export function useUsers(query?: PaginationQuery) {
  return useQuery({ queryKey: queryKeys.users.list(query), queryFn: () => usersApi.list(query) });
}
// The signed-in user (session-derived). `enabled` lets callers gate on auth so
// an unauthenticated load doesn't fire a guaranteed 401.
export function useCurrentUser(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.me,
    queryFn: () => usersApi.me(),
    enabled: options?.enabled ?? true,
  });
}
export function useMyScoreProfile(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.myScoreProfile,
    queryFn: () => usersApi.myScoreProfile(),
    enabled: options?.enabled ?? true,
  });
}
export function useUser(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.users.detail(userId ?? ""),
    queryFn: () => usersApi.get(userId as string),
    enabled: !!userId,
  });
}
export function useUserScoreProfile(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.users.scoreProfile(userId ?? ""),
    queryFn: () => usersApi.scoreProfile(userId as string),
    enabled: !!userId,
  });
}
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateUserBody) => usersApi.updateMe(body),
    onSuccess: (user) => {
      qc.setQueryData(queryKeys.users.me, user);
      void qc.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

// ---- Answers ----
export function useAnswers(query?: ListAnswersQuery) {
  return useQuery({ queryKey: queryKeys.answers.list(query), queryFn: () => answersApi.list(query) });
}
export function useSubmitAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAnswerBody) => answersApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.answers.all }),
  });
}

// ---- Squads ----
export function useSquads(query?: ListSquadsQuery) {
  return useQuery({ queryKey: queryKeys.squads.list(query), queryFn: () => squadsApi.list(query) });
}
// The current user's squads. `enabled` gates on knowing the user id.
export function useMySquads(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.squads.list({ participant_id: userId ?? "" }),
    queryFn: () => squadsApi.list({ participant_id: userId as string, limit: 50 }),
    enabled: !!userId,
  });
}
export function useSquad(squadId: number | null) {
  return useQuery({
    queryKey: queryKeys.squads.detail(squadId ?? -1),
    queryFn: () => squadsApi.get(squadId as number),
    enabled: squadId != null,
  });
}
export function useSquadParticipants(squadId: number | null, query?: PaginationQuery) {
  return useQuery({
    queryKey: queryKeys.squads.participants(squadId ?? -1, query),
    queryFn: () => squadsApi.participants(squadId as number, query),
    enabled: squadId != null,
  });
}
export function useSquadScoreProfile(squadId: number | null) {
  return useQuery({
    queryKey: queryKeys.squads.scoreProfile(squadId ?? -1),
    queryFn: () => squadsApi.scoreProfile(squadId as number),
    enabled: squadId != null,
  });
}
export function useCreateSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSquadBody) => squadsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.squads.all }),
  });
}
export function useAddSquadParticipant(squadId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSquadParticipantBody) => squadsApi.addParticipant(squadId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.squads.participants(squadId) }),
  });
}
export function useJoinSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JoinSquadBody) => squadsApi.join(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.squads.all }),
  });
}

// ---- Leaderboard / outcomes ----
// `enabled: false` lets a caller hold the hook while its scope is still
// unknown. Without it, passing `undefined` for "not ready yet" silently fetches
// the GLOBAL board — a wasted request whose rows are the wrong ones for a
// scoped caller.
export function useLeaderboard(query?: LeaderboardQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.leaderboard(query),
    queryFn: () => leaderboardApi.list(query),
    enabled: options?.enabled ?? true,
  });
}
export function useQuestionOutcomes() {
  return useQuery({ queryKey: queryKeys.questionOutcomes, queryFn: () => questionOutcomesApi.list() });
}
