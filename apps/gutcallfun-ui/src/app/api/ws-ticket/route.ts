import { NextResponse, type NextRequest } from "next/server";
import {
  API_ORIGIN,
  SESSION_COOKIE,
  getSession,
  refreshSession,
} from "@/server/session";

export const dynamic = "force-dynamic";

// Mints a single-use socket ticket for the browser. The JWT stays here on the
// server — only the ephemeral ticket is returned, which the socket presents on
// its handshake (`auth: { ticket }`).
export async function GET(req: NextRequest): Promise<Response> {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  let session = getSession(sid);
  if (!sid || !session) {
    return NextResponse.json({ message: "unauthenticated" }, { status: 401 });
  }

  const mint = (access: string) =>
    fetch(`${API_ORIGIN}/auth/ws-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${access}` },
    });

  let upstream = await mint(session.access);
  if (upstream.status === 401) {
    const refreshed = await refreshSession(sid, session);
    if (!refreshed) return NextResponse.json({ message: "unauthenticated" }, { status: 401 });
    session = refreshed;
    upstream = await mint(session.access);
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
  return NextResponse.json({ ticket: data.ticket });
}
