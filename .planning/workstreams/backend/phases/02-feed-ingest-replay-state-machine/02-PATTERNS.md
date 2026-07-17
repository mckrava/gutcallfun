# Phase 2: Feed Ingest, Replay & State Machine - Pattern Map

**Mapped:** 2026-07-17
**Files analyzed:** 17 (new/modified)
**Analogs found:** 12 exact/role-match / 17 total (5 have no in-repo analog — external port sources, flagged below)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/config/app-config.schema.ts` (extend) | config | transform | `src/config/app-config.schema.ts` (itself, Phase 1) | exact (modify-in-place) |
| `src/modules/ingest/ingest.module.ts` | provider/module | event-driven | `src/modules/core/database.module.ts` | role-match |
| `src/modules/ingest/fixtures/txline-fixtures.client.ts` | service | request-response | none in-repo (external `upstream.ts` auth pattern) | no analog — see below |
| `src/modules/ingest/fixtures/fixtures-cron.service.ts` | service | batch | none in-repo (no existing `@Cron` usage) | no analog — see below |
| `src/modules/ingest/stream/upstream.ts` | service | streaming | none in-repo — **ported verbatim** from `txodds-txline-api-monitor` | no analog (port source) |
| `src/modules/ingest/stream/stream-manager.service.ts` | service | streaming | `src/modules/core/database.module.ts` (`OnApplicationShutdown` absent — new pattern) | partial-match |
| `src/modules/ingest/stream/replay-arm-cron.service.ts` | service | batch | `fixtures-cron.service.ts` (sibling, same phase) | role-match (internal) |
| `src/modules/ingest/replay/replay.ts` | service | event-driven | none in-repo — **ported** from `txodds-txline-api-monitor`, `maxGapMs` override per D-04 | no analog (port source) |
| `src/modules/ingest/replay/historical.client.ts` | service | request-response | `txline-fixtures.client.ts` (sibling, same phase) | role-match (internal) |
| `src/modules/ingest/replay/replay-source.service.ts` | service | event-driven | none in-repo | no analog |
| `src/modules/ingest/persistence/event-ingest.service.ts` | service | CRUD | `src/db/data-source.ts` (`InsertQueryBuilder` conventions) + `game-event.entity.ts` (target shape) | role-match |
| `src/modules/ingest/state/possession.ts` | utility (state machine) | transform | none in-repo — **ported** from `txodds-txline-api-monitor` | no analog (port source) |
| `src/modules/ingest/state/goals.ts` | utility (state machine) | transform | none in-repo — **ported** from `txodds-txline-api-monitor` | no analog (port source) |
| `src/modules/ingest/state/game-state.registry.ts` | store | CRUD | `src/modules/ingest/persistence/GameMutexRegistry` pattern (same phase, per-key Map) | role-match (internal) |
| `src/modules/ingest/state/game-state-rebuild.service.ts` | service | batch | `event-ingest.service.ts` (reuses same normalizer path) | role-match (internal) |
| `src/modules/ingest/events/game-stream-gap.emitter.ts` | provider (event bus) | event-driven | none in-repo (first event-emitter provider) | no analog |
| `src/models/game/*.entity.ts` (read, not modified) | model | CRUD | `game.entity.ts`, `game-event.entity.ts` (Phase 1, already final) | exact — read-only reference for column names |

## Pattern Assignments

### `src/config/app-config.schema.ts` (config, transform)

**Analog:** itself (`apps/gutcallfun-core/src/config/app-config.schema.ts`, Phase 1) — this phase **extends** the existing class, does not replace it.

**Full existing pattern** (lines 1-33):
```typescript
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false, require_protocol: true })
  DATABASE_URL: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  NODE_ENV: string = 'development';
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
```

**What to add (per RESEARCH.md Open Question 2 + Pitfall 6):** new required fields on `EnvironmentVariables` following the exact same `@Is*` decorator convention — `TXLINE_GUEST_JWT: string` (`@IsString()`), `TXLINE_API_TOKEN: string` (`@IsString()`), `PAST_FIXTURES_COUNT: number = 20` (`@IsOptional() @IsInt() @Min(1)`), and a `SERVICE_LEVEL_ID` startup assertion (`@IsInt()`, expect `12` — validate in a custom `@Validate` or check post-`validateSync` and throw if `!== 12`, matching this file's fail-fast philosophy: throw synchronously, no defaults for anything security/correctness-critical). Never log the JWT/token values (Security Domain V2 in RESEARCH.md) — the existing file has no logging of `DATABASE_URL` either, so extend without adding any `console.log`/`Logger` call for the new secrets.

---

### `src/modules/ingest/ingest.module.ts` (module, event-driven)

**Analog:** `src/modules/core/database.module.ts` + `src/app.module.ts` for import wiring.

**Module shape pattern** (`database.module.ts`, lines 1-21, full file):
```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ /* ... */ }),
    }),
  ],
})
export class DatabaseModule {}
```

**App wiring pattern** (`app.module.ts`, full file):
```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './modules/core/database.module';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```
`IngestModule` should be added as a third import in `app.module.ts` (`imports: [AppConfigModule, DatabaseModule, IngestModule]`), following config-then-database-then-feature ordering already established. `IngestModule` itself imports `ScheduleModule.forRoot()` (new, `@nestjs/schedule`) and `TypeOrmModule.forFeature([GameEntity, GameEventEntity])` for repository injection into its services — this repeats the same `forFeature` idiom Phase 1's `DatabaseModule` comment implies (`autoLoadEntities: true` + per-module `forFeature` for injected repos).

---

### `src/modules/ingest/persistence/event-ingest.service.ts` (service, CRUD)

**Analog:** `src/models/game/game-event.entity.ts` (target column shape) + `src/db/data-source.ts` (query builder conventions).

**Entity target shape** (`game-event.entity.ts`, lines 20-60, full class) — the insert `.values({...})` object in RESEARCH.md Pattern 1 must match exactly these column names/types (`gameId`, `type`, `payload`, `actionId`, `seq`, `confirmed`, `participant`, `statusId`, `feedTs`, `receivedAt` — the last one has a DB `default: () => 'now()'`, do not set it manually):
```typescript
@Column({ name: 'game_id', type: 'int' })
gameId: number;

