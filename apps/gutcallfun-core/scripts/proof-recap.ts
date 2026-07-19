/**
 * Proves the recap read path against the REAL local Postgres inside a single
 * rolled-back transaction — no rows survive a run, so re-running is safe and
 * idempotent.
 *
 * Deliberately constructs the REAL `RecapService` and `LeaderboardService` (not
 * a hand-copy of their SQL): binding them to a `QueryRunner` transaction via a
 * thin `{ query }` shim in place of the app's `DataSource`. A copied query
 * proves nothing about the code that ships.
 *
 * Usage: npm run proof:recap
 */
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import dataSource from '../src/db/data-source';
import { RecapService } from '../src/modules/api/games/recap.service';
import { LeaderboardService } from '../src/modules/api/leaderboard/leaderboard.service';
import { ListLeaderboardQueryDto } from '../src/modules/api/leaderboard/dto/list-leaderboard-query.dto';

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

/** Recursively asserts every numeric-shaped field is a real `number`, never a
 * pg bigint/numeric string — walking the whole object rather than
 * spot-checking, since the failure is silent in whichever field is missed. */
function walkNumbers(value: unknown, path: string, offenders: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkNumbers(v, `${path}[${i}]`, offenders));
    return;
  }
  const numericFieldNames = new Set([
    'id',
    'score_p1',
    'score_p2',
    'total_points',
    'answered',
    'resolved',
    'exact',
    'voided',
    'hit_rate',
    'points',
    'squad_id',
    'rank',
    'of',
    'participant',
    'awarded_points',
    'minute',
    'value',
  ]);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (numericFieldNames.has(k) && v !== null && typeof v !== 'number') {
      offenders.push(`${path}.${k} = ${JSON.stringify(v)} (${typeof v})`);
    }
    walkNumbers(v, `${path}.${k}`, offenders);
  }
}

