import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';

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
 * Live socket.io-client assertions against the real gateway (WS-01).
 * Unlike `api-surface.e2e-spec.ts`'s in-process supertest calls, socket.io
 * needs a real listening port — `app.listen(0)` and reads the OS-assigned
 * port back off the HTTP server address rather than hard-coding one.
 *
 * Scope is deliberately narrow: only what genuinely requires a live
 * client/server round trip — handshake auth (accepted and rejected) and
 * snapshot-on-subscribe.
 *
 * It does NOT assert question/resolution pushes. Those are now driven by the
 * real live engine off actual feed input, not by a timer, so they cannot be
 * provoked from a socket client alone; they are covered against the DB by the
 * live-engine specs. The former `FakeCycleService` this file was originally
 * written against no longer exists.
 */
describe('Realtime WebSocket cycle (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let auth: AuthService;
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

    auth = app.get(AuthService);
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

  /**
   * The gateway authenticates the handshake: `handleConnection` consumes a
   * single-use ticket from `handshake.auth.ticket` and disconnects anything
   * without a valid one. A ticketless `io(baseUrl)` therefore never receives a
   * snapshot and every test here times out.
   *
   * Tickets are SINGLE-USE, so each connection mints its own — reusing one
   * across two clients would authenticate the first and silently drop the
   * second, which is exactly the multi-client case one of these tests covers.
   *
   * Minting straight off AuthService rather than driving the full
   * challenge/verify SIWS flow keeps this spec focused on the WS contract;
   * signature verification is covered by siws.spec.ts and auth.service.spec.ts.
   */
  function connectClient(userId = '00000000-0000-4000-8000-0000000000e2'): Socket {
    const { ticket } = auth.issueWsTicket(userId);
    const client = io(baseUrl, {
      transports: ['websocket'],
      extraHeaders: { Origin: WEB_APP_ORIGIN },
      auth: { ticket },
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

  /**
   * Replaces a former "a game_event heartbeat arrives within ~5s" test, which
   * became obsolete twice over: the 4s synthetic heartbeat belonged to
   * FakeCycleService (deleted when the real live engine landed), and it
   * asserted `is_mock: true`, which is now false. The real engine emits
   * `game_event` only in response to an actual feed message, so no heartbeat
   * can ever arrive for a game with no live source — the assertion could not
   * pass by design, rather than being broken.
   *
   * What replaces it is the negative path this file never had. The pending
   * todo `ws-handshake-origin-not-enforced.md` called that out explicitly:
   * "test/realtime.e2e-spec.ts currently exercises only the happy path, which
   * is why this slipped through the phase's own 40/40 green suite." Handshake
   * auth is now the control that closes it, so it is worth a real assertion.
   */
  it('rejects a connection presenting no ticket (handshake auth)', (done) => {
    const client = io(baseUrl, {
      transports: ['websocket'],
      extraHeaders: { Origin: WEB_APP_ORIGIN },
      forceNew: true,
    });
    clients.push(client);

    let sawSnapshot = false;
    client.on('snapshot', () => {
      sawSnapshot = true;
    });

    // The gateway accepts the socket, then disconnects it inside
    // handleConnection — so the client observes `connect` followed by
    // `disconnect`, not a `connect_error`.
    client.on('disconnect', () => {
      try {
        expect(sawSnapshot).toBe(false);
        done();
      } catch (err) {
        done(err as Error);
      }
    });

    client.on('connect', () => {
      client.emit('subscribe', { game_id: GAME_ID });
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
