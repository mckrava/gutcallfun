import { http } from "./http";
import type {
  Answer,
  ChallengeResponse,
  CreateAnswerBody,
  CreateSquadBody,
  CreateSquadParticipantBody,
  JoinSquadBody,
  ListSquadsQuery,
  ListUsersQuery,
  Game,
  GameEvent,
  GameParticipant,
  JoinGameBody,
  LeaderboardEntry,
  LeaderboardQuery,
  MyGameParticipation,
  ListAnswersQuery,
  ListGameEventsQuery,
  ListQuestionsQuery,
  Paginated,
  PaginationQuery,
  Question,
  QuestionOutcome,
  Recap,
  SeqPage,
  Squad,
  SquadParticipant,
  SquadScoreProfile,
  UpdateUserBody,
  User,
  UserGame,
  UserScoreProfile,
  VerifyBody,
  VerifyResult,
} from "./types";

// Auth calls go to the same-origin Next BFF. /challenge is a transparent proxy
// (public, no token); /verify, /register, /logout are Next routes that capture
// the tokens server-side and return only these sanitized shapes.
export const authApi = {
  challenge: (walletAddress: string) =>
    http.post<ChallengeResponse>("/auth/challenge", { wallet_address: walletAddress }),
  verify: (body: VerifyBody) => http.post<VerifyResult>("/auth/verify", body),
  register: (handle: string) => http.post<{ user: User }>("/auth/register", { handle }),
  logout: () => http.post<{ success: boolean }>("/auth/logout"),
  // Startup session check — resolves with the user when the server session is
  // valid, throws ApiError(401) otherwise. Used to skip re-signing on reload.
  me: () => http.get<{ authenticated: boolean; user: User | null }>("/auth/me"),
};

export const gamesApi = {
  list: (query?: PaginationQuery) => http.get<Paginated<Game>>("/games", query),
  get: (gameId: number) => http.get<Game>(`/games/${gameId}`),
  events: (gameId: number, query?: ListGameEventsQuery) =>
    http.get<SeqPage<GameEvent>>(`/games/${gameId}/events`, query),
  questions: (gameId: number, query?: ListQuestionsQuery) =>
    http.get<Question[]>(`/games/${gameId}/questions`, query),
  myParticipation: (gameId: number) =>
    http.get<MyGameParticipation>(`/games/${gameId}/me`),
  recap: (gameId: number) => http.get<Recap>(`/games/${gameId}/recap`),
  participants: (gameId: number, query?: PaginationQuery) =>
    http.get<Paginated<GameParticipant>>(`/games/${gameId}/participants`, query),
  join: (gameId: number, body: JoinGameBody) => http.post<UserGame>(`/games/${gameId}/join`, body),
};

export const usersApi = {
  list: (query?: ListUsersQuery) => http.get<Paginated<User>>("/users", query),
  // Current user (session-derived on the backend via @CurrentUser).
  me: () => http.get<User>("/users/me"),
  myScoreProfile: () => http.get<UserScoreProfile>("/users/me/score-profile"),
  updateMe: (body: UpdateUserBody) => http.patch<User>("/users/me", body),
  // Other players by id (leaderboards, squad members).
  get: (userId: string) => http.get<User>(`/users/${userId}`),
  scoreProfile: (userId: string) => http.get<UserScoreProfile>(`/users/${userId}/score-profile`),
};

export const answersApi = {
  create: (body: CreateAnswerBody) => http.post<Answer>("/answers", body),
  list: (query?: ListAnswersQuery) => http.get<Paginated<Answer>>("/answers", query),
};

export const squadsApi = {
  list: (query?: ListSquadsQuery) => http.get<Paginated<Squad>>("/squads", query),
  create: (body: CreateSquadBody) => http.post<Squad>("/squads", body),
  join: (body: JoinSquadBody) => http.post<Squad>("/squads/join", body),
  get: (squadId: number) => http.get<Squad>(`/squads/${squadId}`),
  participants: (squadId: number, query?: PaginationQuery) =>
    http.get<Paginated<SquadParticipant>>(`/squads/${squadId}/participants`, query),
  addParticipant: (squadId: number, body: CreateSquadParticipantBody) =>
    http.post<SquadParticipant>(`/squads/${squadId}/participants`, body),
  scoreProfile: (squadId: number) => http.get<SquadScoreProfile>(`/squads/${squadId}/score-profile`),
};

export const leaderboardApi = {
  // Optional game_id / squad_id select the game- and squad-scoped boards;
  // omitting both is the global board this endpoint always returned.
  list: (query?: LeaderboardQuery) => http.get<Paginated<LeaderboardEntry>>("/leaderboard", query),
};

export const questionOutcomesApi = {
  list: () => http.get<QuestionOutcome[]>("/question-outcomes"),
};