async function main(): Promise<void> {
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  // Thin shim so the REAL services run against this transaction instead of
  // the app's pooled DataSource.
  const txDataSource = {
    query: (sql: string, params?: unknown[]) => queryRunner.query(sql, params),
  } as unknown as DataSource;

  try {
    const leaderboardService = new LeaderboardService(txDataSource);
    const recapService = new RecapService(txDataSource, leaderboardService);

    // ------------------------------------------------------------------
    // Fixture
    // ------------------------------------------------------------------
    // game.id is GENERATED ALWAYS AS IDENTITY — let the sequence assign it and
    // read it back via RETURNING rather than fighting the identity column.
    const gameRows = (await queryRunner.query(
      `INSERT INTO game
         (fixture_id, status, participant1_is_home, team1_name, team2_name,
          team1_jersey_color, team2_jersey_color, competition, score_p1, score_p2)
       VALUES ($1, 'finished', true, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        555001,
        'Brazil',
        'Argentina',
        '#FFD700',
        '#75AADB',
        'World Cup 2026',
        1,
        0,
      ],
    )) as { id: number }[];
    const gameId = gameRows[0].id;

    const anchor = new Date('2026-07-18T15:00:00.000Z');
    const minutes = (n: number) => new Date(anchor.getTime() + n * 60_000);

    async function insertEvent(opts: {
      id: string;
      type: string;
      payload: Record<string, unknown>;
      actionId: number;
      seq: number;
      confirmed: boolean | null;
      participant: number | null;
      feedTs: Date;
    }): Promise<void> {
      await queryRunner.query(
        `INSERT INTO game_event
           (id, game_id, type, payload, action_id, seq, confirmed, participant, feed_ts)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
        [
          opts.id,
          gameId,
          opts.type,
          JSON.stringify(opts.payload),
          opts.actionId,
          opts.seq,
          opts.confirmed,
          opts.participant,
          opts.feedTs,
        ],
      );
    }

    // game_event rows spanning both payload shapes, plus one with NO Clock at
    // all (exercises the feed_ts-anchor fallback). These become trigger events
    // for game_question rows further down.
    const evWrapped = randomUUID();
    const evBare = randomUUID();
    const evNoClock = randomUUID();
    await insertEvent({
      id: evWrapped,
      type: 'attack_possession',
      payload: { Update: { Clock: { Seconds: 25 * 60 } } }, // wrapped, 25 min
      actionId: 1,
      seq: 1,
      confirmed: null,
      participant: 1,
      feedTs: minutes(25),
    });
    await insertEvent({
      id: evBare,
      type: 'attack_possession',
      payload: { Clock: { Seconds: 40 * 60 } }, // bare, 40 min
      actionId: 2,
      seq: 2,
      confirmed: null,
      participant: 1,
      feedTs: minutes(40),
    });
    await insertEvent({
      id: evNoClock,
      type: 'attack_possession',
      payload: { Action: 'attack_possession' }, // no Clock at all
      actionId: 3,
      seq: 3,
      confirmed: null,
      participant: 2,
      feedTs: minutes(50),
    });

    // Possession events across all four stages for both participants, split
    // into two clusters (minutes 0-29 for participant1, 45-74 for
    // participant2) so bucket averages cannot cancel out.
    const stages = [
      'safe_possession',
      'attack_possession',
      'danger_possession',
      'high_danger_possession',
    ];
    let seq = 10;
    for (let i = 0; i < 60; i++) {
      seq++;
      const isFirstHalf = i < 30;
      await insertEvent({
        id: randomUUID(),
        type: stages[i % stages.length],
        payload: {},
        actionId: 1000 + i,
        seq,
        confirmed: null,
        participant: isFirstHalf ? 1 : 2,
        feedTs: minutes(isFirstHalf ? i : i - 30 + 45),
      });
    }

    // Anchor is MIN(feed_ts) across the whole game — the earliest possession
    // event above (minute 0) makes `anchor` (the JS Date) exactly the anchor
    // the service will compute.

    // One goal emitted twice under the same action_id: confirmed=false, then
    // confirmed=true ~80s later in reality (timing irrelevant to this proof).
    const goalActionId = 5000;
    const goalPayload = {
      Update: {
        Clock: { Seconds: 30 * 60 },
        Score: {
          Participant1: { Total: { Goals: 1 } },
          Participant2: { Total: { Goals: 0 } },
        },
      },
    };
    await insertEvent({
      id: randomUUID(),
      type: 'goal',
      payload: goalPayload,
      actionId: goalActionId,
      seq: 200,
      confirmed: false,
      participant: 1,
      feedTs: minutes(30),
    });
    await insertEvent({
      id: randomUUID(),
      type: 'goal',
      payload: goalPayload,
      actionId: goalActionId,
      seq: 201,
      confirmed: true,
      participant: 1,
      feedTs: minutes(30),
    });

    // Users: caller, a squad-mate-free "other" participant, a fresh
    // never-answered user.
    const callerId = randomUUID();
    const otherUserId = randomUUID();
    const freshUserId = randomUUID();
    for (const [id, handle] of [
      [callerId, 'proof_caller'],
      [otherUserId, 'proof_other'],
      [freshUserId, 'proof_fresh'],
    ] as const) {
      await queryRunner.query(
        `INSERT INTO "user" (id, wallet_address, share_code, handle) VALUES ($1, $2, $3, $4)`,
        [
          id,
          `wallet_${id}`,
          id.replace(/-/g, '').slice(0, 8).toUpperCase(),
          handle,
        ],
      );
    }

    const squadId = 900001;
    await queryRunner.query(
      `INSERT INTO squad (id, name, invite_code) VALUES ($1, $2, $3)`,
      [squadId, 'The Ultras', 'PROOFCODE'],
    );
    // Caller joins WITH a squad; the other user joins SOLO (squad_id NULL).
    await queryRunner.query(
      `INSERT INTO user_game (game_id, user_id, squad_id) VALUES ($1, $2, $3)`,
      [gameId, callerId, squadId],
    );
    await queryRunner.query(
      `INSERT INTO user_game (game_id, user_id, squad_id) VALUES ($1, $2, NULL)`,
      [gameId, otherUserId],
    );

    const expiresAt = minutes(999);

    async function insertQuestion(opts: {
      id: string;
      triggerEventId: string | null;
      content: string;
      state: string;
    }): Promise<void> {
      await queryRunner.query(
        `INSERT INTO game_question
           (id, game_id, trigger_event_id, content, participant, state, answer_window_ttl, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          opts.id,
          gameId,
          opts.triggerEventId,
          opts.content,
          1,
          opts.state,
          5,
          expiresAt,
        ],
      );
    }

    async function insertOptions(
      questionId: string,
      resolvedKey: 'shot' | 'fizzles' | null,
    ): Promise<{ shot: string; fizzles: string }> {
      const shotId = randomUUID();
      const fizzlesId = randomUUID();
      await queryRunner.query(
        `INSERT INTO game_question_option (id, game_question_id, outcome_key, base_gain, display_order)
         VALUES ($1, $2, 'shot', 15, 1), ($3, $2, 'fizzles', 5, 2)`,
        [shotId, questionId, fizzlesId],
      );
      if (resolvedKey) {
        const resolvedOptionId = resolvedKey === 'shot' ? shotId : fizzlesId;
        await queryRunner.query(
          `UPDATE game_question SET resolved_option_id = $1 WHERE id = $2`,
          [resolvedOptionId, questionId],
        );
      }
      return { shot: shotId, fizzles: fizzlesId };
    }

    async function insertAnswer(opts: {
      userId: string;
      questionId: string;
      selectedOptionId: string;
      awardedPoints: number | null;
      successfulOutcome: boolean | null;
    }): Promise<void> {
      await queryRunner.query(
        `INSERT INTO user_game_answer
           (id, user_id, game_id, game_question_id, selected_option_id, awarded_points, successful_outcome)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          opts.userId,
          gameId,
          opts.questionId,
          opts.selectedOptionId,
          opts.awardedPoints,
          opts.successfulOutcome,
        ],
      );
    }

    // Three game_question rows: one with a trigger_event_id, one with it
    // NULL, one voided.
    const qWithTrigger = randomUUID();
    const qNoTrigger = randomUUID();
    const qVoided = randomUUID();
    await insertQuestion({
      id: qWithTrigger,
      triggerEventId: evWrapped,
      content: 'Will this attack end in a shot?',
      state: 'resolved',
    });
    await insertQuestion({
      id: qNoTrigger,
      triggerEventId: null,
      content: 'Fizzle or danger?',
      state: 'resolved',
    });
    await insertQuestion({
      id: qVoided,
      triggerEventId: evBare,
      content: 'Will this attack fizzle?',
      state: 'voided',
    });
    const optWithTrigger = await insertOptions(qWithTrigger, 'shot');
    const optNoTrigger = await insertOptions(qNoTrigger, 'fizzles');
    const optVoided = await insertOptions(qVoided, null);

    // Answers for the caller: a scoring one, a missed one, a voided one; plus
    // one answer from a DIFFERENT user in the same game (scoping check).
    await insertAnswer({
      userId: callerId,
      questionId: qWithTrigger,
      selectedOptionId: optWithTrigger.shot,
      awardedPoints: 15,
      successfulOutcome: true,
    });
    await insertAnswer({
      userId: callerId,
      questionId: qNoTrigger,
      selectedOptionId: optNoTrigger.shot,
      awardedPoints: 0,
      successfulOutcome: false,
    });
    await insertAnswer({
      userId: callerId,
      questionId: qVoided,
      selectedOptionId: optVoided.shot,
      awardedPoints: null,
      successfulOutcome: null,
    });
    await insertAnswer({
      userId: otherUserId,
      questionId: qWithTrigger,
      selectedOptionId: optWithTrigger.fizzles,
      awardedPoints: 100,
      successfulOutcome: true,
    });

    // Two more caller answers exercising the bare-Clock and no-Clock minute
    // branches directly (checks 3 and 4).
    const bareCheckQuestion = randomUUID();
    await insertQuestion({
      id: bareCheckQuestion,
      triggerEventId: evBare,
      content: 'bare-clock check',
      state: 'resolved',
    });
    const bareOpt = await insertOptions(bareCheckQuestion, 'shot');
    await insertAnswer({
      userId: callerId,
      questionId: bareCheckQuestion,
      selectedOptionId: bareOpt.shot,
      awardedPoints: 15,
      successfulOutcome: true,
    });

    const noClockQuestion = randomUUID();
    await insertQuestion({
      id: noClockQuestion,
      triggerEventId: evNoClock,
      content: 'no-clock check',
      state: 'resolved',
    });
    const noClockOpt = await insertOptions(noClockQuestion, 'shot');
    await insertAnswer({
      userId: callerId,
      questionId: noClockQuestion,
      selectedOptionId: noClockOpt.shot,
      awardedPoints: 15,
      successfulOutcome: true,
    });

    // ------------------------------------------------------------------
    // Checks
    // ------------------------------------------------------------------

    console.log('Proof: GET /games/:game_id/recap\n');

    const recap = await recapService.getRecap(gameId, callerId);

    // 1. A FINISHED game returns a fully-populated recap.
    check(
      '1. FINISHED game returns a fully-populated recap',
      recap.game.status === 'finished' &&
        recap.calls.length > 0 &&
        recap.goals.length > 0 &&
        recap.pressure.length > 0,
    );

    // 2. Wrapped Update.Clock.Seconds -> minute.
    const callWithTrigger = recap.calls.find(
      (c) => c.question_content === 'Will this attack end in a shot?',
    );
    check(
      '2. wrapped Update.Clock.Seconds yields the right minute',
      callWithTrigger?.minute === 25,
    );

    // 3. Bare Clock.Seconds -> minute.
    const bareCall = recap.calls.find(
      (c) => c.question_content === 'bare-clock check',
    );
    check(
      '3. bare Clock.Seconds yields the right minute',
      bareCall?.minute === 40,
    );

    // 4. No-Clock event -> feed_ts anchor fallback, plausible minute.
    const noClockCall = recap.calls.find(
      (c) => c.question_content === 'no-clock check',
    );
    check(
      '4. no-Clock event falls back to feed_ts anchor with a plausible minute',
      noClockCall != null &&
        noClockCall.minute !== null &&
        Math.abs(noClockCall.minute - 50) < 1,
    );

    // 5. trigger_event_id NULL -> minute strictly null.
    const noTriggerCall = recap.calls.find(
      (c) => c.question_content === 'Fizzle or danger?',
    );
    check(
      '5. trigger_event_id NULL yields minute strictly null (not 0)',
      noTriggerCall !== undefined && noTriggerCall.minute === null,
    );

    // 6. Pressure: participant-1 positive, participant-2 negative, len <= 40.
    check(
      '6. Pressure: participant1 positive, participant2 negative, length <= 40',
      recap.pressure.length <= 40 &&
        recap.pressure.some((p) => p.value > 0) &&
        recap.pressure.some((p) => p.value < 0),
    );

    // 7. Pressure for a game with zero possession rows is [].
    const emptyGameRows = (await queryRunner.query(
      `INSERT INTO game (fixture_id, status, participant1_is_home, team1_name, team2_name, score_p1, score_p2)
       VALUES ($1, 'finished', true, $2, $3, $4, $5)
       RETURNING id`,
      [555002, 'Team X', 'Team Y', 0, 0],
    )) as { id: number }[];
    const emptyGameId = emptyGameRows[0].id;
    const emptyRecap = await recapService.getRecap(emptyGameId, callerId);
    check(
      '7. zero possession rows yields an empty pressure array, not a throw',
      emptyRecap.pressure.length === 0,
    );

    // 8. The doubled goal yields exactly ONE entry with the payload's running score.
    check(
      '8. doubled goal (confirmed false then true) yields exactly one entry with correct score',
      recap.goals.length === 1 &&
        recap.goals[0].score_p1 === 1 &&
        recap.goals[0].score_p2 === 0,
    );

    // 9. me aggregates match hand-computed fixture values; best_call scores highest.
    // Caller's 5 answers: shot/resolved-shot(15,exact), fizzle-or-danger/resolved-fizzles(0,not exact),
    // voided(null), bare-clock/resolved-shot(15,exact), no-clock/resolved-shot(15,exact).
    check(
      '9. me aggregates match hand-computed fixture values',
      recap.me.answered === 5 &&
        recap.me.resolved === 4 &&
        recap.me.total_points === 45 &&
        recap.me.exact === 3 &&
        recap.me.voided === 1 &&
        recap.me.best_call !== null &&
        recap.me.best_call.points === 15,
    );

    // 10. hit_rate is 0 for a caller with nothing resolved.
    const freshRecap = await recapService.getRecap(gameId, freshUserId);
    check(
      '10. hit_rate is 0 for a caller with nothing resolved',
      freshRecap.me.hit_rate === 0,
    );

    // 11. ranks.squad null for the solo joiner, non-null for the squad member;
    //     ranks.global.of equals the number of users in scope.
    const soloRecap = await recapService.getRecap(gameId, otherUserId);
    const totalUsers = (await queryRunner.query(
      `SELECT COUNT(*) AS count FROM "user"`,
    )) as { count: string }[];
    check(
      '11. ranks.squad null for solo joiner, non-null for squad member, global.of matches user count',
      soloRecap.ranks.squad === null &&
        recap.ranks.squad !== null &&
        recap.ranks.global?.of === Number(totalUsers[0].count),
    );

    // 12. ranks.global.rank for the caller equals findAll's rank for the same user (anti-drift).
    const board = await leaderboardService.findAll(
      Object.assign(new ListLeaderboardQueryDto(), { limit: 100, offset: 0 }),
    );
    const boardEntry = board.items.find((i) => i.user_id === callerId);
    check(
      '12. ranks.global.rank agrees with LeaderboardService.findAll (anti-drift)',
      boardEntry !== undefined && recap.ranks.global?.rank === boardEntry.rank,
    );

    // 13. Caller scoping: the other user's answers appear in neither calls nor me.total_points.
    const otherAnswerLeaked = recap.calls.some((c) => c.awarded_points === 100);
    check(
      "13. caller scoping: another user's answers are absent from calls and me.total_points",
      !otherAnswerLeaked && recap.me.total_points === 45,
    );

    // 14. Every numeric leaf is typeof 'number'.
    const offenders: string[] = [];
    walkNumbers(recap, 'recap', offenders);
    check(
      `14. every numeric leaf is typeof 'number'${offenders.length ? ` (offenders: ${offenders.join(', ')})` : ''}`,
      offenders.length === 0,
    );

    // 15. An unknown game_id throws NotFoundException.
    let threw = false;
    try {
      await recapService.getRecap(999999999, callerId);
    } catch (e) {
      threw = e instanceof NotFoundException;
    }
    check('15. unknown game_id throws NotFoundException', threw);

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
