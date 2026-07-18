import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

interface PaginatedBody<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface UserBody {
  id: string;
  wallet_address: string;
  handle: string;
  image: string | null;
}

interface ScoreProfileBody {
  total_points: number;
}

interface SquadBody {
  id: number;
  name: string;
}

interface SquadParticipantBody {
  squad_id: number;
  user_id: string;
}

interface GameBody {
  id: number;
  team1_name: string;
  team2_name: string;
  score_p1: number;
  score_p2: number;
}

interface GameEventPageBody {
  items: unknown[];
  next_seq: number | null;
}

interface QuestionOptionBody {
  base_gain: number;
}

interface QuestionBody {
  options: QuestionOptionBody[];
}

interface UserGameBody {
  game_id: number;
  user_id: string;
  id?: string;
}

interface QuestionOutcomeBody {
  ladder_position: number;
}

interface AnswerBody {
  awarded_points: number | null;
  successful_outcome: boolean | null;
  resolved_at: string | null;
}

interface LeaderboardEntryBody {
  total_points: number;
}

/**
 * Full REST surface sweep proving every one of the 20 COVERAGE.md routes is
 * reachable and returns a shaped, non-empty, deterministic payload — not
 * merely a 200 (D-01/D-04). Applies the same global ValidationPipe the real
 * bootstrap uses (`main.ts`'s createNestApplication() does NOT run
 * `bootstrap()`, so without this the whitelist/forbid-non-whitelisted
 * behaviour under test would simply be absent). Closes the app in afterAll —
 * this suite boots the realtime module and its timers, unlike the boilerplate
 * `app.e2e-spec.ts` analog, which had nothing to leak.
 */
