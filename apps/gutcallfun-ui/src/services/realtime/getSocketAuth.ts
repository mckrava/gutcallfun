/**
 * AUTH SEAM #2 (WebSocket). Returns the socket.io `auth` payload for the
 * handshake. The Next server route /api/ws-ticket reads the server-side session
 * and mints a short-lived, single-use ticket from the JWT — so only the
 * ephemeral ticket reaches the browser and the socket, never the JWT.
 *
 * Resolved lazily before every (re)connect (see createSocket), so a fresh
 * ticket is minted each time. Returns `{}` when unauthenticated — the gateway
 * then disconnects the socket, which is the intended default-deny behaviour.
 */
export async function getSocketAuth(): Promise<Record<string, unknown>> {
  try {
    const res = await fetch("/api/ws-ticket");
    if (!res.ok) return {};
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ? { ticket: data.ticket } : {};
  } catch {
    return {};
  }
}
