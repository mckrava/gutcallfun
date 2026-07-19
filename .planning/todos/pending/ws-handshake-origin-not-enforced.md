---
title: socket.io handshake does not actually reject foreign origins (WS-03 / D-06)
created: 2026-07-18
source: Phase 02.1 verification (02.1-VERIFICATION.md, 9/10 must-haves)
related_requirements: [WS-03]
resolves_phase: 5
severity: hardening — not exploitable for user data today, but the shipped contract doc overstates the guarantee
accepted_gap: true
accepted_by: user decision, 2026-07-18 — judged non-critical for the hackathon demo; Phase 02.1 completed with this gap open
---

## The gap

`apps/gutcallfun-core/src/modules/realtime/realtime.gateway.ts:31` configures:

```ts
cors: { origin: process.env.WEB_APP_ORIGIN, credentials: false },
```

socket.io's `cors.origin` only sets the `Access-Control-Allow-Origin` **response header**. It
installs no server-side handshake guard. There is no `allowRequest` hook anywhere in the gateway.

**Live-verified during Phase 02.1 verification, two independent ways** — a real `socket.io-client`
and a raw `curl` against the engine.io polling endpoint, both presenting
`Origin: http://evil.example.com`. Both completed the handshake and received live `snapshot` and
`game_event` payloads, identical to a legitimate client.

## Why it was accepted rather than fixed

**Do NOT rely on "browsers enforce CORS" here — that reasoning is wrong and was explicitly
corrected during this phase.** CORS does not apply to the WebSocket upgrade. It applies only to
socket.io's *polling* transport (an XHR). A client — including a browser page on any origin —
that connects with `transports: ['websocket']` skips polling entirely, and browsers send the
`Origin` header on a WS handshake without enforcing any allow/deny decision. Origin control for
a WS gateway MUST be enforced server-side. The verifier connected exactly this way.

The gap was accepted on **impact**, not on any belief that it is blocked:

- Nothing behind the socket is authenticated or user-specific in Phase 02.1 — the gateway serves
  deterministic mock fixtures only. No real money, no user data, no wallet state, no auth. What
  leaks today is fake data that is already public-equivalent.
- Phase 02.1 is a contract-freezing phase; Phase 5 re-implements the gateway against the real
  state machine and is the natural place to add the guard.

**This becomes a genuine vulnerability the moment the gateway serves real per-user state.** Any
web page anywhere could open a session and read it. Fix before Phase 5 ships anything
user-scoped over the socket — treat it as blocking for that phase, not optional.

## What a fix requires

1. An `allowRequest` hook (or equivalent handshake guard) that inspects
   `handshake.headers.origin` and **disconnects** a mismatched origin, rather than only
   labelling the response.
2. A negative-path e2e assertion — `test/realtime.e2e-spec.ts` currently exercises only the
   happy path, which is why this slipped through the phase's own 40/40 green suite.
3. Reconcile the docs: `docs/WS-CONTRACT.md:20-21` currently claims

   > "the socket.io handshake only succeeds from the origin configured in the backend's
   > `WEB_APP_ORIGIN` environment variable"

   That is **false as written** for non-browser clients. Either make the code match the doc
   (preferred) or soften the doc to "browsers are prevented from connecting from other origins."

## Related: UI dev-server port is not pinned

Not a bug in this repo's backend, but the same origin config is order-dependent in practice and
will look like a WS failure if it goes wrong:

- Backend runs on `PORT=3000`; `WEB_APP_ORIGIN=http://localhost:3001`.
- `apps/gutcallfun-ui`'s `dev` script is bare `next dev`, which **defaults to port 3000** — the
  backend's port.
- It only lands on 3001 by accident: if the backend is already bound to 3000, Next.js
  auto-increments. Start the UI first and it takes 3000, and the UI then ends up on an origin the
  backend does not allow — at which point the browser *will* block the handshake.

**Decision (2026-07-18):** the UI app folder is deliberately not modified from the backend
workstream. The UI developer has been notified to run the dev server on port 3001. If this
recurs, the durable fix is `"dev": "next dev -p 3001"` in `apps/gutcallfun-ui/package.json`,
owned by the frontend workstream.
