import { NextResponse, type NextRequest } from "next/server";
import {
  API_ORIGIN,
  REG_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  takePendingReg,
} from "@/server/session";

export const dynamic = "force-dynamic";

// Completes first-time sign-in: swaps the server-held registration token + the
// chosen handle for a real session (captured server-side).
export async function POST(req: NextRequest): Promise<Response> {
  const registrationToken = takePendingReg(req.cookies.get(REG_COOKIE)?.value);
  if (!registrationToken) {
    return NextResponse.json(
      { message: "Registration expired — please sign in again." },
      { status: 401 },
    );
  }

  const { handle } = (await req.json().catch(() => ({}))) as { handle?: string };
  const upstream = await fetch(`${API_ORIGIN}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ registration_token: registrationToken, handle }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const sid = createSession({
    access: data.access_token,
    refresh: data.refresh_token,
    userId: data.user.id,
  });
  const res = NextResponse.json({ user: data.user });
  res.cookies.set(SESSION_COOKIE, sid, cookieOptions);
  res.cookies.delete(REG_COOKIE);
  return res;
}
