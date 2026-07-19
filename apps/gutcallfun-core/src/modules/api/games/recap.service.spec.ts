import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { RecapService } from './recap.service';

/**
 * RecapService takes only a DataSource (+ LeaderboardService, itself
 * DataSource-only) — no in-memory registry. Every scenario below constructs
 * both from the SAME DataSource mock, matching that contract exactly.
 *
 * Ordering/ranking correctness is Postgres's job and is asserted by the DB
 * proof script (proof-recap.ts), not mockable here — what is asserted here
 * is minute derivation, pressure mapping, `me` aggregates, and numeric
 * coercion, all of which are pure TS logic over rows shaped like real pg
 * output (bigint/numeric columns arriving as strings).
 */

type Rule = { match: (sql: string, params: unknown[]) => boolean; rows: unknown[] };

const ANCHOR = new Date('2026-07-18T15:00:00.000Z');

function isGameRow(sql: string): boolean {
  return sql.includes('FROM game') && sql.includes('WHERE id = $1');
}
function isAnchorRow(sql: string): boolean {
  return sql.includes('MIN(feed_ts) AS anchor');
}
function isSquadRow(sql: string): boolean {
  return sql.includes('FROM user_game ug') && sql.includes('LEFT JOIN squad');
}
function isCallsRow(sql: string): boolean {
  return sql.includes('FROM user_game_answer uga');
}
function isGoalsRow(sql: string): boolean {
  return sql.includes("type = 'goal'");
}
function isPressureRow(sql: string): boolean {
  return sql.includes('safe_possession');
}
function isRankedRow(sql: string): boolean {
  return sql.includes('FROM ranked');
}
function isSquadScopedRank(sql: string): boolean {
  return isRankedRow(sql) && sql.includes('squad_id');
}
function isGameScopedRank(sql: string): boolean {
  return (
    isRankedRow(sql) &&
    !sql.includes('squad_id') &&
    sql.includes('FROM user_game ug')
  );
}
function isGlobalRank(sql: string): boolean {
  return isRankedRow(sql) && sql.includes('FROM "user" u');
}

const defaultGameRow = {
  id: 1,
  team1_name: 'Brazil',
  team2_name: 'Argentina',
  score_p1: 1,
  score_p2: 1,
  status: 'finished',
  team1_jersey_color: '#FFD700',
  team2_jersey_color: '#75AADB',
  participant1_is_home: true,
  competition: 'World Cup 2026',
};

function buildDataSource(overrides: Partial<Record<string, unknown[]>> = {}) {
  const rules: Rule[] = [
    { match: (s) => isSquadScopedRank(s), rows: overrides.squadRank ?? [] },
    { match: (s) => isGameScopedRank(s), rows: overrides.gameRank ?? [] },
    { match: (s) => isGlobalRank(s), rows: overrides.globalRank ?? [] },
    { match: (s) => isGameRow(s), rows: overrides.game ?? [defaultGameRow] },
    { match: (s) => isAnchorRow(s), rows: overrides.anchor ?? [{ anchor: ANCHOR }] },
    {
      match: (s) => isSquadRow(s),
      rows: overrides.squad ?? [{ squad_id: null, squad_name: null }],
    },
    { match: (s) => isCallsRow(s), rows: overrides.calls ?? [] },
    { match: (s) => isGoalsRow(s), rows: overrides.goals ?? [] },
    { match: (s) => isPressureRow(s), rows: overrides.pressure ?? [] },
  ];

  const query = jest.fn(
    async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
      for (const rule of rules) {
        if (rule.match(sql, params)) return rule.rows;
      }
      return [];
    },
  );
  return { ds: { query } as unknown as DataSource, query };
}

function makeService(overrides: Partial<Record<string, unknown[]>> = {}) {
  const { ds } = buildDataSource(overrides);
  const leaderboard = new LeaderboardService(ds);
  return new RecapService(ds, leaderboard);
}

const wrapped = (seconds: number) => ({ Update: { Clock: { Seconds: seconds } } });
const bare = (seconds: number) => ({ Clock: { Seconds: seconds } });

