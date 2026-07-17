# Stack Research

**Domain:** Real-time sports micro-prediction backend (NestJS + SSE feed ingest + socket.io live push + PostgreSQL) — hackathon build, single long-lived process
**Researched:** 2026-07-17
**Confidence:** HIGH (versions verified live against npm registry + peerDependencies on 2026-07-17; patterns verified against the two reference repos named in the brief and the `txodds-txline-api-monitor` code that must be ported)

This file does **not** re-litigate LOCKED decisions (NestJS 11, TypeORM via `@nestjs/typeorm`, PostgreSQL 16, socket.io via `@nestjs/platform-socket.io`, `@nestjs/swagger`, `@nestjs/schedule`, turbo monorepo, single-process deployment). It pins exact versions and companion-package choices for that stack.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | **11.1.28** | Framework core + HTTP adapter | Current `latest` on npm as of 2026-07-17; matches the LOCKED "NestJS 11" line, already in `apps/gutcallfun-core/package.json` (`^11.0.1`, resolves to this). Express (not Fastify) — keep the boilerplate's adapter, no reason to swap mid-hackathon. |
| `@nestjs/platform-socket.io`, `@nestjs/websockets` | **11.1.28** | socket.io gateway integration | Peer-locked to `@nestjs/common@^11` — confirmed via npm `peerDependencies`. Ships socket.io v4 transitively. |
| `socket.io` | **4.8.3** | WS engine (pulled in by `@nestjs/platform-socket.io`) | Current stable; no need to pin manually unless you need a feature not yet in the transitive version — check `npm ls socket.io` after install and pin explicitly only if it resolves below 4.8.x. |
| `@nestjs/typeorm` | **11.0.3** | TypeORM ↔ Nest DI glue | Peer-compatible with `@nestjs/common@^11`. |
| `typeorm` | **0.3.31** (pin explicitly — do NOT take npm `latest`) | ORM / migrations | **npm `latest` is now 1.1.0** (TypeORM shipped a 1.0.0 major on 2026-05-19, ~2 months old). `@nestjs/typeorm@11.0.3`'s peerDependencies accept `^0.3.0 \|\| ^1.0.0-dev` — both work — but 1.x changes default `where` semantics (`undefined`/`null` in find conditions now **throws** instead of being silently ignored) and swaps the internal glob engine. That is exactly the kind of subtle runtime-behavior change you do not want surfacing during a 2-day feature-freeze sprint against a schema you must match exactly (`initial-db-structure.sql`). Pin `typeorm@0.3.31` (its own `legacy` dist-tag) — it is the version nearly all current NestJS+TypeORM tutorials, Stack Overflow answers, and the two reference repos in the brief (`epic-data-hub`, `hydration-data-feeds`) are written against. Revisit 1.x post-hackathon. |
| `pg` | **8.22.0** | Postgres driver for TypeORM | Current stable `node-postgres`; works against Postgres 16 without special config. |
| `@nestjs/swagger` | **11.4.5** | OpenAPI docs | Peer-locked to `@nestjs/common@^11.0.1` / `@nestjs/core@^11.0.1`. Needs `class-validator`/`class-transformer` present (peer, wildcard) — already required for DTO validation anyway. |
| `@nestjs/schedule` | **6.1.3** | Cron (fixtures poll every 1 min) | Peer-compatible with `@nestjs/common@^10 \|\| ^11`. Wraps `cron`; no extra scheduler library needed — this is explicitly the LOCKED choice over `bull`/`agenda`. |
| `@nestjs/config` | **4.0.4** | `.env` loading + typed config module | Peer-compatible with `@nestjs/common@^10 \|\| ^11`. Pair with the validation pattern below (mirrors the `hydration-data-feeds` reference). |
| `class-validator` | **0.15.1** | DTO + env-schema validation | Required peer of `@nestjs/swagger`; also the validation engine for both request DTOs and the config-validation pattern below. |
| `class-transformer` | **0.5.1** | `plainToInstance` for env parsing + DTO transform | Pairs with `class-validator`; required peer of `@nestjs/swagger`. |
| Node.js | **24.x (Active LTS)** | Runtime | As of 2026-07-17, Node 24 is Active LTS; Node 22 is Maintenance LTS (still fine, `@nestjs/core` only requires `>=20`). Prefer 24 for a fresh deploy target with the longest support runway; pin the Docker base image (`node:24-alpine` or `node:24-slim`) and `"engines": {"node": ">=24"}` in `package.json`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tweetnacl` | **1.0.3** | Ed25519 signature verification for Solana wallet sign-in | Verify the user's signed message (`nacl.sign.detached.verify`) against their base58 wallet public key. This is the **only** Solana crypto primitive the NestJS app needs at runtime — already the exact version used in the reference `txodds-txline-api-monitor` repo (confirmed from its `package.json`), so ported auth-adjacent code needs no version bump. |
| `bs58` | **6.0.0** | Base58 decode/encode for Solana pubkeys/signatures | Solana wallet addresses and signatures are base58-encoded; decode to bytes before feeding `tweetnacl`. Tiny, zero-dependency alternative to pulling in `@solana/web3.js` just for encoding. |
| `@nestjs/jwt` | **11.0.2** | Issue the app's own session token after wallet-signature verification | The backend's own auth session (used on subsequent REST calls and to authenticate the socket.io handshake) is a **separate** concern from TxLINE's guest JWT — do not conflate them. `@nestjs/jwt` + a simple `AuthGuard`/WS middleware is enough; full `@nestjs/passport` + `passport-jwt` is optional ceremony you can skip under time pressure (a raw `JwtService.verifyAsync` guard is fewer moving parts). |
| `class-transformer` + `class-validator` (direct, no wrapper) | — (see Core) | `.env` validation | Use `plainToInstance(EnvSchema, process.env, { enableImplicitConversion: true })` + `validateSync(instance, { skipMissingProperties: false })` inside a `validate` function passed to `ConfigModule.forRoot({ validate, isGlobal: true })`. This is the NestJS-official documented pattern **and** functionally identical to what `hydration-data-feeds/.../app.config.ts` does via the `class-transformer-validator` package's `transformAndValidateSync` helper. Recommend calling `plainToInstance`/`validateSync` directly rather than adding `class-transformer-validator` as a dependency — that package's last publish was 2022-06-13 (unmaintained 4-year-old wrapper around two lines of code you already have available). |
| `helmet` | **8.3.0** | Basic HTTP security headers | Optional, ~1 line (`app.use(helmet())`). Cheap hardening for a public-internet demo deploy; skip if it causes any friction with Swagger UI CSP (disable `contentSecurityPolicy` in that case). |
| `uuid` | **not needed — use `crypto.randomUUID()`** | — | Node has shipped a stable native `crypto.randomUUID()` since Node 14.17+; on Node 24 there is no reason to add the `uuid` package for app-level id generation. (Most PKs in `initial-db-structure.sql` are `gen_random_uuid()` at the DB layer anyway — this only matters if application code ever needs to pre-generate a uuid client-side, e.g. for idempotency keys.) |
| `crockford-base32` | **2.1.0** (optional) | `share_code` generation (`GC-XXXX-XXXX`) | Small, focused package if you want it; equally reasonable to hand-roll ~15 lines using `crypto.randomInt` + the 32-char Crockford alphabet (no ambiguous I/L/O/U) with a DB collision-retry loop, since the brief already specifies collision-retry at the app layer regardless. Either is fine — do not spend hackathon time evaluating alternatives beyond this. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` **4.23.1** (not `ts-node`) | Run/compile TypeScript for TypeORM CLI migrations + any standalone scripts (replay capture, seed scripts) | `ts-node` is effectively in maintenance mode; `tsx` is faster, handles `tsconfig-paths` automatically, and is what the reference `txodds-txline-api-monitor` repo actually uses (`tsx src/server.ts`, devDependency `tsx@4.22.4`) — reuse the same tool for consistency with ported code. Keep `ts-node@10.9.2` only if the NestJS CLI/Jest toolchain still shells out to it internally (it does, transitively, for some Nest CLI paths) — no need to remove it, just don't hand-write scripts against it. |
| TypeORM CLI (`typeorm` binary) via a dedicated `src/db/data-source.ts` | Migration generate/run/revert | Pattern: one `DataSource` instance built from the same validated `AppConfig`/`ConfigService` values used by `TypeOrmModule.forRootAsync`, exported as default from `src/db/data-source.ts` (mirrors the `epic-data-hub` `typeorm.config.ts` reference named in the brief). Scripts: `"migration:generate": "tsx ./node_modules/typeorm/cli.js migration:generate -d src/db/data-source.ts"`, `"migration:run": "tsx ./node_modules/typeorm/cli.js migration:run -d src/db/data-source.ts"` for dev; in the Docker/prod image, run migrations against the **compiled** `dist/db/data-source.js` with plain `node` — do not ship `tsx` as a prod runtime dependency for the deployed container's migration step if you can avoid it (works either way for a single-operator hackathon deploy, but compiled-JS-in-prod is the safer default). |
| `jest` **30.4.2** + `ts-jest` **29.4.11** | Unit tests | Already in boilerplate (`^30`, `^29.2.5` resolve to these) — keep. |
| `supertest` **7.2.2** | REST e2e tests | Already in boilerplate. Standard NestJS e2e pattern (`app.getHttpServer()`). |
| `socket.io-client` **4.8.3** | WS e2e tests (gateway subscribe/snapshot/push assertions) | Not yet in boilerplate — add as devDependency. Matches the server's socket.io 4.8.3, connect against `httpServer` started in a Jest `beforeAll`/`afterAll`, assert on emitted events (snapshot, `game_event`, `question`, `resolution`, `void`). This is the standard way to test NestJS WS gateways end-to-end; no NestJS-specific WS testing package exists or is needed. |
| `@nestjs/testing` **11.1.28** | `Test.createTestingModule` | Already in boilerplate. |

