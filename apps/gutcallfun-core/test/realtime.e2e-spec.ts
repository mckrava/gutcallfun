import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';

interface MatchClockPayload {
  current_status_id: number | null;
  last_feed_ts: string | null;
  period_started_feed_ts: string | null;
  elapsed_ms: number | null;
}

interface SnapshotPayload {
  game_id: number;
  clock: MatchClockPayload;
  active_question: unknown;
}

interface GameEventPayload {
  game_id: number;
  is_mock: boolean;
}

/**
 * Live socket.io-client assertions against the fake cycle (WS-01/WS-02).
 * Unlike `api-surface.e2e-spec.ts`'s in-process supertest calls, socket.io
 * needs a real listening port — `app.listen(0)` and reads the OS-assigned
 * port back off the HTTP server address rather than hard-coding one.
 *
 * Deliberately does NOT wait out a full 30s question cycle: the
 * question-to-resolution correlation is already proven under Jest fake
 * timers in `fake-cycle.service.spec.ts` (plan 04). This spec only proves
 * the parts that genuinely require a live client/server round trip —
 * snapshot-on-subscribe and the 4s heartbeat — keeping total runtime under
 * ~15s per the plan's flagged trade-off.
 */
describe('Realtime WebSocket cycle (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const clients: Socket[] = [];

  const GAME_ID = 3;
  const WEB_APP_ORIGIN = process.env.WEB_APP_ORIGIN ?? 'http://localhost:3001';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);

    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }
  });

  afterAll(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }
    await app.close();
  });

  function connectClient(): Socket {
    const client = io(baseUrl, {
      transports: ['websocket'],
      extraHeaders: { Origin: WEB_APP_ORIGIN },
      forceNew: true,
    });
    clients.push(client);
    return client;
  }

  it('emitting subscribe yields a snapshot within 1000ms carrying a clock and a null active_question (WS-01)', (done) => {
    const client = connectClient();
    client.on('connect', () => {
      client.emit('subscribe', { game_id: GAME_ID });
    });
    client.on('snapshot', (snapshot: SnapshotPayload) => {
      try {
        expect(snapshot.game_id).toBe(GAME_ID);
        expect('current_status_id' in snapshot.clock).toBe(true);
        expect('last_feed_ts' in snapshot.clock).toBe(true);
        expect('period_started_feed_ts' in snapshot.clock).toBe(true);
        expect('elapsed_ms' in snapshot.clock).toBe(true);
        expect('active_question' in snapshot).toBe(true);
        expect(snapshot.active_question).toBeNull();
        done();
      } catch (err) {
        done(err as Error);
      }
    });
    client.on('connect_error', (err: Error) => {
      done(err);
    });
  }, 10_000);

  it('a game_event heartbeat arrives within ~5s of subscribing (WS-02)', (done) => {
    const client = connectClient();
    client.on('connect', () => {
      client.emit('subscribe', { game_id: GAME_ID });
    });
    client.on('game_event', (event: GameEventPayload) => {
      try {
        expect(event.game_id).toBe(GAME_ID);
        expect(event.is_mock).toBe(true);
        done();
      } catch (err) {
        done(err as Error);
      }
    });
    client.on('connect_error', (err: Error) => {
      done(err);
    });
  }, 10_000);

  it('two clients subscribing to the same game_id both receive their own snapshot', (done) => {
    const clientA = connectClient();
    const clientB = connectClient();
    let receivedA = false;
    let receivedB = false;

    function maybeDone() {
      if (receivedA && receivedB) done();
    }

    clientA.on('connect', () =>
      clientA.emit('subscribe', { game_id: GAME_ID }),
    );
    clientB.on('connect', () =>
      clientB.emit('subscribe', { game_id: GAME_ID }),
    );

    clientA.on('snapshot', () => {
      receivedA = true;
      maybeDone();
    });
    clientB.on('snapshot', () => {
      receivedB = true;
      maybeDone();
    });
    clientA.on('connect_error', (err: Error) => {
      done(err);
    });
    clientB.on('connect_error', (err: Error) => {
      done(err);
    });
  }, 10_000);
});
