# syntax=docker/dockerfile:1.7
# =============================================================================
# GutCall — Next.js UI (gutcallfun-ui)
# =============================================================================
# BUILD CONTEXT IS THE REPO ROOT:
#     docker build -f apps/gutcallfun-ui/Dockerfile .
# (npm-workspaces lockfile lives there — see the core Dockerfile's note.)
#
# Relies on `output: "standalone"` + `outputFileTracingRoot` in next.config.ts.
# The tracing root is what makes this work at all in a workspaces monorepo:
# dependencies are hoisted to the REPO-root node_modules, outside this app's
# directory, and tracing defaults to the project directory only.
# =============================================================================

# ---- deps --------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/gutcallfun-core/package.json apps/gutcallfun-core/
COPY apps/gutcallfun-ui/package.json apps/gutcallfun-ui/

# Core's manifest is present only to satisfy npm's workspace validation; -w
# keeps the backend's dependency tree out of this image.
RUN npm ci --include-workspace-root -w gutcallfun-ui

# ---- build -------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /repo

# NEXT_PUBLIC_* is INLINED INTO THE CLIENT BUNDLE AT BUILD TIME — it cannot be
# supplied at deploy time. That makes the socket URL an image-identity concern:
# an image built for preview is not reusable against another environment, and
# changing the URL requires a rebuild, not a redeploy. CI passes this via
# build-args (see .github/workflows/docker-images-build-publish.yml).
#
# The browser talks to socket.io DIRECTLY — Next cannot proxy a WebSocket
# upgrade — so this must be the backend's PUBLIC origin, never internal
# service DNS.
#
# THE DEFAULTS BELOW ARE LOAD-BEARING, not decoration. `ENV FOO=${FOO}` with an
# unset ARG sets FOO to the EMPTY STRING, and the app reads these with `??`,
# which falls back only on null/undefined — never on "". An unset arg therefore
# produced `new Connection("")` and crashed prerendering of /profile. Defaulting
# each ARG to the exact value src/services/api/config.ts falls back to keeps a
# no-build-arg image behaving like a plain local build.
ARG NEXT_PUBLIC_WS_URL=http://localhost:3000
ARG NEXT_PUBLIC_SOLANA_RPC=https://api.mainnet-beta.solana.com
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_SOLANA_RPC=${NEXT_PUBLIC_SOLANA_RPC}
ENV NEXT_TELEMETRY_DISABLED=1

# Deliberately NOT setting NEXT_PUBLIC_API_URL: leaving it unset makes
# API_BASE_URL fall back to the same-origin "/api" BFF proxy, which is the
# correct production path — it keeps the session JWT server-side.

COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json turbo.json ./
COPY apps/gutcallfun-ui ./apps/gutcallfun-ui

RUN npm run build -w gutcallfun-ui

# ---- runner ------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /repo

ENV NODE_ENV=production
# server.js honours both; HOSTNAME must be 0.0.0.0 (not localhost) or Traefik
# cannot reach into the container.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S app && adduser -S app -G app

# The standalone bundle nests under its workspace path, so the entrypoint is
# apps/gutcallfun-ui/server.js — verified against the actual build output.
COPY --from=build --chown=app:app /repo/apps/gutcallfun-ui/.next/standalone ./
# standalone deliberately omits these two; server.js serves them once present.
COPY --from=build --chown=app:app /repo/apps/gutcallfun-ui/.next/static ./apps/gutcallfun-ui/.next/static
COPY --from=build --chown=app:app /repo/apps/gutcallfun-ui/public ./apps/gutcallfun-ui/public

USER app

EXPOSE 3000

CMD ["node", "apps/gutcallfun-ui/server.js"]