describe('REST API surface (e2e)', () => {
  let app: INestApplication<App>;

  const EXISTING_USER_ID = '00000000-0000-4000-8000-000000000001';
  const EXISTING_SQUAD_ID = 1001;
  const EMPTY_SQUAD_ID = 1002;
  const LIVE_GAME_ID = 3;
  const HIGHEST_EVENT_SEQ = 14;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------
  describe('users', () => {
    it('GET /users returns a non-empty, shaped, deterministic page (D-01/D-04)', async () => {
      const first = await request(app.getHttpServer())
        .get('/users')
        .expect(200);
      const firstBody = first.body as PaginatedBody<UserBody>;
      expect(firstBody.items.length).toBeGreaterThan(0);
      expect(typeof firstBody.items[0].wallet_address).toBe('string');
      expect(typeof firstBody.items[0].handle).toBe('string');

      const second = await request(app.getHttpServer())
        .get('/users')
        .expect(200);
      expect(second.body as PaginatedBody<UserBody>).toEqual(firstBody);
    });

    it('GET /users/:user_id returns 200 for an existing user', () => {
      return request(app.getHttpServer())
        .get(`/users/${EXISTING_USER_ID}`)
        .expect(200)
        .expect((res) => {
          expect((res.body as UserBody).id).toBe(EXISTING_USER_ID);
        });
    });

    it('GET /users/:user_id returns 404, never 500, for a well-formed but unknown id', () => {
      return request(app.getHttpServer())
        .get('/users/00000000-0000-4000-8000-00000000ffff')
        .expect(404);
    });

    it('POST /users returns 201 with a shaped user', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({
          wallet_address: 'GCMOCKWALLET0000000000000000000000000099',
          handle: 'mock_new_player',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body as UserBody).toMatchObject({
            wallet_address: 'GCMOCKWALLET0000000000000000000000000099',
            handle: 'mock_new_player',
          });
        });
    });

    it('PATCH /users/:user_id accepts handle/image and returns 200', () => {
      return request(app.getHttpServer())
        .patch(`/users/${EXISTING_USER_ID}`)
        .send({ handle: 'mock_striker_09_updated' })
        .expect(200)
        .expect((res) => {
          expect((res.body as UserBody).handle).toBe('mock_striker_09_updated');
        });
    });

    it('PATCH /users/:user_id rejects wallet_address alongside handle with 400 (mass-assignment guard, T-02.1-07)', () => {
      return request(app.getHttpServer())
        .patch(`/users/${EXISTING_USER_ID}`)
        .send({
          handle: 'mock_striker_09',
          wallet_address: 'GCMOCKWALLETHACKED000000000000000000000',
        })
        .expect(400);
    });

    it('GET /users/:user_id/score-profile returns 200 for a user with a profile', () => {
      return request(app.getHttpServer())
        .get(`/users/${EXISTING_USER_ID}/score-profile`)
        .expect(200)
        .expect((res) => {
          expect(typeof (res.body as ScoreProfileBody).total_points).toBe(
            'number',
          );
        });
    });
  });

  // ---------------------------------------------------------------------
  // Squads
  // ---------------------------------------------------------------------
  describe('squads', () => {
    it('POST /squads returns 201 with an explicitly assigned id (no DB default)', () => {
      return request(app.getHttpServer())
        .post('/squads')
        .send({ name: 'Mock Squad Gamma' })
        .expect(201)
        .expect((res) => {
          const body = res.body as SquadBody;
          expect(typeof body.id).toBe('number');
          expect(body.name).toBe('Mock Squad Gamma');
        });
    });

    it('GET /squads returns a non-empty, shaped page', () => {
      return request(app.getHttpServer())
        .get('/squads')
        .expect(200)
        .expect((res) => {
          const body = res.body as PaginatedBody<SquadBody>;
          expect(body.items.length).toBeGreaterThan(0);
          expect(typeof body.items[0].name).toBe('string');
        });
    });

    it('GET /squads/:squad_id returns 200 for an existing squad', () => {
      return request(app.getHttpServer())
        .get(`/squads/${EXISTING_SQUAD_ID}`)
        .expect(200)
        .expect((res) => {
          expect((res.body as SquadBody).id).toBe(EXISTING_SQUAD_ID);
        });
    });

    it('GET /squads/:squad_id returns 404 for a well-formed but unknown id', () => {
      return request(app.getHttpServer()).get('/squads/999999').expect(404);
    });

    it('POST /squads/:squad_id/participants returns 201', () => {
      return request(app.getHttpServer())
        .post(`/squads/${EXISTING_SQUAD_ID}/participants`)
        .send({ user_id: '00000000-0000-4000-8000-000000000003' })
        .expect(201)
        .expect((res) => {
          expect((res.body as SquadParticipantBody).squad_id).toBe(
            EXISTING_SQUAD_ID,
          );
        });
    });

    it('GET /squads/:squad_id/participants returns a non-empty page for a populated squad', () => {
      return request(app.getHttpServer())
        .get(`/squads/${EXISTING_SQUAD_ID}/participants`)
        .expect(200)
        .expect((res) => {
          expect(
            (res.body as PaginatedBody<SquadParticipantBody>).items.length,
          ).toBeGreaterThan(0);
        });
    });

    it('GET /squads/:squad_id/participants returns 200 with an empty array for a squad with none', () => {
      return request(app.getHttpServer())
        .get(`/squads/${EMPTY_SQUAD_ID}/participants`)
        .expect(200)
        .expect((res) => {
          const body = res.body as PaginatedBody<SquadParticipantBody>;
          expect(body.items).toEqual([]);
          expect(body.total).toBe(0);
        });
    });

    it('GET /squads/:squad_id/score-profile returns 200 for a squad with a resolvable profile', () => {
      return request(app.getHttpServer())
        .get(`/squads/${EXISTING_SQUAD_ID}/score-profile`)
        .expect(200)
        .expect((res) => {
          expect(typeof (res.body as ScoreProfileBody).total_points).toBe(
            'number',
          );
        });
    });
  });

  // ---------------------------------------------------------------------
  // Games
  // ---------------------------------------------------------------------
  describe('games', () => {
    it('GET /games returns denormalized shapes and is deterministic across calls (D-01/D-04)', async () => {
      const first = await request(app.getHttpServer())
        .get('/games')
        .expect(200);
      const firstBody = first.body as PaginatedBody<GameBody>;
      expect(firstBody.items.length).toBeGreaterThan(0);
      expect(typeof firstBody.items[0].team1_name).toBe('string');
      expect(typeof firstBody.items[0].team2_name).toBe('string');
      expect(typeof firstBody.items[0].score_p1).toBe('number');
      expect(typeof firstBody.items[0].score_p2).toBe('number');

      const second = await request(app.getHttpServer())
        .get('/games')
        .expect(200);
      expect(second.body as PaginatedBody<GameBody>).toEqual(firstBody);
    });

    it('GET /games?status=cancelled returns 200 with an empty items array (no cancelled fixture exists)', () => {
      return request(app.getHttpServer())
        .get('/games?status=cancelled')
        .expect(200)
        .expect((res) => {
          const body = res.body as PaginatedBody<GameBody>;
          expect(body.items).toEqual([]);
          expect(body.total).toBe(0);
        });
    });

    it('GET /games/:game_id returns 200 for an existing game', () => {
      return request(app.getHttpServer())
        .get(`/games/${LIVE_GAME_ID}`)
        .expect(200)
        .expect((res) => {
          expect((res.body as GameBody).id).toBe(LIVE_GAME_ID);
        });
    });

    it('GET /games/999999 returns 404, never 500, for a well-formed but unknown id', () => {
      return request(app.getHttpServer()).get('/games/999999').expect(404);
    });

    it('GET /games/not-a-number returns 400, never 500, for a malformed path param (API-02)', () => {
      return request(app.getHttpServer())
        .get('/games/not-a-number')
        .expect(400);
    });

    it('GET /games/:game_id/events?after_seq= past the end of the log returns 200, empty page, next_seq null', () => {
      return request(app.getHttpServer())
        .get(`/games/${LIVE_GAME_ID}/events?after_seq=${HIGHEST_EVENT_SEQ}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as GameEventPageBody;
          expect(body.items).toEqual([]);
          expect(body.next_seq).toBeNull();
        });
    });

    it('GET /games/:game_id/questions embeds exactly four options per question, base_gain 5/7/15/100 (LOCKED ladder)', () => {
      return request(app.getHttpServer())
        .get(`/games/${LIVE_GAME_ID}/questions`)
        .expect(200)
        .expect((res) => {
          const questions = res.body as QuestionBody[];
          expect(questions.length).toBeGreaterThan(0);
          for (const question of questions) {
            expect(question.options).toHaveLength(4);
            const baseGains = question.options
              .map((o) => o.base_gain)
              .sort((a, b) => a - b);
            expect(baseGains).toEqual([5, 7, 15, 100]);
          }
        });
    });

    it('POST /games/:game_id/join returns a user_game shape with no surrogate id (D-05)', () => {
      return request(app.getHttpServer())
        .post(`/games/${LIVE_GAME_ID}/join`)
        .send({ user_id: '00000000-0000-4000-8000-000000000001' })
        .expect(201)
        .expect((res) => {
          const body = res.body as UserGameBody;
          expect(body).toMatchObject({
            game_id: LIVE_GAME_ID,
            user_id: '00000000-0000-4000-8000-000000000001',
          });
          expect(body.id).toBeUndefined();
        });
    });
  });

  // ---------------------------------------------------------------------
  // Question outcomes
  // ---------------------------------------------------------------------
  describe('question-outcomes', () => {
    it('GET /question-outcomes returns exactly four rows ordered by ladder_position 1-4', () => {
      return request(app.getHttpServer())
        .get('/question-outcomes')
        .expect(200)
        .expect((res) => {
          const body = res.body as QuestionOutcomeBody[];
          expect(body).toHaveLength(4);
          expect(body.map((o) => o.ladder_position)).toEqual([1, 2, 3, 4]);
        });
    });
  });

  // ---------------------------------------------------------------------
  // Answers
  // ---------------------------------------------------------------------
  describe('answers', () => {
    it('POST /answers returns a genuinely-unresolved shape (D-05)', () => {
      return request(app.getHttpServer())
        .post('/answers')
        .send({
          user_id: '00000000-0000-4000-8000-000000000001',
          game_question_id: '00000000-0000-4000-8000-0000000000f1',
          selected_option_id: '00000000-0000-4000-8000-000000000101',
        })
        .expect(201)
        .expect((res) => {
          const body = res.body as AnswerBody;
          expect(body.awarded_points).toBeNull();
          expect(body.successful_outcome).toBeNull();
          expect(body.resolved_at).toBeNull();
        });
    });

    it('GET /answers returns a non-empty, shaped page', () => {
      return request(app.getHttpServer())
        .get('/answers')
        .expect(200)
        .expect((res) => {
          expect(
            (res.body as PaginatedBody<AnswerBody>).items.length,
          ).toBeGreaterThan(0);
        });
    });
  });

  // ---------------------------------------------------------------------
  // Leaderboard
  // ---------------------------------------------------------------------
  describe('leaderboard', () => {
    it('GET /leaderboard returns entries with non-increasing total_points', () => {
      return request(app.getHttpServer())
        .get('/leaderboard')
        .expect(200)
        .expect((res) => {
          const body = res.body as PaginatedBody<LeaderboardEntryBody>;
          expect(body.items.length).toBeGreaterThan(0);
          const points = body.items.map((e) => e.total_points);
          for (let i = 1; i < points.length; i++) {
            expect(points[i]).toBeLessThanOrEqual(points[i - 1]);
          }
        });
    });
  });
});
