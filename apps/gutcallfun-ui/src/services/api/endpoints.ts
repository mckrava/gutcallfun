import { http } from "./http";
import type {
  Answer,
  ChallengeResponse,
  CreateAnswerBody,
  CreateSquadBody,
  CreateSquadParticipantBody,
  CreateUserBody,
  Game,
  GameEvent,
  JoinGameBody,
  LeaderboardEntry,
  ListAnswersQuery,
  Paginated,
  PaginationQuery,
  Question,
  QuestionOutcome,
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
  events: (gameId: number, query?: PaginationQuery) =>
    http.get<Paginated<GameEvent>>(`/games/${gameId}/events`, query),
  questions: (gameId: number, query?: PaginationQuery) =>
    http.get<Paginated<Question>>(`/games/${gameId}/questions`, query),
  join: (gameId: number, body: JoinGameBody) => http.post<UserGame>(`/games/${gameId}/join`, body),
};

export const usersApi = {
  list: (query?: PaginationQuery) => http.get<Paginated<User>>("/users", query),
  get: (userId: string) => http.get<User>(`/users/${userId}`),
  create: (body: CreateUserBody) => http.post<User>("/users", body),
  update: (userId: string, body: UpdateUserBody) => http.patch<User>(`/users/${userId}`, body),
  scoreProfile: (userId: string) => http.get<UserScoreProfile>(`/users/${userId}/score-profile`),
};

export const answersApi = {
  create: (body: CreateAnswerBody) => http.post<Answer>("/answers", body),
  list: (query?: ListAnswersQuery) => http.get<Paginated<Answer>>("/answers", query),
};

export const squadsApi = {
  list: (query?: PaginationQuery) => http.get<Paginated<Squad>>("/squads", query),
  create: (body: CreateSquadBody) => http.post<Squad>("/squads", body),
  get: (squadId: number) => http.get<Squad>(`/squads/${squadId}`),
  participants: (squadId: number, query?: PaginationQuery) =>
    http.get<Paginated<SquadParticipant>>(`/squads/${squadId}/participants`, query),
  addParticipant: (squadId: number, body: CreateSquadParticipantBody) =>
    http.post<SquadParticipant>(`/squads/${squadId}/participants`, body),
  scoreProfile: (squadId: number) => http.get<SquadScoreProfile>(`/squads/${squadId}/score-profile`),
};

export const leaderboardApi = {
  list: (query?: PaginationQuery) => http.get<Paginated<LeaderboardEntry>>("/leaderboard", query),
};

export const questionOutcomesApi = {
  list: () => http.get<QuestionOutcome[]>("/question-outcomes"),
};
