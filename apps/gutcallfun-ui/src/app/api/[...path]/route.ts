import type { NextRequest } from "next/server";
import { API_ORIGIN, SESSION_COOKIE, getSession, refreshSession } from "@/server/session";

// BFF proxy: forwards /api/<path> to the real backend, server-side, injecting
// the access token from the server session so the JWT never reaches the browser.
// The client always calls this same-origin route (API_BASE_URL = "/api").
// Specific auth routes (/api/auth/verify, /register, /logout, /api/ws-ticket)
// override this catch-all and handle their own token capture.

// Hop-by-hop / encoding headers that must not be forwarded verbatim.
const STRIP_REQUEST = new Set(["host", "connection", "content-length", "authorization"]);
const STRIP_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const target = `${API_ORIGIN}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const baseHeaders = new Headers();
  req.headers.forEach((value, key) => {
    // Drop any client-sent authorization — the token is server-side only.
    if (!STRIP_REQUEST.has(key.toLowerCase())) baseHeaders.set(key, value);
  });

  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  let session = getSession(sid);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const send = (access?: string) => {
    const headers = new Headers(baseHeaders);
    if (access) headers.set("authorization", `Bearer ${access}`);
    return fetch(target, { method: req.method, headers, body, redirect: "manual" });
  };

  let upstream = await send(session?.access);
  // Transparent refresh-and-retry once on expiry.
  if (upstream.status === 401 && sid && session) {
    const refreshed = await refreshSession(sid, session);
    if (refreshed) {
      session = refreshed;
      upstream = await send(session.access);
    }
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const HEAD = proxy;

export const dynamic = "force-dynamic";