describe('RecapService', () => {
  it('constructs with only a DataSource mock (no in-memory registry dependency)', () => {
    const { ds } = buildDataSource();
    expect(() => new RecapService(ds, new LeaderboardService(ds))).not.toThrow();
  });

  it('throws NotFoundException for an unknown game_id', async () => {
    const service = makeService({ game: [] });
    await expect(service.getRecap(999, 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('minute derivation', () => {
    it('reads the Clock reading from a wrapped Update payload', async () => {
      const service = makeService({
        calls: [
          {
            question_content: 'Q1',
            participant: 1,
            state: 'resolved',
            picked_outcome: 'shot',
            actual_outcome: 'shot',
            awarded_points: 15,
            successful_outcome: true,
            created_at: new Date(),
            payload: wrapped(1500), // 25 minutes
            feed_ts: new Date(),
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.calls[0].minute).toBe(25);
    });

    it('reads the Clock reading from a bare payload', async () => {
      const service = makeService({
        calls: [
          {
            question_content: 'Q1',
            participant: 1,
            state: 'resolved',
            picked_outcome: 'shot',
            actual_outcome: 'shot',
            awarded_points: 15,
            successful_outcome: true,
            created_at: new Date(),
            payload: bare(600), // 10 minutes
            feed_ts: new Date(),
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.calls[0].minute).toBe(10);
    });

    it('falls back to feed_ts minus anchor when the payload has no Clock', async () => {
      const feedTs = new Date(ANCHOR.getTime() + 12 * 60_000);
      const service = makeService({
        calls: [
          {
            question_content: 'Q1',
            participant: 1,
            state: 'open',
            picked_outcome: 'shot',
            actual_outcome: null,
            awarded_points: null,
            successful_outcome: null,
            created_at: new Date(),
            payload: { Action: 'no_clock_here' },
            feed_ts: feedTs,
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.calls[0].minute).toBe(12);
    });

    it('returns null (not 0) when trigger_event_id is null (payload absent)', async () => {
      const service = makeService({
        calls: [
          {
            question_content: 'Q1',
            participant: null,
            state: 'voided',
            picked_outcome: 'shot',
            actual_outcome: null,
            awarded_points: null,
            successful_outcome: null,
            created_at: new Date(),
            payload: null,
            feed_ts: null,
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.calls[0].minute).toBeNull();
    });

    it('clamps a stoppage-time minute into [0, 95]', async () => {
      const service = makeService({
        calls: [
          {
            question_content: 'Q1',
            participant: 1,
            state: 'resolved',
            picked_outcome: 'shot',
            actual_outcome: 'shot',
            awarded_points: 7,
            successful_outcome: true,
            created_at: new Date(),
            payload: wrapped(120 * 60), // 120 minutes -> clamp to 95
            feed_ts: new Date(),
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.calls[0].minute).toBe(95);
    });
  });

  describe('pressure', () => {
    it('participant 1 is positive, participant 2 is negative, capped at 40 points', async () => {
      // First half of the timeline is all participant1, second half all
      // participant2 — grouped, not interleaved, so bucket averages cannot
      // cancel to zero the way alternating rows in the same bucket would.
      const p1Rows = Array.from({ length: 40 }, (_, i) => ({
        feed_ts: new Date(ANCHOR.getTime() + i * 60_000),
        type: 'danger_possession',
        participant: 1,
        payload: {},
      }));
      const p2Rows = Array.from({ length: 40 }, (_, i) => ({
        feed_ts: new Date(ANCHOR.getTime() + (40 + i) * 60_000),
        type: 'danger_possession',
        participant: 2,
        payload: {},
      }));
      const service = makeService({ pressure: [...p1Rows, ...p2Rows] });
      const result = await service.getRecap(1, 'user-1');
      expect(result.pressure.length).toBeLessThanOrEqual(40);
      expect(result.pressure.some((p) => p.value > 0)).toBe(true);
      expect(result.pressure.some((p) => p.value < 0)).toBe(true);
    });

    it('returns an empty array, not a throw, for zero possession rows', async () => {
      const service = makeService({ pressure: [] });
      const result = await service.getRecap(1, 'user-1');
      expect(result.pressure).toEqual([]);
    });
  });

  describe('me aggregates', () => {
    it('hit_rate is 0 (not NaN) when nothing has resolved', async () => {
      const service = makeService({
        calls: [
          {
            question_content: 'Q1',
            participant: 1,
            state: 'open',
            picked_outcome: 'shot',
            actual_outcome: null,
            awarded_points: null,
            successful_outcome: null,
            created_at: new Date(),
            payload: null,
            feed_ts: null,
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.me.hit_rate).toBe(0);
      expect(Number.isNaN(result.me.hit_rate)).toBe(false);
    });

    it('best_call is null when no answer scored points', async () => {
      const service = makeService({
        calls: [
          {
            question_content: 'Q1',
            participant: 1,
            state: 'resolved',
            picked_outcome: 'shot',
            actual_outcome: 'fizzles',
            awarded_points: 0,
            successful_outcome: false,
            created_at: new Date(),
            payload: wrapped(60),
            feed_ts: new Date(),
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.me.best_call).toBeNull();
    });

    it('best_call picks the highest-scoring resolved call', async () => {
      const service = makeService({
        calls: [
          {
            question_content: 'low',
            participant: 1,
            state: 'resolved',
            picked_outcome: 'shot',
            actual_outcome: 'shot',
            awarded_points: 7,
            successful_outcome: true,
            created_at: new Date(),
            payload: wrapped(60),
            feed_ts: new Date(),
          },
          {
            question_content: 'high',
            participant: 1,
            state: 'resolved',
            picked_outcome: 'goal',
            actual_outcome: 'goal',
            awarded_points: 100,
            successful_outcome: true,
            created_at: new Date(),
            payload: wrapped(120),
            feed_ts: new Date(),
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.me.best_call?.content).toBe('high');
      expect(result.me.best_call?.points).toBe(100);
    });

    it('coerces string numeric columns (pg bigint/numeric-as-string) to real numbers', async () => {
      const service = makeService({
        calls: [
          {
            question_content: 'Q1',
            participant: 1,
            state: 'resolved',
            picked_outcome: 'shot',
            actual_outcome: 'shot',
            awarded_points: '15' as unknown as number, // pg int column can still surface as string
            successful_outcome: true,
            created_at: new Date(),
            payload: wrapped(60),
            feed_ts: new Date(),
          },
        ],
        game: [{ ...defaultGameRow, score_p1: '2', score_p2: '1' }],
        globalRank: [{ rank: '3', total_rows: '50' }],
      });
      const result = await service.getRecap(1, 'user-1');

      expect(typeof result.me.total_points).toBe('number');
      expect(result.me.total_points).toBe(15);
      expect(typeof result.calls[0].awarded_points).toBe('number');
      expect(typeof result.game.score_p1).toBe('number');
      expect(result.game.score_p1).toBe(2);
      expect(typeof result.ranks.global?.rank).toBe('number');
      expect(result.ranks.global?.rank).toBe(3);
    });
  });

  describe('squad ranks', () => {
    it('ranks.squad is null when the caller joined solo (squad_id IS NULL)', async () => {
      const service = makeService({
        squad: [{ squad_id: null, squad_name: null }],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.ranks.squad).toBeNull();
      expect(result.me.squad_id).toBeNull();
    });

    it('ranks.squad is populated when the caller has a squad', async () => {
      const service = makeService({
        squad: [{ squad_id: 3, squad_name: 'The Ultras' }],
        squadRank: [{ rank: '1', total_rows: '4' }],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.ranks.squad).toEqual({ rank: 1, of: 4 });
      expect(result.me.squad_name).toBe('The Ultras');
    });
  });

  describe('goals', () => {
    it('reads the running score off the payload through the Update wrapper', async () => {
      const service = makeService({
        goals: [
          {
            feed_ts: new Date(ANCHOR.getTime() + 20 * 60_000),
            participant: 1,
            payload: {
              Update: {
                Clock: { Seconds: 20 * 60 },
                Score: {
                  Participant1: { Total: { Goals: 1 } },
                  Participant2: { Total: { Goals: 0 } },
                },
              },
            },
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.goals).toHaveLength(1);
      expect(result.goals[0].score_p1).toBe(1);
      expect(result.goals[0].score_p2).toBe(0);
      expect(result.goals[0].minute).toBe(20);
    });

    it('drops a goal whose payload score exceeds the game final score (VAR-discard guard)', async () => {
      const service = makeService({
        game: [{ ...defaultGameRow, score_p1: 1, score_p2: 0 }],
        goals: [
          {
            feed_ts: new Date(ANCHOR.getTime() + 20 * 60_000),
            participant: 2,
            payload: {
              Update: {
                Clock: { Seconds: 20 * 60 },
                Score: {
                  Participant1: { Total: { Goals: 1 } },
                  Participant2: { Total: { Goals: 1 } }, // exceeds final total of 1
                },
              },
            },
          },
        ],
      });
      const result = await service.getRecap(1, 'user-1');
      expect(result.goals).toHaveLength(0);
    });
  });
});