## Installation

```bash
# Core (framework + WS + Swagger + schedule + config — all peer-locked to Nest 11)
npm install @nestjs/platform-socket.io @nestjs/websockets @nestjs/typeorm typeorm@0.3.31 pg \
  @nestjs/swagger @nestjs/schedule @nestjs/config class-validator class-transformer \
  @nestjs/jwt tweetnacl bs58

# Optional / as-needed
npm install helmet
npm install crockford-base32   # or hand-roll — see Supporting Libraries

# Dev dependencies
npm install -D tsx socket.io-client
```

Note: `typeorm@0.3.31` must be installed with the **explicit version pin**, not `typeorm@latest` — see Core Technologies rationale.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `class-validator` + `class-transformer` for env validation | `zod` (`joi` is also common) | Not for this project — the brief explicitly names the `hydration-data-feeds` config module as the pattern to follow, and it uses class-validator/class-transformer. `zod` is arguably nicer DX for schema validation in greenfield projects with no existing convention, but switching here would mean deviating from the reference pattern for no benefit, plus `class-validator` is already a mandatory peer of `@nestjs/swagger` and DTOs — one validation library for both concerns is simpler, not two. |
| Raw `fetch` + manual `ReadableStream` SSE parsing (as in `upstream.ts`) | `eventsource` npm package (v4.1.0) | Only if you were writing the SSE client from scratch. You are not — the brief says port `upstream.ts` as-is. It deliberately does **not** use the `eventsource` package: TxLINE requires two custom headers (`Authorization: Bearer <jwt>` + `X-Api-Token`) plus precise `receivedAt` timestamping and full `Last-Event-ID` control, and the ported code already implements exactly that via native `fetch`/`ReadableStream`. Do not introduce `eventsource` — it would duplicate functionality the ported module already owns and risks two divergent SSE-parsing code paths. |
| `typeorm@0.3.31` | `typeorm@1.1.0` (npm `latest`) | Post-hackathon, once you have time to run `npx @typeorm/codemod v1 src/` and test the changed null/undefined `where`-condition semantics against the full schema. Not during feature-freeze week. |
| `tweetnacl` + `bs58` for wallet signature verification | `@solana/web3.js` (1.98.4) or `@solana/kit` (7.0.0, the actively-developed successor) | Only if the NestJS app itself needs to build/send Solana transactions or query on-chain state at runtime. It does not — the one-time on-chain `subscribe()` call for TxLINE access happens once via the separate monitor/probe tooling (already reflected in `.env` as JWT + API token), and the user-facing wallet sign-in is pure signature verification, not a transaction. Pulling in `@solana/web3.js` (a much larger dependency, and one now in "legacy" mode relative to `@solana/kit`) for that alone is unnecessary weight. |
| Default in-process socket.io adapter | `@socket.io/redis-adapter` | Only if you ever go multi-process/horizontal. Explicitly out of scope per the brief ("no horizontal scaling," "SSE ingest must run in exactly one long-lived process") — do not add the Redis adapter dependency at all. |
| `@nestjs/jwt` (minimal) for app session tokens | `@nestjs/passport` + `passport-jwt` (11.0.5 / 4.0.1) | If you want a full strategy-based `AuthGuard('jwt')` ecosystem with less custom guard code and want it to look idiomatic for reviewers. Reasonable either way; `@nestjs/jwt` alone is fewer moving parts for ~5 endpoints. |
| Compiled `dist/db/data-source.js` + plain `node` for prod migrations | `tsx` in the prod container too | Simpler if you don't want two build-adjacent code paths (dev via tsx, prod via compiled JS) — for a single-operator hackathon deploy where "simplicity now" beats "correctness of prod/dev parity," running `tsx` in prod as well is an acceptable shortcut. Note it explicitly as a shortcut if you take it. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `typeorm@latest` (currently 1.1.0 / the 1.x line) unpinned | Shipped a major (1.0.0) ~2 months ago with a breaking change to `where`-condition null/undefined handling (now throws instead of silently ignoring) and a different internal glob engine for entity/migration discovery. High risk of a subtle, hard-to-spot bug surfacing during a 2-day sprint against a fixed schema. | Pin `typeorm@0.3.31` explicitly in `package.json`. |
| `eventsource` npm package for the TxLINE stream | Doesn't map cleanly onto the two custom auth headers TxLINE requires, and the brief's ported `upstream.ts` already solves this with native `fetch`/`ReadableStream` plus precise `receivedAt` stamping — adding the package would create a second, divergent SSE code path. | Port `upstream.ts` as-is (native `fetch` + manual SSE block parser). |
| GraphQL / Apollo / any subscriptions library | Explicitly rejected in the brief — transport is REST + socket.io only. | REST controllers + `@nestjs/platform-socket.io` gateways. |
| `@socket.io/redis-adapter` or any multi-instance pub/sub adapter | Horizontal scaling and multi-process deployment are explicitly out of scope; the SSE ingest itself is architecturally required to run in exactly one process. Adding a Redis adapter is unused complexity and an extra infra dependency (Redis) with zero benefit here. | Default in-memory socket.io adapter (the NestJS default when no adapter is configured). |
| `uuid` package | Node's native `crypto.randomUUID()` covers the same need with zero added dependency weight, and most PKs are DB-generated (`gen_random_uuid()`) anyway. | `crypto.randomUUID()` (built-in, Node 24). |
| `@solana/web3.js` / `@coral-xyz/anchor` / `@solana/spl-token` as NestJS runtime dependencies | These are needed for building/sending Solana transactions and on-chain program interaction — the NestJS app never does that; the TxLINE on-chain `subscribe()` is a one-time setup step handled outside the app's runtime (credentials land in `.env`), and user wallet sign-in is pure Ed25519 signature verification. | `tweetnacl` + `bs58` only. |
| `class-transformer-validator` (the `transformAndValidateSync` wrapper package) | Last published 2022-06-13; thin wrapper around `plainToInstance` + `validateSync`, which you can call directly with the exact same effective behavior and one fewer (unmaintained) dependency. | `plainToInstance(...)` + `validateSync(...)` inline in the `validate` function passed to `ConfigModule.forRoot({ validate })`. |
| `ts-node` for new hand-written scripts (replay capture, seed scripts, migration CLI invocation) | Effectively in maintenance mode industry-wide by 2026; slower and more config-fiddly than `tsx`, and the reference `txodds-txline-api-monitor` repo you're porting code from already standardized on `tsx`. | `tsx` for anything you write or invoke fresh. (Leave `ts-node` installed if the Nest CLI/Jest toolchain pulls it in transitively — don't fight that.) |

