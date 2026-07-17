import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../../app.module';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { GameStatus } from '../../../models/game/enums';
import { EventIngestService } from '../persistence/event-ingest.service';
import { TxlineHttpClient } from '../fixtures/txline-http.client';
import { StreamManagerService } from './stream-manager.service';
import * as upstream from './upstream';
import type { ConnectWithRetryOptions } from './upstream';

// Mock only connectWithRetry — keep every other real export (AUTH_EXPIRED,
// parseSseBlock, buildStreamUrl) so a spec that wants to simulate an
// AUTH_EXPIRED signal can drive it exactly the way the real ported client
// would (via opts.onMeta({ type: 'auth_expired' }), never via a thrown
// AUTH_EXPIRED symbol — connectWithRetry itself already swallows that).
jest.mock('./upstream', () => ({
  ...jest.requireActual('./upstream'),
  connectWithRetry: jest.fn(),
}));

const connectWithRetryMock = upstream.connectWithRetry as jest.MockedFunction<
  typeof upstream.connectWithRetry
>;

/** Flush the microtask queue enough times for chained `await`s (including one recursive re-auth reconnect) to settle. */
async function flushAsync(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function buildGameRepoMock(game: Partial<GameEntity> | null): Repository<GameEntity> {
  return {
    findOne: jest.fn(async () => game),
  } as unknown as Repository<GameEntity>;
}

function buildTxlineHttpClientMock(): TxlineHttpClient {
  return {
    getCredentials: jest.fn(() => ({ jwt: 'jwt-1', apiToken: 'token-1' })),
    refreshAuth: jest.fn(async () => undefined),
  } as unknown as TxlineHttpClient;
}

function buildEventIngestServiceMock(): EventIngestService {
  return {
    processEvent: jest.fn(async () => undefined),
  } as unknown as EventIngestService;
}

describe('StreamManagerService (INGST-02, RPLY-02, unit — mocked upstream/processEvent)', () => {
  beforeEach(() => {
    connectWithRetryMock.mockReset();
  });

  it('start(gameId) called twice yields exactly one active connection (INGST-02 concurrency edge)', async () => {
    connectWithRetryMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const gameRepo = buildGameRepoMock({ id: 1, fixtureId: 555, streamCursor: null } as GameEntity);
    const txlineHttpClient = buildTxlineHttpClientMock();
    const eventIngestService = buildEventIngestServiceMock();
    const service = new StreamManagerService(eventIngestService, txlineHttpClient, gameRepo);

    service.start(1);
    service.start(1);
    await flushAsync();

    expect(connectWithRetryMock).toHaveBeenCalledTimes(1);
  });

  it('reads Last-Event-ID from game.stream_cursor and forwards each message to EventIngestService.processEvent(gameId, raw) with no extra mode argument (RPLY-02)', async () => {
    const rawMessage = {
      Action: 'shot',
      FixtureId: 555,
      Id: 1,
      Seq: 10,
      Ts: 1_718_000_000_000,
      ConnectionId: 1,
      Confirmed: true,
      Participant: 1,
      StatusId: 2,
    };

    connectWithRetryMock.mockImplementation(async (opts: ConnectWithRetryOptions) => {
      opts.onEvent(Date.now(), { data: JSON.stringify(rawMessage) });
    });

    const gameRepo = buildGameRepoMock({ id: 1, fixtureId: 555, streamCursor: '9' } as GameEntity);
    const txlineHttpClient = buildTxlineHttpClientMock();
    const eventIngestService = buildEventIngestServiceMock();
    const service = new StreamManagerService(eventIngestService, txlineHttpClient, gameRepo);

    service.start(1);
    await flushAsync();

    expect(connectWithRetryMock).toHaveBeenCalledTimes(1);
    const opts = connectWithRetryMock.mock.calls[0][0];
    expect(opts.initialLastEventId).toBe('9');
    expect(opts.fixtureId).toBe('555');

    expect(eventIngestService.processEvent).toHaveBeenCalledTimes(1);
    const call = (eventIngestService.processEvent as jest.Mock).mock.calls[0];
    // Exactly (gameId, raw) — no third mode/source flag ever added (RPLY-02: SSE
    // and replay both call the identical two-argument processEvent contract).
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(1);
    expect(call[1]).toEqual(rawMessage);
  });

  it('does not crash and does not call processEvent when a data block fails JSON.parse (defensive, never crash the stream)', async () => {
    connectWithRetryMock.mockImplementation(async (opts: ConnectWithRetryOptions) => {
      opts.onEvent(Date.now(), { data: '{not valid json' });
    });

    const gameRepo = buildGameRepoMock({ id: 1, fixtureId: 555, streamCursor: null } as GameEntity);
    const txlineHttpClient = buildTxlineHttpClientMock();
    const eventIngestService = buildEventIngestServiceMock();
    const service = new StreamManagerService(eventIngestService, txlineHttpClient, gameRepo);

    service.start(1);
    await flushAsync();

    expect(eventIngestService.processEvent).not.toHaveBeenCalled();
  });

  it('onApplicationShutdown aborts every active per-game AbortController (INGST-04 shutdown seam, RESEARCH Pitfall 5)', async () => {
    connectWithRetryMock.mockImplementation(
      (opts: ConnectWithRetryOptions) =>
        new Promise<void>((resolve) => {
          opts.signal?.addEventListener('abort', () => resolve(), { once: true });
        }),
    );

    const gameRepo = {
      findOne: jest.fn(
        async ({ where: { id } }: { where: { id: number } }) =>
          ({ id, fixtureId: 100 + id, streamCursor: null }) as GameEntity,
      ),
    } as unknown as Repository<GameEntity>;
    const txlineHttpClient = buildTxlineHttpClientMock();
    const eventIngestService = buildEventIngestServiceMock();
    const service = new StreamManagerService(eventIngestService, txlineHttpClient, gameRepo);

    service.start(1);
    service.start(2);
    await flushAsync();

    expect(connectWithRetryMock).toHaveBeenCalledTimes(2);
    const signal1 = connectWithRetryMock.mock.calls[0][0].signal;
    const signal2 = connectWithRetryMock.mock.calls[1][0].signal;
    expect(signal1?.aborted).toBe(false);
    expect(signal2?.aborted).toBe(false);

    await service.onApplicationShutdown();

    expect(signal1?.aborted).toBe(true);
    expect(signal2?.aborted).toBe(true);
  });

  it('re-authenticates exactly once via TxlineHttpClient.refreshAuth() on AUTH_EXPIRED and never loops a second time (INGST-01, T-02-05-02)', async () => {
    connectWithRetryMock.mockImplementation(async (opts: ConnectWithRetryOptions) => {
      // Mirrors the real connectWithRetry: emits auth_expired then returns
      // WITHOUT retrying — the caller (StreamManagerService) owns the
      // one-time re-auth decision.
      opts.onMeta(Date.now(), { type: 'auth_expired' });
    });

    const gameRepo = buildGameRepoMock({ id: 1, fixtureId: 555, streamCursor: null } as GameEntity);
    const txlineHttpClient = buildTxlineHttpClientMock();
    const eventIngestService = buildEventIngestServiceMock();
    const service = new StreamManagerService(eventIngestService, txlineHttpClient, gameRepo);

    service.start(1);
    await flushAsync();

    expect(txlineHttpClient.refreshAuth).toHaveBeenCalledTimes(1);
    // Original attempt + exactly one re-auth retry attempt — never a third.
    expect(connectWithRetryMock).toHaveBeenCalledTimes(2);
  });

  it('stop(gameId) aborts that game only, leaving other active connections untouched', async () => {
    connectWithRetryMock.mockImplementation(
      (opts: ConnectWithRetryOptions) =>
        new Promise<void>((resolve) => {
          opts.signal?.addEventListener('abort', () => resolve(), { once: true });
        }),
    );

    const gameRepo = {
      findOne: jest.fn(
        async ({ where: { id } }: { where: { id: number } }) =>
          ({ id, fixtureId: 100 + id, streamCursor: null }) as GameEntity,
      ),
    } as unknown as Repository<GameEntity>;
    const txlineHttpClient = buildTxlineHttpClientMock();
    const eventIngestService = buildEventIngestServiceMock();
    const service = new StreamManagerService(eventIngestService, txlineHttpClient, gameRepo);

    service.start(1);
    service.start(2);
    await flushAsync();

    const signal1 = connectWithRetryMock.mock.calls[0][0].signal;
    const signal2 = connectWithRetryMock.mock.calls[1][0].signal;

    service.stop(1);

    expect(signal1?.aborted).toBe(true);
    expect(signal2?.aborted).toBe(false);

    await service.onApplicationShutdown();
  });
});

// ── INGST-04 SIGTERM cursor-flush invariant (real Postgres) ──────────────────
//
// Reuses the Plan-03 e2e harness convention (test/ingest-pipeline.e2e-spec.ts):
// boot the real AppModule against docker-compose Postgres, drive one event
// through the REAL EventIngestService.processEvent (Plan 03's actual
// same-transaction insert+cursor-flush path), then call
// StreamManagerService.onApplicationShutdown() and assert the persisted
// game.stream_cursor equals (never exceeds) the max committed game_event.seq.
//
// PREREQUISITE: `docker compose up -d` must already be running (root
// docker-compose.yml — Postgres 16 on 127.0.0.1:5488) and this app's `.env`
// must point DATABASE_URL at it.
describe('StreamManagerService — INGST-04 SIGTERM cursor-flush invariant (real Postgres)', () => {
  let app: INestApplication;
  let eventIngestService: EventIngestService;
  let streamManagerService: StreamManagerService;
  let gameRepository: Repository<GameEntity>;
  let gameEventRepository: Repository<GameEventEntity>;
  let gameId: number;

  const TEST_FIXTURE_ID = 999_900_002;

  beforeAll(async () => {
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    } catch (err) {
      throw new Error(
        'Could not connect to Postgres for the StreamManagerService INGST-04 spec. ' +
          'Start it first: `docker compose up -d` (root docker-compose.yml, Postgres 16 on 127.0.0.1:5488), ' +
          `then ensure apps/gutcallfun-core/.env has a matching DATABASE_URL. Original error: ${String(err)}`,
      );
    }

    eventIngestService = app.get(EventIngestService);
    streamManagerService = app.get(StreamManagerService);
    gameRepository = app.get(getRepositoryToken(GameEntity));
    gameEventRepository = app.get(getRepositoryToken(GameEventEntity));

    // Idempotent cleanup: remove any leftover row from a prior/crashed run.
    const existing = await gameRepository.findOne({ where: { fixtureId: TEST_FIXTURE_ID } });
    if (existing) {
      await gameEventRepository.delete({ gameId: existing.id });
      await gameRepository.delete({ id: existing.id });
    }

    const seeded = await gameRepository.save(
      gameRepository.create({
        fixtureId: TEST_FIXTURE_ID,
        status: GameStatus.LIVE,
        participant1IsHome: true,
      }),
    );
    gameId = seeded.id;
  }, 30_000);

  afterAll(async () => {
    if (gameId !== undefined) {
      await gameEventRepository.delete({ gameId });
      await gameRepository.delete({ id: gameId });
    }
    if (app) {
      await app.close();
    }
  });

  it('leaves game.stream_cursor equal to (never ahead of) the last committed game_event seq after onApplicationShutdown aborts controllers', async () => {
    const event = {
      Action: 'shot',
      FixtureId: TEST_FIXTURE_ID,
      Id: 1,
      Seq: 1,
      Ts: Date.now(),
      ConnectionId: 42,
      Confirmed: true,
      Participant: 1,
      StatusId: 2,
    };

    // Real Plan-03 path: same transaction commits the game_event insert AND
    // the game.stream_cursor UPDATE (N=1, event-ingest.service.ts).
    await eventIngestService.processEvent(gameId, event);

    // onApplicationShutdown performs NO extra DB write of its own — it only
    // aborts in-flight controllers (none active here). This call proves that
    // invoking it never corrupts or lags the already-committed cursor.
    await streamManagerService.onApplicationShutdown();

    const finalGame = await gameRepository.findOneOrFail({ where: { id: gameId } });
    const maxSeqRow = await gameEventRepository
      .createQueryBuilder('ge')
      .select('MAX(ge.seq)', 'maxSeq')
      .where('ge.game_id = :gameId', { gameId })
      .getRawOne<{ maxSeq: string | number }>();

    const maxSeq = Number(maxSeqRow?.maxSeq);
    expect(finalGame.streamCursor).toBe(String(maxSeq));
    expect(Number(finalGame.streamCursor)).toBeLessThanOrEqual(maxSeq);
  });
});
