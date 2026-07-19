import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Server-only module: the JWT lives here (Next server), never in the browser.
// The browser holds only an opaque, httpOnly session id cookie that maps to
// this store. Do NOT import this from a client component.
//
// The store is BACKED BY A FILE, not just an in-memory Map. A pure in-memory
// map is wiped on every process restart AND — the one that actually bit us —
// on every Next dev HMR reload of this module: the sid in a user's cookie then
// points at a session that no longer exists (`sessionInMap=NO`), so `/auth/me`
// 401s and a signed-in user is bounced to sign-in "randomly". Persisting to
// disk lets the sid survive a restart/reload, on the dev server and a single
// Node host alike. (A multi-instance / serverless deploy needs a shared store
// like Redis instead — see SESSION_STORE_PATH.)

export const API_ORIGIN = process.env.API_URL ?? "http://localhost:3000";

export interface Session {
  access: string;
  refresh: string;
  userId: string;
}

type PendingReg = { registrationToken: string; expiresAt: number };
const REG_TTL_MS = 10 * 60 * 1000;

// Sensitive (holds JWTs) — kept out of the repo, in the OS temp dir by default,
// which survives HMR + process restarts but not a reboot (fine: users re-sign).
const STORE_PATH = process.env.SESSION_STORE_PATH ?? join(tmpdir(), "gutcall-sessions.json");

function load(): { sessions: Map<string, Session>; pendingRegs: Map<string, PendingReg> } {
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as {
      sessions?: [string, Session][];
      pendingRegs?: [string, PendingReg][];
    };
    const now = Date.now();
    return {
      sessions: new Map(raw.sessions ?? []),
      // Drop registration tokens that expired while the store sat on disk.
      pendingRegs: new Map((raw.pendingRegs ?? []).filter(([, r]) => r.expiresAt > now)),
    };
  } catch {
    return { sessions: new Map(), pendingRegs: new Map() };
  }
}

const { sessions, pendingRegs } = load();

function persist(): void {
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(
      STORE_PATH,
      JSON.stringify({ sessions: [...sessions], pendingRegs: [...pendingRegs] }),
    );
  } catch {
    // Best-effort: a failed write just means this mutation isn't durable; the
    // in-memory copy still serves the current process.
  }
}

export const SESSION_COOKIE = "gc_session";
export const REG_COOKIE = "gc_reg";

export const cookieOptions = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// The session cookie MUST be persistent, not session-scoped. A cookie set with
// no maxAge/expires is a "session cookie" the browser may drop when the tab's
// browsing session ends — and mobile wallet in-app browsers (Phantom, MetaMask,
// Trust WebView) drop them unreliably across reloads / app backgrounding / the
// deep-link round-trip to the wallet and back. That's what logged mobile users
// out on refresh (intermittently: sometimes the cookie survived, sometimes not)
// while desktop, which keeps session cookies across reloads, was fine.
// Persist it so the opaque session id survives a reload the same everywhere.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const sessionCookieOptions = { ...cookieOptions, maxAge: SESSION_MAX_AGE };

const newId = (): string => randomBytes(24).toString("base64url");

export function createSession(session: Session): string {
  const id = newId();
  sessions.set(id, session);
  persist();
  return id;
}

export function getSession(id: string | undefined): Session | undefined {
  return id ? sessions.get(id) : undefined;
}

export function deleteSession(id: string | undefined): void {
  if (id && sessions.delete(id)) persist();
}

/** Hold a first-time wallet's registration token until it picks a handle. */
export function createPendingReg(registrationToken: string): string {
  const id = newId();
  pendingRegs.set(id, { registrationToken, expiresAt: Date.now() + REG_TTL_MS });
  persist();
  return id;
}

/** Single-use: returns and removes the pending registration token, or null. */
export function takePendingReg(id: string | undefined): string | null {
  if (!id) return null;
  const rec = pendingRegs.get(id);
  if (pendingRegs.delete(id)) persist();
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
  persist();
  return updated;
}
