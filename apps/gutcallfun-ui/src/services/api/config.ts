// The REST base the browser calls. Defaults to the same-origin Next BFF proxy
// (src/app/api/[...path]) — so requests go through the Next server,
// where the auth agent will inject `Authorization` (keeping the JWT server-side).
// Override with NEXT_PUBLIC_API_URL to hit the backend directly instead.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// socket.io base — the browser connects here DIRECTLY (Next cannot proxy the WS
// upgrade). Same origin/port as the backend REST in local dev.
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3000";

// Solana RPC endpoint for the wallet adapter's ConnectionProvider. Sign-in only
// signs a message (no on-chain calls), so this endpoint is never actually hit —
// it just satisfies the provider API. Override via NEXT_PUBLIC_SOLANA_RPC.
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