@Column({ name: 'type', type: 'varchar' })
type: string;

@Column({ name: 'payload', type: 'jsonb' })
payload: Record<string, unknown>;

@Column({ name: 'action_id', type: 'int', nullable: true })
actionId: number | null;

@Column({ name: 'seq', type: 'int' })
seq: number;
```

**Idempotent insert pattern** (from RESEARCH.md Pattern 1, to be used verbatim as the insert shape):
```typescript
await this.dataSource
  .createQueryBuilder()
  .insert()
  .into(GameEventEntity)
  .values({ gameId, type: parsed.Action, payload: parsed, actionId: parsed.Id ?? null,
    seq: parsed.Seq, confirmed: parsed.Confirmed ?? null, participant: parsed.Participant ?? null,
    statusId: parsed.StatusId ?? null, feedTs: new Date(parsed.Ts) })
  .orIgnore()
  .execute();
```

**DataSource injection convention** (`data-source.ts`, lines 1-20, full file) — same `DataSource` instance shape used for both the app (`TypeOrmModule.forRootAsync`) and CLI migrations; inject `DataSource` via constructor (standard NestJS `@InjectDataSource()` or plain `DataSource` from `@nestjs/typeorm`) rather than constructing a second instance.

**stream_cursor same-transaction requirement (Pitfall 4):** the `game.stream_cursor` UPDATE must be wrapped in the same `queryRunner`/transaction as the `game_event` INSERT above — use `dataSource.transaction(async (manager) => { ...insert...; ...update... })`, not two separate `.execute()` calls against the bare `dataSource`.

---

### `src/modules/ingest/fixtures/fixtures-cron.service.ts` & `replay-arm-cron.service.ts` (service, batch)

**No in-repo analog** — this is the first `@Cron` usage in the codebase. Use RESEARCH.md Pattern 5 verbatim as the canonical shape (already vetted against the locked `@nestjs/schedule@6.1.3`):
```typescript
@Injectable()
export class FixturesCronService {
  @Cron(CronExpression.EVERY_MINUTE)
  async discoverFixtures() { /* GAME-01 */ }
}

