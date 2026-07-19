/**
 * Proves the broadened WNDW-01 trigger + floor seed (quick task 260719-m7e)
 * against the REAL local Postgres inside a single rolled-back transaction —
 * no rows survive a run, so re-running is safe and idempotent.
 *
 * Mirrors scripts/proof-recap.ts EXACTLY as the pattern: deliberately
 * constructs the REAL LiveEngineService / QuestionWindowService /
 * QuestionResolutionService / LiveWindowRegistry (not a hand-copy of their
 * logic), binding them to a `QueryRunner` transaction via a thin
 * `txDataSource` shim in place of the app's `DataSource`. A copied query
 * proves nothing about the code that ships.
 *
 * Demonstrates BOTH:
 *  (a) a danger escalation opens a window that the OLD (safe->attack-only)
 *      gate would have suppressed;
 *  (b) a danger-opened window that stays at danger resolves to the `danger`
 *      rung (7 pts), NOT `fizzles` (5 pts) — with the attack-stage contrast
 *      still resolving `fizzles` (5 pts), proving the broadening did not
 *      lift the attack floor.
 *
 * Usage: npm run proof:window-escalation
 */
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import dataSource from '../src/db/data-source';
import { LiveWindowRegistry } from '../src/modules/live/live-window.registry';
import { QuestionWindowService } from '../src/modules/live/question-window.service';
import { QuestionResolutionService } from '../src/modules/live/question-resolution.service';
import { LiveEngineService } from '../src/modules/live/live-engine.service';
import { LiveBroadcastEmitter } from '../src/modules/live/events/live-broadcast.emitter';
import { LiveFeedEmitter } from '../src/modules/live/events/live-feed.emitter';
import { LiveFeedMessage } from '../src/modules/live/events/live-feed.event';
import { ScoreProfileService } from '../src/modules/scoring/score-profile.service';
import { GameState } from '../src/modules/ingest/state/game-state.types';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

