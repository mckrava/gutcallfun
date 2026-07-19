import { NextResponse, type NextRequest } from "next/server";
import { API_ORIGIN, SESSION_COOKIE, deleteSession, getSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  const session = getSession(sid);
  if (session) {
    // Best-effort backend revoke; the local session is dropped regardless.
    await fetch(`${API_ORIGIN}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh }),
    }).catch(() => {});
    deleteSession(sid);
  }
  const res = NextResponse.json({ success: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