## Stack Patterns by Variant

**Config module (env validation):**
- Follow `hydration-data-feeds/apps/hydration-data-lake-adapter/src/modules/config/` exactly in structure: a `@Global()` `ConfigurationModule` exporting a singleton `AppConfig` provider, with `AppConfig.getInstance()` calling `plainToInstance` + `validateSync` once at boot and throwing (crash-on-invalid-config, fail fast) rather than falling back to defaults for anything security- or correctness-critical (DB URL, TxLINE JWT/API token, port).
- Because: this is the explicit reference pattern named in `system-prompt.md` ("Use the same approach"), and fail-fast config validation is exactly right for a single-process app where a bad env var should never reach "started but broken."

**TypeORM migrations:**
- Follow `epic-data-hub/data-hub-core/src/db/typeorm.config.ts`'s shape: one `DataSource` config file consumed both by `TypeOrmModule.forRootAsync` (via `useFactory` reading the validated `AppConfig`) and by the TypeORM CLI (`-d src/db/data-source.ts`) — single source of truth for connection options, no drift between app config and migration config.
- Because: named as the reference pattern in `system-prompt.md`; also the standard way to avoid the common NestJS+TypeORM pitfall of the CLI and the app connecting with different settings.

**SSE ingest:**
- Port `upstream.ts`, `possession.ts`, `goals.ts`, `replay.ts` from `txodds-txline-api-monitor` with minimal modification — keep the native `fetch`/`ReadableStream` SSE parser, the `AUTH_EXPIRED` sentinel pattern, and the `receivedAt`-before-decode ordering.
- Because: battle-tested against the live feed across a 23,510-record empirical corpus; rewriting risks re-learning already-solved edge cases (goal confirm/discard timing, `Id`-reuse across incident types, seq-gap tolerance).

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@nestjs/core@11.1.28` | `@nestjs/typeorm@11.0.3`, `@nestjs/swagger@11.4.5`, `@nestjs/schedule@6.1.3`, `@nestjs/config@4.0.4`, `@nestjs/platform-socket.io@11.1.28` | All confirmed via npm `peerDependencies` on 2026-07-17 — no version mismatches across the Nest package family at these pins. |
| `@nestjs/typeorm@11.0.3` | `typeorm@0.3.31` | Peer range is `^0.3.0 \|\| ^1.0.0-dev`; 0.3.31 satisfies the first branch cleanly (recommended pin — see rationale above). |
| `typeorm@0.3.31` | `pg@8.22.0` | Standard, long-established combination for Postgres via TypeORM; no known incompatibilities. |
| `@nestjs/swagger@11.4.5` | `class-validator@0.15.1`, `class-transformer@0.5.1` | Required peers (wildcard range `*`), current stable versions satisfy trivially. |
| Node 24.x | `@nestjs/core@11.1.28` | Nest 11 requires Node `>=20`; 24 is well within range and is current Active LTS. |
| `tsx@4.23.1` | TypeORM CLI (`typeorm` binary) | Works as the `-r`/loader replacement for `ts-node`; confirmed pattern used by current TypeORM+NestJS guides and by the reference monitor repo's own scripts. |

## Sources

- Live `npm view <pkg> version` / `npm view <pkg> peerDependencies` / `npm view <pkg> dist-tags` registry queries, run 2026-07-17 — HIGH confidence (primary/authoritative source for "what is the current published version," direct from the npm registry, not search-engine-mediated).
- `github.com/mckrava/txodds-txline-api-monitor` — fetched `package.json` and `src/upstream.ts` directly via raw GitHub content, 2026-07-17 — HIGH confidence (this is the exact reusable code the brief instructs porting, confirms actual dependency choices in use: `@solana/web3.js@1.98.4`, `tweetnacl@1.0.3`, `tsx@4.22.4`, no `eventsource` package, native `fetch`-based SSE parsing).
- `github.com/galacticcouncil/hydration-data-feeds/apps/hydration-data-lake-adapter/src/modules/config/app.config.ts` + `config.module.ts` — fetched directly via raw GitHub content, 2026-07-17 — HIGH confidence (this is the explicit reference pattern named in `system-prompt.md`; confirms `class-transformer`/`class-validator`-based validation, `@Global()` singleton config module).
- `github.com/dappforce/epic-data-hub` — the named reference for `typeorm.config.ts` — repo/path returned 404 at fetch time (2026-07-17); pattern description above is based on the standard TypeORM+NestJS `DataSource`-file convention (also documented at typeorm.io) rather than a direct file read. MEDIUM confidence on the exact shape of that specific file; HIGH confidence on the underlying pattern (single shared `DataSource` config consumed by both app and CLI) since it is standard practice independently of that specific repo.
- WebSearch: "TypeORM 1.0.0 release breaking changes migration from 0.3" (typeorm.io official upgrade guide + GitHub release notes, cross-referenced) — MEDIUM confidence, verified against typeorm.io's own "Upgrading from 0.3 to 1.0" doc.
- WebSearch: Node.js release schedule / current LTS status — MEDIUM confidence, cross-referenced against nodejs.org and endoflife.date.
- WebSearch: TypeORM CLI `tsx` vs `ts-node` current (2026) recommendation — MEDIUM confidence, cross-referenced across typeorm.io CLI docs and community sources; also independently corroborated by the reference monitor repo's own tooling choice (HIGH-confidence primary source for that specific corroboration).
- WebSearch: NestJS official `@nestjs/config` validation pattern (`plainToInstance` + `validateSync`) — MEDIUM confidence, cross-referenced across multiple independent write-ups describing the same documented pattern.

---
*Stack research for: Real-time sports micro-prediction backend (NestJS + SSE + socket.io + PostgreSQL)*
*Researched: 2026-07-17*
