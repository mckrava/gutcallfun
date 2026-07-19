import { NextResponse, type NextRequest } from "next/server";
import {
  API_ORIGIN,
  REG_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  createPendingReg,
  createSession,
} from "@/server/session";

export const dynamic = "force-dynamic";

// Overrides the catch-all proxy for /api/auth/verify: the backend's response
// carries the tokens, which we capture SERVER-SIDE and never forward to the
// browser. The browser learns only whether it's authenticated or must register.
export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.text();
  const upstream = await fetch(`${API_ORIGIN}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  if (data.status === "authenticated") {
    const sid = createSession({
      access: data.access_token,
      refresh: data.refresh_token,
      userId: data.user.id,
    });
    const res = NextResponse.json({ status: "authenticated", user: data.user });
    res.cookies.set(SESSION_COOKIE, sid, cookieOptions);
    return res;
  }

  // First-time wallet: keep the registration token server-side; the browser
  // collects a handle and calls /api/auth/register.
  const rid = createPendingReg(data.registration_token);
  const res = NextResponse.json({ status: "registration_required" });
  res.cookies.set(REG_COOKIE, rid, { ...cookieOptions, maxAge: 600 });
  return res;
}
