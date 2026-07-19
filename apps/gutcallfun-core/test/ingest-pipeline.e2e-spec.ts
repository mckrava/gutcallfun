/**
 * End-to-end 20x replay idempotency + score-correctness e2e (Task 3, ROADMAP
 * Phase 2 success criterion #3).
 *
 * PREREQUISITE: `docker compose up -d` must already be running (root
 * `docker-compose.yml` — Postgres 16 on 127.0.0.1:5488) and this app's
 * `.env` must point DATABASE_URL at it. If the container is unreachable,
 * this spec's beforeAll will fail with a clear connection error rather than
 * silently hanging — see the try/catch wrapper below.
 *
 * Feeds the SAME small synthetic ordered event array (jersey x2, status,
 * possession-ladder climb, score_adjustment, goal Confirmed:false ->
 * Confirmed:true on one Id) through EventIngestService.processEvent in a
 * loop of 20 full passes WITHOUT wiping game_event between passes — the
 * pipeline's own idempotency (UNIQUE(game_id,seq) + orIgnore ON CONFLICT DO
 * NOTHING) is exactly what is under test. After EACH pass this asserts:
 *   (a) game_event row count === the pass-1 baseline (zero duplicates, INGST-03)
 *   (b) GameStateRegistry's derived score === the fixture's terminal Score field (STAT-01)
 * After the full loop:
 *   (c) game.stream_cursor === the last processed event's frame id (INGST-04)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GameEntity } from '../src/models/game/game.entity';
import { GameEventEntity } from '../src/models/game/game-event.entity';
import { GameStatus } from '../src/models/game/enums';
import { EventIngestService } from '../src/modules/ingest/persistence/event-ingest.service';
import { GameStateRegistry } from '../src/modules/ingest/state/game-state.registry';

// Fixed test-only fixture id — out of TxLINE's real id range, reused across
// runs so the beforeAll cleanup step is idempotent.
const TEST_FIXTURE_ID = 999_900_001;
const CONNECTION_ID = 424_242;
const PASS_COUNT = 20;

function fixtureEvents(): Record<string, unknown>[] {
  const baseTs = 1_718_033_000_000;
  return [
    {
      Action: 'jersey',
      FixtureId: TEST_FIXTURE_ID,
      Id: 1,
      Seq: 1,
      Ts: baseTs + 1_000,
      ConnectionId: CONNECTION_ID,
      Participant: 1,
      Data: { Color: 'red' },
    },
    {
      Action: 'jersey',
      FixtureId: TEST_FIXTURE_ID,
      Id: 2,
      Seq: 2,
      Ts: baseTs + 2_000,
      ConnectionId: CONNECTION_ID,
      Participant: 2,
      Data: { Color: 'navyblue' },
    },
    {
      Action: 'status',
      FixtureId: TEST_FIXTURE_ID,
      Id: 3,
      Seq: 3,
      Ts: baseTs + 3_000,
      ConnectionId: CONNECTION_ID,
      StatusId: 2,
      Data: { StatusId: 2, StatusName: 'H1' },
    },
    // Possession ladder climb: safe -> attack -> high_danger.
    {
      Action: 'safe_possession',
      FixtureId: TEST_FIXTURE_ID,
      Id: 4,
      Seq: 4,
      Ts: baseTs + 4_000,
      ConnectionId: CONNECTION_ID,
      Participant: 1,
      Possession: 1,
      PossessionType: 'SafePossession',
    },
    {
      Action: 'attack_possession',
      FixtureId: TEST_FIXTURE_ID,
      Id: 5,
      Seq: 5,
      Ts: baseTs + 5_000,
      ConnectionId: CONNECTION_ID,
      Participant: 1,
      Possession: 1,
      PossessionType: 'AttackPossession',
    },
    {
      Action: 'high_danger_possession',
      FixtureId: TEST_FIXTURE_ID,
      Id: 6,
      Seq: 6,
      Ts: baseTs + 6_000,
      ConnectionId: CONNECTION_ID,
      Participant: 1,
      Possession: 1,
      PossessionType: 'HighDangerPossession',
    },
    // Authoritative score resync (consistent with 0-0 at this point).
    {
      Action: 'score_adjustment',
      FixtureId: TEST_FIXTURE_ID,
      Id: 7,
      Seq: 7,
      Ts: baseTs + 7_000,
      ConnectionId: CONNECTION_ID,
      Confirmed: true,
      Data: {
        Participant1: { Total: { Goals: 0 } },
        Participant2: { Total: { Goals: 0 } },
      },
      Score: {
        Participant1: { Total: { Goals: 0 } },
        Participant2: { Total: { Goals: 0 } },
      },
    },
    // Goal: Confirmed:false first (median ~76-80s lag empirically) then
    // Confirmed:true on the SAME Id — must count exactly once.
    {
      Action: 'goal',
      FixtureId: TEST_FIXTURE_ID,
      Id: 901,
      Seq: 8,
      Ts: baseTs + 8_000,
      ConnectionId: CONNECTION_ID,
      Confirmed: false,
      Participant: 1,
    },
    {
      Action: 'goal',
      FixtureId: TEST_FIXTURE_ID,
      Id: 901,
      Seq: 9,
      Ts: baseTs + 9_000,
      ConnectionId: CONNECTION_ID,
      Confirmed: true,
      Participant: 1,
      Score: {
        Participant1: { Total: { Goals: 1 } },
        Participant2: { Total: { Goals: 0 } },
      },
    },
  ];
}

describe('Ingest pipeline: 20x replay idempotency + score correctness (e2e)', () => {
  let app: INestApplication;
  let eventIngestService: EventIngestService;
  let gameStateRegistry: GameStateRegistry;
  let gameRepository: Repository<GameEntity>;
  let gameEventRepository: Repository<GameEventEntity>;
  let gameId: number;

  const events = fixtureEvents();
  const terminalScore = { participant1: 1, participant2: 0 };
  const lastEvent = events[events.length - 1];

  beforeAll(async () => {
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    } catch (err) {
      throw new Error(
        'Could not connect to Postgres for the ingest-pipeline e2e spec. ' +
          "Start it first: `docker compose up -d` (root docker-compose.yml, Postgres 16 on 127.0.0.1:5488), " +
          `then ensure apps/gutcallfun-core/.env has a matching DATABASE_URL. Original error: ${String(err)}`,
      );
    }

    eventIngestService = app.get(EventIngestService);
    gameStateRegistry = app.get(GameStateRegistry);
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

  it(`replays the same ${events.length}-event fixture ${PASS_COUNT}x: zero duplicate rows and score matches the terminal Score on every pass`, async () => {
    let baselineRowCount: number | null = null;

    for (let pass = 1; pass <= PASS_COUNT; pass++) {
      for (const event of events) {
        await eventIngestService.processEvent(gameId, event);
      }

      const rowCount = await gameEventRepository.count({ where: { gameId } });
      if (baselineRowCount === null) {
        baselineRowCount = rowCount;
        // Sanity: the fixture's distinct Seq values all landed on pass 1.
        expect(baselineRowCount).toBe(events.length);
      } else {
        // (a) Idempotency: identical row count across all 20 passes — zero
        // duplicates via UNIQUE(game_id,seq) + orIgnore ON CONFLICT DO NOTHING.
        expect(rowCount).toBe(baselineRowCount);
      }

      // (b) Serial-correctness under repeated fast replay: derived score
      // matches the fixture's terminal Score field on every single pass.
      const state = gameStateRegistry.get(gameId);
      expect(state).toBeDefined();
      expect(state!.score1).toBe(terminalScore.participant1);
      expect(state!.score2).toBe(terminalScore.participant2);
    }

    // (c) stream_cursor equals the last processed event's frame id (INGST-04).
    const finalGame = await gameRepository.findOneOrFail({ where: { id: gameId } });
    expect(finalGame.streamCursor).toBe(String(lastEvent.Seq));
  }, 60_000);
});
