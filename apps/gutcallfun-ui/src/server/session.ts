import { randomBytes } from "node:crypto";

// Server-only module: the JWT lives here (Next server memory), never in the
// browser. The browser holds only an opaque, httpOnly session id cookie that
// maps to this store. In-memory + single-process (like the backend's stores):
// a Next restart drops sessions and the user re-signs — acceptable for the demo.
// Do NOT import this from a client component.

export const API_ORIGIN = process.env.API_URL ?? "http://localhost:3000";

export interface Session {
  access: string;
  refresh: string;
  userId: string;
}

const sessions = new Map<string, Session>();
const pendingRegs = new Map<string, { registrationToken: string; expiresAt: number }>();
const REG_TTL_MS = 10 * 60 * 1000;

export const SESSION_COOKIE = "gc_session";
export const REG_COOKIE = "gc_reg";

export const cookieOptions = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

const newId = (): string => randomBytes(24).toString("base64url");

export function createSession(session: Session): string {
  const id = newId();
  sessions.set(id, session);
  return id;
}

export function getSession(id: string | undefined): Session | undefined {
  return id ? sessions.get(id) : undefined;
}

export function deleteSession(id: string | undefined): void {
  if (id) sessions.delete(id);
}

/** Hold a first-time wallet's registration token until it picks a handle. */
export function createPendingReg(registrationToken: string): string {
  const id = newId();
  pendingRegs.set(id, { registrationToken, expiresAt: Date.now() + REG_TTL_MS });
  return id;
}

/** Single-use: returns and removes the pending registration token, or null. */
export function takePendingReg(id: string | undefined): string | null {
  if (!id) return null;
  const rec = pendingRegs.get(id);
  pendingRegs.delete(id);
  if (!rec || rec.expiresAt < Date.now()) return null;
  return rec.registrationToken;
}

// Single-flight refresh per session. Two requests hitting an expired access
// token at once would otherwise both POST /auth/refresh with the same (soon
// single-use) refresh token: the first rotates it, the second sends the now
// consumed token, gets a 401, and evicts the session the first just refreshed —
// a spurious logout. Concurrent callers share one in-flight promise instead.
const inFlightRefresh = new Map<string, Promise<Session | null>>();

/**
 * Rotate the backend session for `id`. Returns the updated session, or null and
 * evicts it when the refresh token is genuinely invalid (e.g. backend restart).
 */
export function refreshSession(id: string, session: Session): Promise<Session | null> {
  const existing = inFlightRefresh.get(id);
  if (existing) return existing;
  const pending = doRefresh(id, session.refresh).finally(() => {
    inFlightRefresh.delete(id);
  });
  inFlightRefresh.set(id, pending);
  return pending;
}

async function doRefresh(id: string, snapshotRefresh: string): Promise<Session | null> {
  const current = sessions.get(id);
  if (!current) return null; // logged out / evicted meanwhile
  // A concurrent (or prior) refresh already rotated it — that session is valid.
  if (current.refresh !== snapshotRefresh) return current;

  const res = await fetch(`${API_ORIGIN}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: current.refresh }),
  });
  if (!res.ok) {
    deleteSession(id);
    return null;
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string };
  const updated: Session = { ...current, access: data.access_token, refresh: data.refresh_token };
  sessions.set(id, updated);
  return updated;
}