@Injectable()
export class ReplayArmCronService {
  @Cron('*/15 * * * * *') // 6-field cron, seconds granularity
  async armScheduledReplays() { /* D-06 */ }
}
```
Inject `Repository<GameEntity>` (via `@InjectRepository(GameEntity)`, matching the `TypeOrmModule.forFeature` idiom) for the upsert-by-`fixture_id` logic (GAME-01) and the `is_replay=true AND status='scheduled' AND starts_at<=now()` poll query (D-06).

**Config injection convention** — mirror `database.module.ts`'s `ConfigService` constructor-injection pattern for reading `PAST_FIXTURES_COUNT`, TxLINE JWT/token, and `SERVICE_LEVEL_ID` inside the fixtures client.

---

### `src/modules/ingest/state/game-state.registry.ts` (store, CRUD)

**Analog:** RESEARCH.md Pattern 2 (`GameMutexRegistry`) — same `Map<number, T>`-keyed singleton shape, reused for the state registry:
```typescript
@Injectable()
export class GameMutexRegistry {
  private readonly mutexes = new Map<number, Mutex>();
  private forGame(gameId: number): Mutex {
    let m = this.mutexes.get(gameId);
    if (!m) { m = new Mutex(); this.mutexes.set(gameId, m); }
    return m;
  }
  async runExclusive<T>(gameId: number, fn: () => Promise<T>): Promise<T> {
    return this.forGame(gameId).runExclusive(fn);
  }
}
```
`GameStateRegistry` follows the identical `Map<gameId, GameState>` shape but needs an eviction hook for `finished`/`cancelled` games (Security Domain: unbounded Mutex/state map growth) — add a `remove(gameId)` method called from the state-machine's status-transition handler.

---

### `src/modules/ingest/stream/stream-manager.service.ts` (service, streaming)

**Analog pattern:** RESEARCH.md Pattern 4 (`AbortController` + `OnApplicationShutdown`) — first use of the shutdown-hook lifecycle interface in this codebase (`main.ts` already calls `app.enableShutdownHooks()`, line 6, but no service implements `OnApplicationShutdown` yet):
```typescript
@Injectable()
export class StreamManagerService implements OnApplicationShutdown {
  private readonly controllers = new Map<number, AbortController>();
  connect(gameId: number, url: string, headers: HeadersInit) {
    const controller = new AbortController();
    this.controllers.set(gameId, controller);
    return fetch(url, { headers, signal: controller.signal });
  }
  async onApplicationShutdown() {
    for (const controller of this.controllers.values()) controller.abort();
    await this.flushAllStreamCursors();
  }
}
```
`main.ts` (full file, 9 lines) already has `app.enableShutdownHooks()` wired — no change needed there; this service just needs to be a registered provider in `IngestModule` for the hook to reach it.

---

## Shared Patterns

### Config schema extension (fail-fast validation)
**Source:** `src/config/app-config.schema.ts` (Phase 1, full file, 33 lines)
**Apply to:** Any new env var this phase introduces (`TXLINE_GUEST_JWT`, `TXLINE_API_TOKEN`, `PAST_FIXTURES_COUNT`, `SERVICE_LEVEL_ID`)
```typescript
@IsOptional()
@IsInt()
@Min(0)
@Max(65535)
PORT: number = 3000;
```
Same `class-validator` decorator style; throw synchronously in `validate()` on any failure — never fall back to a default for TxLINE credentials.

### Module wiring order
**Source:** `src/app.module.ts` (full file)
**Apply to:** `IngestModule` registration — append after `DatabaseModule` in the `imports` array, preserving the existing config-then-database-then-feature order.

### Repository injection via `TypeOrmModule.forFeature`
**Source:** `src/modules/core/database.module.ts` (implied convention per RESEARCH.md Reusable Assets note: "repositories for `game`/`game_event` come from `TypeOrmModule.forFeature`")
**Apply to:** `IngestModule` and any sub-module needing `Repository<GameEntity>` / `Repository<GameEventEntity>`.

### Idempotent insert + same-transaction cursor flush
**Source:** RESEARCH.md Pattern 1 + Pitfall 4 (verified against `typeorm@0.3.31` `InsertQueryBuilder.orIgnore()`)
**Apply to:** `event-ingest.service.ts` (INGST-03/04), `game-state-rebuild.service.ts` (RCVR-01, same insert path in replay mode).

### Per-key singleton registry (`Map<gameId, T>`)
**Source:** RESEARCH.md Pattern 2 (`GameMutexRegistry`)
**Apply to:** `GameMutexRegistry` (STAT-02), `GameStateRegistry` (STAT-01), `StreamManagerService`'s `controllers` map (Pattern 4) — same shape reused three times this phase; keep the eviction concern (Security Domain) consistent across all three.

### `OnApplicationShutdown` + `AbortController`
**Source:** RESEARCH.md Pattern 4; `main.ts` already calls `enableShutdownHooks()` (line 6)
**Apply to:** `StreamManagerService` (INGST-02/04), any replay emitter connection needing clean teardown.

## No Analog Found

Files with no close match in the codebase — these are external port sources or genuinely new infrastructure; planner should rely on RESEARCH.md's Architecture Patterns/Pattern sections and the txodds-api skill instead of an in-repo analog:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/modules/ingest/stream/upstream.ts` | service | streaming | Ported near-verbatim from external `txodds-txline-api-monitor` repo (CLAUDE.md LOCK) — no in-repo precedent; executing agent must fetch/read the actual source file at implementation time (RESEARCH.md Open Question 1), not just this summary. |
| `src/modules/ingest/replay/replay.ts` | service | event-driven | Same as above; additionally requires an explicit `maxGapMs` override for the pre-match segment (D-04 conflicts with reference repo's default 5000ms clamp — must be a deliberate code change, not an oversight). |
| `src/modules/ingest/state/possession.ts` | utility | transform | Ported from external repo; classify by exact `Action` match per Anti-Pattern note, not by inferring danger stages from `PossessionType`. |
| `src/modules/ingest/state/goals.ts` | utility | transform | Ported from external repo; must dedup/reconcile on `Id` (Pitfall 3) — anchor-to-earliest pattern, not naive append. |
| `src/modules/ingest/events/game-stream-gap.emitter.ts` | provider | event-driven | First in-process event-bus provider in this codebase; use RESEARCH.md's ~15-line native `EventEmitter` wrapper recommendation (Standard Stack, Supporting) — no existing NestJS provider pattern to copy for this specifically, but standard `@Injectable()` singleton shape applies (see `GameMutexRegistry` for the closest structural sibling: injectable singleton holding internal mutable state). |

## Metadata

**Analog search scope:** `apps/gutcallfun-core/src/{config,modules,models,db}`, `apps/gutcallfun-core/src/main.ts`, `apps/gutcallfun-core/package.json`
**Files scanned:** 17 existing source files (Phase 1 output) + 2 external port-source repos referenced but not vendored in-tree
**Pattern extraction date:** 2026-07-17