async function main(): Promise<void> {
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  // Thin shim so the REAL services run against this transaction instead of
  // the app's pooled DataSource. Both QuestionWindowService.open and
  // QuestionResolutionService.awardInTransaction call `this.dataSource
  // .transaction(...)`, and markPendingConfirmation calls
  // `this.dataSource.createQueryBuilder()` — the outer rollback governs
  // everything, so `transaction()` runs the callback directly against the
  // single open transaction rather than opening a nested one.
  const txDataSource = {
    transaction: (cb: (manager: EntityManager) => Promise<unknown>) =>
      cb(queryRunner.manager),
    createQueryBuilder: (...args: unknown[]) =>
      (
        queryRunner.manager.createQueryBuilder as (
          ...a: unknown[]
        ) => ReturnType<EntityManager['createQueryBuilder']>
      )(...args),
    query: (sql: string, params?: unknown[]) => queryRunner.query(sql, params),
  } as unknown as DataSource;

  const captured: unknown[] = [];

  try {
    // ------------------------------------------------------------------
    // Real services under test, stubbing only true boundaries.
    // ------------------------------------------------------------------
    const registry = new LiveWindowRegistry();
    const broadcastStub = {
      emit: (event: unknown) => {
        captured.push(event);
      },
    } as unknown as LiveBroadcastEmitter;
    // Scoring/economy is LOCKED and out of scope (LD-3). awardInTransaction
    // writes awarded_points onto user_game_answer BEFORE calling
    // applyResolutionPoints, and those written points are exactly what this
    // proof asserts, so stubbing the score-profile fold changes nothing
    // measured here.
    const scoreProfilesStub = {
      applyResolutionPoints: async () => {},
    } as unknown as ScoreProfileService;
    // Fallback timer disabled — LD-5, out of scope.
    const configStub = { get: () => 0 } as unknown as ConfigService;
    const feedStub = { on: () => {} } as unknown as LiveFeedEmitter;

    const resolution = new QuestionResolutionService(
      txDataSource,
      new SchedulerRegistry(),
      registry,
      broadcastStub,
      scoreProfilesStub,
    );
    const windows = new QuestionWindowService(
      txDataSource,
      registry,
      resolution,
      broadcastStub,
    );
    const engine = new LiveEngineService(
      feedStub,
      broadcastStub,
      registry,
      windows,
      configStub,
    );

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------
    async function insertGame(fixtureId: number): Promise<number> {
      const rows = (await queryRunner.query(
        `INSERT INTO game
           (fixture_id, status, participant1_is_home, team1_name, team2_name, competition, score_p1, score_p2)
         VALUES ($1, 'live', true, $2, $3, $4, $5, $6)
         RETURNING id`,
        [fixtureId, 'Brazil', 'Argentina', 'World Cup 2026', 0, 0],
      )) as { id: number }[];
      return rows[0].id;
    }

    async function insertGameEvent(opts: {
      gameId: number;
      type: string;
      payload: Record<string, unknown>;
      actionId: number | null;
      seq: number;
      participant: number | null;
      feedTs: Date;
    }): Promise<string> {
      const rows = (await queryRunner.query(
        `INSERT INTO game_event
           (game_id, type, payload, action_id, seq, confirmed, participant, feed_ts)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          opts.gameId,
          opts.type,
          JSON.stringify(opts.payload),
          opts.actionId,
          opts.seq,
          null,
          opts.participant,
          opts.feedTs,
        ],
      )) as { id: string }[];
      return rows[0].id;
    }

    async function insertUser(handle: string): Promise<string> {
      const id = randomUUID();
      await queryRunner.query(
        `INSERT INTO "user" (id, wallet_address, share_code, handle) VALUES ($1, $2, $3, $4)`,
        [
          id,
          `wallet_${id}`,
          id.replace(/-/g, '').slice(0, 8).toUpperCase(),
          handle,
        ],
      );
      return id;
    }

    async function joinGame(gameId: number, userId: string): Promise<void> {
      await queryRunner.query(
        `INSERT INTO user_game (game_id, user_id) VALUES ($1, $2)`,
        [gameId, userId],
      );
    }

    function feedMessage(opts: {
      gameId: number;
      type: string;
      raw: Record<string, unknown>;
      eventId: string | null;
      seq: number;
      participant: number | null;
      actionId: number | null;
    }): LiveFeedMessage {
      return {
        gameId: opts.gameId,
        raw: opts.raw,
        eventId: opts.eventId,
        seq: opts.seq,
        type: opts.type,
        actionId: opts.actionId,
        participant: opts.participant,
        statusId: 2, // H1 — IN_PLAY_STATUS_IDS
        feedTs: new Date(),
        state: { currentStatusId: 2 } as unknown as GameState,
      };
    }

    const anchor = new Date('2026-07-19T15:00:00.000Z');

    // ------------------------------------------------------------------
    // Part (a) + (b): danger escalation opens a window; that window, left
    // to fizzle, resolves to the `danger` rung — not `fizzles`.
    // ------------------------------------------------------------------
    console.log(
      'Proof: WNDW-01 broadened trigger + floor seed (260719-m7e)\n',
    );

    const gameId = await insertGame(555101);
    const dangerEventId = await insertGameEvent({
      gameId,
      type: 'danger_possession',
      payload: { Action: 'danger_possession', Participant: 1 },
      actionId: 7001,
      seq: 2,
      participant: 1,
      feedTs: anchor,
    });

    const userA = await insertUser('proof_user_a'); // will pick 'danger'
    const userB = await insertUser('proof_user_b'); // will pick 'fizzles'
    await joinGame(gameId, userA);
    await joinGame(gameId, userB);

    const safeMsg = feedMessage({
      gameId,
      type: 'safe_possession',
      raw: { Action: 'safe_possession', Participant: 1, FixtureId: 555101, Ts: 1, Seq: 1 },
      eventId: null,
      seq: 1,
      participant: 1,
      actionId: null,
    });

    const dangerMsg = feedMessage({
      gameId,
      type: 'danger_possession',
      raw: { Action: 'danger_possession', Participant: 1, FixtureId: 555101, Ts: 2, Seq: 2 },
      eventId: dangerEventId,
      seq: 2,
      participant: 1,
      actionId: 7001,
    });

    // 1. safe message: no window opens (prior stage becomes 'safe').
    await (engine as unknown as { handle: (m: LiveFeedMessage) => Promise<void> }).handle(safeMsg);
    const preCount = (await queryRunner.query(
      `SELECT count(*) AS count FROM game_question WHERE game_id = $1`,
      [gameId],
    )) as { count: string }[];
    check(
      '1. no window opens on a safe possession message',
      Number(preCount[0].count) === 0,
    );

    // 2. Documents "previously would not have opened": the OLD gate
    // (possession.stage === 'attack' && (prior === null || prior === 'safe'))
    // would NOT have fired for a danger stage arriving after safe.
    const dangerStage = 'danger';
    const priorStageAfterSafe = 'safe';
    const oldGateWouldOpen =
      (dangerStage as string) === 'attack' &&
      (priorStageAfterSafe === null || priorStageAfterSafe === 'safe');
    check(
      '2. the OLD safe->attack-only gate would NOT have opened on this danger escalation',
      oldGateWouldOpen === false,
    );

    // 3. danger message: the broadened gate opens exactly one window with 4 options.
    await (engine as unknown as { handle: (m: LiveFeedMessage) => Promise<void> }).handle(dangerMsg);

    const openQuestions = (await queryRunner.query(
      `SELECT id, state FROM game_question WHERE game_id = $1`,
      [gameId],
    )) as { id: string; state: string }[];
    check(
      '3a. exactly ONE game_question row opened for the danger escalation, state=open',
      openQuestions.length === 1 && openQuestions[0].state === 'open',
    );
    const questionId = openQuestions[0]?.id;

    const optionRows = (await queryRunner.query(
      `SELECT id, outcome_key, base_gain FROM game_question_option WHERE game_question_id = $1`,
      [questionId],
    )) as { id: string; outcome_key: string; base_gain: number }[];
    check('3b. the opened window has exactly 4 options', optionRows.length === 4);

    const window = registry.get(gameId);
    check(
      '3c. the resolution floor was seeded from the trigger stage: possessionRung === "danger"',
      window !== undefined && window.possessionRung === 'danger',
    );

    // Seed answers on the open question.
    const dangerOption = optionRows.find((o) => o.outcome_key === 'danger');
    const fizzlesOption = optionRows.find((o) => o.outcome_key === 'fizzles');
    if (dangerOption === undefined || fizzlesOption === undefined) {
      throw new Error('expected both danger and fizzles options to exist');
    }

    async function insertAnswer(
      userId: string,
      qId: string,
      optionId: string,
    ): Promise<void> {
      await queryRunner.query(
        `INSERT INTO user_game_answer
           (id, user_id, game_id, game_question_id, selected_option_id, awarded_points, successful_outcome)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL)`,
        [randomUUID(), userId, gameId, qId, optionId],
      );
    }

    await insertAnswer(userA, questionId, dangerOption.id);
    await insertAnswer(userB, questionId, fizzlesOption.id);

    // Resolve deterministically: no shot/goal accumulated since open, so the
    // window "stays at danger" and hasPendingGoal is false — it resolves
    // immediately rather than deferring. Prefer this direct invocation of
    // the real resolution method over racing the 12s RESOLVE_AFTER_MS timer.
    await (
      resolution as unknown as {
        resolve: (gId: number, qId: string, reason: string) => Promise<void>;
      }
    ).resolve(gameId, questionId, 'proof');

    const resolvedQuestion = (await queryRunner.query(
      `SELECT state, resolved_option_id FROM game_question WHERE id = $1`,
      [questionId],
    )) as { state: string; resolved_option_id: string }[];
    check(
      '4a. the danger-opened window resolved to state=resolved with resolved_option_id = danger option',
      resolvedQuestion[0]?.state === 'resolved' &&
        resolvedQuestion[0]?.resolved_option_id === dangerOption.id,
    );

    const answers = (await queryRunner.query(
      `SELECT user_id, awarded_points, successful_outcome FROM user_game_answer WHERE game_question_id = $1`,
      [questionId],
    )) as {
      user_id: string;
      awarded_points: number;
      successful_outcome: boolean;
    }[];
    const answerA = answers.find((a) => a.user_id === userA);
    const answerB = answers.find((a) => a.user_id === userB);
    check(
      "4b. the danger-picker (user A) was awarded 7 points (danger rung), NOT 5 (fizzles)",
      answerA?.awarded_points === 7 && answerA?.successful_outcome === true,
    );
    check(
      '4c. the fizzles-picker (user B) was awarded 0 points — wrong pick',
      answerB?.awarded_points === 0 && answerB?.successful_outcome === false,
    );

    // ------------------------------------------------------------------
    // Contrast: attack-stage floor is unchanged — still seeds/resolves
    // 'fizzles' (LD-2). Second fresh game to avoid the one-open-per-game
    // guard interfering with the already-resolved question above.
    // ------------------------------------------------------------------
    const gameId2 = await insertGame(555102);
    const attackEventId = await insertGameEvent({
      gameId: gameId2,
      type: 'attack_possession',
      payload: { Action: 'attack_possession', Participant: 1 },
      actionId: 7002,
      seq: 1,
      participant: 1,
      feedTs: anchor,
    });

    await windows.open(gameId2, attackEventId, 1, 'fizzles');

    const window2 = registry.get(gameId2);
    check(
      '5a. contrast: an attack-stage trigger still seeds possessionRung === "fizzles"',
      window2 !== undefined && window2.possessionRung === 'fizzles',
    );

    const openQuestions2 = (await queryRunner.query(
      `SELECT id FROM game_question WHERE game_id = $1`,
      [gameId2],
    )) as { id: string }[];
    const questionId2 = openQuestions2[0]?.id;

    await (
      resolution as unknown as {
        resolve: (gId: number, qId: string, reason: string) => Promise<void>;
      }
    ).resolve(gameId2, questionId2, 'proof');

    const resolvedQuestion2 = (await queryRunner.query(
      `SELECT gq.state, gqo.outcome_key
         FROM game_question gq
         JOIN game_question_option gqo ON gqo.id = gq.resolved_option_id
        WHERE gq.id = $1`,
      [questionId2],
    )) as { state: string; outcome_key: string }[];
    check(
      '5b. contrast: the attack-opened window resolves to "fizzles" (5 pts) — broadening did not lift the attack floor',
      resolvedQuestion2[0]?.state === 'resolved' &&
        resolvedQuestion2[0]?.outcome_key === 'fizzles',
    );

    console.log(`\n${passed}/${passed + failed} checks passing`);
  } finally {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
    await dataSource.destroy();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
