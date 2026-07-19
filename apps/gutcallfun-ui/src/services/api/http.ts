import axios, { AxiosError, type AxiosInstance } from "axios";
import { API_BASE_URL } from "./config";

/**
 * AUTH SEAM #1 (REST). Headers attached to every request via the request
 * interceptor below. Empty this phase. The auth agent fills this in — return
 * `{ Authorization: \`Bearer ${accessToken}\` }` — OR, for a server-side-only
 * JWT, leaves this a no-op and lets the BFF proxy inject the header instead.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return {};
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const client: AxiosInstance = axios.create({ baseURL: API_BASE_URL });

// Request interceptor — the auth-header injection point.
client.interceptors.request.use(async (config) => {
  const auth = await getAuthHeaders();
  Object.assign(config.headers, auth);
  return config;
});

// Response interceptor — normalize errors to ApiError. AUTH SEAM: this is where
// a 401 -> refresh-and-retry flow goes later.
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;
    return Promise.reject(new ApiError(status, body, `${error.config?.method?.toUpperCase()} ${error.config?.url} failed with ${status}`));
  },
);

/** Any flat object of query params — axios drops undefined entries. */
export type QueryParams = object;

export const http = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    client.get<T>(path, { params: query, signal }).then((r) => r.data),
  post: <T>(path: string, body?: unknown) => client.post<T>(path, body).then((r) => r.data),
  patch: <T>(path: string, body?: unknown) => client.patch<T>(path, body).then((r) => r.data),
  put: <T>(path: string, body?: unknown) => client.put<T>(path, body).then((r) => r.data),
  del: <T>(path: string) => client.delete<T>(path).then((r) => r.data),
};
