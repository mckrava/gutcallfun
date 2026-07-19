import { NextResponse, type NextRequest } from "next/server";
import { API_ORIGIN, SESSION_COOKIE, getSession, refreshSession } from "@/server/session";

export const dynamic = "force-dynamic";

// Startup session check: the client calls this on load to learn whether the
// server-side session is still valid — so a returning user goes straight into
// the app without re-signing. The JWT stays server-side; only the user is
// returned. 401 = no/invalid session (show sign-in).
export async function GET(req: NextRequest): Promise<Response> {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  let session = getSession(sid);
  if (!sid || !session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
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
  return NextResponse.json({ authenticated: true, user });
}
