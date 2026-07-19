# syntax=docker/dockerfile:1.7
# =============================================================================
# GutCall — NestJS backend (gutcallfun-core)
# =============================================================================
# BUILD CONTEXT IS THE REPO ROOT, not this directory:
#     docker build -f apps/gutcallfun-core/Dockerfile .
# npm workspaces keeps a single package-lock.json at the root and hoists nearly
# every dependency there, so a context rooted at apps/gutcallfun-core could not
# produce a reproducible install. CI passes `context: .` for the same reason.
#
# Node 24 (Active LTS) per the project stack decision; the root package.json
# only floors at >=22.12.0, so 24 satisfies it. Alpine throughout — the build
# and runtime stages MUST share a libc, or native modules compiled against musl
# would be loaded by a glibc runtime.
# =============================================================================

# ---- deps: full install (incl. devDeps — the Nest CLI compiles) -------------
FROM node:24-alpine AS deps
WORKDIR /repo

# Manifests only, so this layer caches until a dependency actually changes.
# The UI manifest is copied even though it is never installed: `npm ci`
# validates the lockfile against every workspace declared in the root
# package.json, and a missing member makes it refuse to run.
COPY package.json package-lock.json ./
COPY apps/gutcallfun-core/package.json apps/gutcallfun-core/
COPY apps/gutcallfun-ui/package.json apps/gutcallfun-ui/

# -w limits installation to this workspace: the UI's Solana/Next tree is large
# and has no business in the backend image.
RUN npm ci --include-workspace-root -w gutcallfun-core

# ---- build: TypeScript -> dist ----------------------------------------------
FROM node:24-alpine AS build
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json turbo.json ./
COPY apps/gutcallfun-core ./apps/gutcallfun-core

# `nest build` -> apps/gutcallfun-core/dist (tsconfig outDir), which contains
# both dist/main.js and the dist/db + dist/models trees the TypeORM DataSource
# globs at runtime.
RUN npm run build -w gutcallfun-core

# ---- prod-deps: the same install minus devDependencies ----------------------
FROM node:24-alpine AS prod-deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/gutcallfun-core/package.json apps/gutcallfun-core/
COPY apps/gutcallfun-ui/package.json apps/gutcallfun-ui/

# `typeorm` and `@nestjs/config` are runtime dependencies, so the typeorm CLI
# (used by the stack's one-shot migrate service) and dotenv both survive here.
# mkdir guarantees the workspace-local node_modules exists even when npm hoists
# everything to the root — COPY fails on a missing source path.
RUN npm ci --omit=dev --include-workspace-root -w gutcallfun-core \
 && mkdir -p apps/gutcallfun-core/node_modules

# ---- runner ------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /repo

ENV NODE_ENV=production
# PORT is read by main.ts (`app.listen(process.env.PORT ?? 3000)`); Nest's
# Express adapter binds 0.0.0.0 by default, which is what lets Traefik reach it.
ENV PORT=3000

# Unprivileged runtime user.
RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps --chown=app:app /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /repo/apps/gutcallfun-core/node_modules ./apps/gutcallfun-core/node_modules
COPY --from=build     --chown=app:app /repo/apps/gutcallfun-core/dist ./apps/gutcallfun-core/dist
COPY --chown=app:app package.json ./package.json
COPY --chown=app:app apps/gutcallfun-core/package.json ./apps/gutcallfun-core/package.json

USER app

# The migrate one-shot resolves dist/src/db/data-source.js relative to this dir.
WORKDIR /repo/apps/gutcallfun-core

EXPOSE 3000

# NOTE THE dist/src/ PREFIX. tsconfig compiles scripts/ alongside src/, so
# TypeScript widens rootDir to the app root and the entrypoint lands at
# dist/src/main.js — NOT dist/main.js. (package.json's `start:prod` still says
# `node dist/main`; it is wrong for the same reason but never runs, since dev
# uses `nest start`.) Verified against the built image, not assumed.
#
# No HEALTHCHECK: the app exposes no health route, and a probe that always
# passes is worse than none. Swarm convergence relies on restart_policy.
CMD ["node", "dist/src/main"]
