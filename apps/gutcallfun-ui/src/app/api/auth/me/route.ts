import { NextResponse, type NextRequest } from "next/server";
import { API_ORIGIN, SESSION_COOKIE, getSession, refreshSession, sessionCookieOptions } from "@/server/session";

export const dynamic = "force-dynamic";

// Startup session check: the client calls this on load to learn whether the
// server-side session is still valid — so a returning user goes straight into
// the app without re-signing. The JWT stays server-side; only the user is
// returned. 401 = no/invalid session (show sign-in).
export async function GET(req: NextRequest): Promise<Response> {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  let session = getSession(sid);
  if (!sid || !session) {
    const res = NextResponse.json({ authenticated: false }, { status: 401 });
    // Self-heal a STALE cookie: a sid that no session backs (e.g. left over from
    // a previous server process, before the store was persisted) would otherwise
    // keep 401-ing on every load. Drop it so the browser starts clean and the
    // user just gets a normal sign-in instead of a stuck cookie.
    if (sid) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const fetchMe = (access: string) =>
    fetch(`${API_ORIGIN}/users/me`, { headers: { authorization: `Bearer ${access}` } });

  let upstream = await fetchMe(session.access);
  if (upstream.status === 401) {
    const refreshed = await refreshSession(sid, session);
    if (!refreshed) return NextResponse.json({ authenticated: false }, { status: 401 });
    session = refreshed;
    upstream = await fetchMe(session.access);
  }
  if (!upstream.ok) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await upstream.json().catch(() => null);
  const res = NextResponse.json({ authenticated: true, user });
  // Re-write the (persistent) session cookie on every valid load: slides the
  // 30-day window for active users, and re-persists it if a flaky webview had
  // dropped it to a session-scoped cookie.
  res.cookies.set(SESSION_COOKIE, sid, sessionCookieOptions);
  return res;
}
