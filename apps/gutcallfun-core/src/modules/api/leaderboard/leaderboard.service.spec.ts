import { DataSource } from 'typeorm';
import { LeaderboardService } from './leaderboard.service';
import { ListLeaderboardQueryDto } from './dto/list-leaderboard-query.dto';

/**
 * The leaderboard is now DERIVED from `user_game_answer` (see the tradeoff
 * block in leaderboard.service.ts), so the service takes a DataSource and
 * issues one raw statement rather than joining `user_score_profile` through a
 * repository.
 *
 * What is worth asserting here is the SHAPE of the SQL the four scopes produce
 * — specifically the things that would silently return wrong numbers rather
 * than throw: squad attribution living in the JOIN's ON clause, the game
 * predicate reaching both the participant set and the score sum, and parameter
 * ordering. Ordering/ranking correctness is Postgres's job and is asserted by
 * the DB proof described in the phase record, not mockable here.
 */

type RawRow = {
  user_id: string;
  handle: string;
  emoji: string | null;
  image: string | null;
  total_points: string;
  rank: string;
  total_rows: string;
};

function createDataSourceMock(rows: RawRow[]) {
  const query = jest.fn<Promise<RawRow[]>, [string, unknown[]?]>(() =>
    Promise.resolve(rows),
  );
  return {
    ds: { query } as unknown as DataSource,
    query,
  };
}

const row = (over: Partial<RawRow> = {}): RawRow => ({
  user_id: '00000000-0000-4000-8000-000000000001',
  handle: 'player',
  emoji: null,
  image: null,
  total_points: '100',
  rank: '1',
  total_rows: '1',
  ...over,
});

const q = (over: Partial<ListLeaderboardQueryDto> = {}) =>
  Object.assign(new ListLeaderboardQueryDto(), over);

/** Last SQL string the service issued, whitespace-collapsed for matching. */
const sqlOf = (query: jest.Mock): string =>
  String((query.mock.calls[0] as unknown[])[0]).replace(/\s+/g, ' ');

const paramsOf = (query: jest.Mock): unknown[] =>
  ((query.mock.calls[0] as unknown[])[1] ?? []) as unknown[];

describe('LeaderboardService', () => {
  describe('scope → SQL shape', () => {
    it('global board draws its participants from every user', async () => {
      const { ds, query } = createDataSourceMock([]);
      await new LeaderboardService(ds).findAll(q());

      const sql = sqlOf(query);
      expect(sql).toContain('FROM "user" u');
      expect(sql).not.toContain('uga.game_id =');
      expect(sql).not.toContain('sp.squad_id =');
      expect(paramsOf(query)).toEqual([20, 0]);
    });

    it('game board draws its participants from user_game, not from every user', async () => {
      const { ds, query } = createDataSourceMock([]);
      await new LeaderboardService(ds).findAll(q({ game_id: 42 }));

      const sql = sqlOf(query);
      // Everyone who JOINED must appear, including players who have not
      // answered yet — otherwise a player cannot find themselves on the live
      // board until their first correct answer.
      expect(sql).toContain('FROM user_game ug WHERE ug.game_id = $1');
      expect(sql).toContain('LEFT JOIN user_game_answer uga');
      expect(paramsOf(query)).toEqual([42, 20, 0]);
    });

    it('scopes squad membership by user_game.squad_id on the game board', async () => {
      const { ds, query } = createDataSourceMock([]);
      await new LeaderboardService(ds).findAll(q({ game_id: 42, squad_id: 7 }));

      const sql = sqlOf(query);
      // The squad a user played the game AS — not squad_participant, which
      // would include members who joined that same game solo or for another
      // squad.
      expect(sql).toContain('ug.game_id = $1 AND ug.squad_id = $2');
      expect(paramsOf(query)).toEqual([42, 7, 20, 0]);
    });

    it('uses active squad membership for the global squad board', async () => {
      const { ds, query } = createDataSourceMock([]);
      await new LeaderboardService(ds).findAll(q({ squad_id: 7 }));

      const sql = sqlOf(query);
      expect(sql).toContain('FROM squad_participant sp');
      expect(sql).toContain('sp.squad_id = $1');
      expect(sql).toContain('sp.active');
      expect(paramsOf(query)).toEqual([7, 20, 0]);
    });

    it('puts squad attribution in the JOIN condition, never in WHERE', async () => {
      const { ds, query } = createDataSourceMock([]);
      await new LeaderboardService(ds).findAll(q({ squad_id: 7 }));

      const sql = sqlOf(query);
      const joinAt = sql.indexOf('LEFT JOIN user_game_answer uga');
      const attributionAt = sql.indexOf('AND EXISTS ( SELECT 1 FROM user_game');
      const groupAt = sql.indexOf('GROUP BY p.user_id');

      // Moving this predicate into WHERE would DROP squad members with no
      // qualifying answer instead of scoring them zero — they would vanish
      // from their own squad's board rather than sit at the bottom of it.
      expect(attributionAt).toBeGreaterThan(joinAt);
      expect(attributionAt).toBeLessThan(groupAt);
    });
  });

  describe('response mapping', () => {
    it('coerces bigint SUM strings to numbers', async () => {
      // SUM() over an int column returns bigint, which node-postgres hands
      // back as a STRING. Without coercion the wire type silently changes.
      const { ds } = createDataSourceMock([
        row({ total_points: '9007199254740', rank: '3', total_rows: '9' }),
      ]);
      const result = await new LeaderboardService(ds).findAll(q());

      expect(typeof result.items[0].total_points).toBe('number');
      expect(result.items[0].total_points).toBe(9007199254740);
      expect(result.items[0].rank).toBe(3);
    });

    it('takes rank from SQL RANK() so ties share a rank', async () => {
      const { ds } = createDataSourceMock([
        row({ user_id: 'a', total_points: '300', rank: '1', total_rows: '3' }),
        row({ user_id: 'b', total_points: '200', rank: '2', total_rows: '3' }),
        row({ user_id: 'c', total_points: '200', rank: '2', total_rows: '3' }),
      ]);
      const result = await new LeaderboardService(ds).findAll(q());

      // Positional ranking (offset + i + 1) would render 1,2,3 here and show
      // two players on equal points at different ranks. With a 5/7/15/100
      // ladder ties are the common case, not the edge case.
      expect(result.items.map((e) => e.rank)).toEqual([1, 2, 2]);
    });

    it('reports the unpaginated total from the window count', async () => {
      const { ds } = createDataSourceMock([
        row({ total_rows: '137' }),
        row({ user_id: 'b', total_rows: '137' }),
      ]);
      const result = await new LeaderboardService(ds).findAll(
        q({ limit: 2, offset: 0 }),
      );

      expect(result.total).toBe(137);
      expect(result.items).toHaveLength(2);
    });

    it('returns an empty page without error when nobody qualifies', async () => {
      const { ds } = createDataSourceMock([]);
      const result = await new LeaderboardService(ds).findAll(q());

      // A squad-scoped board for a squad nobody has played for is empty, not
      // an error — and total must be 0, not undefined, since there is no row
      // to read the window count off.
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('applies the DTO pagination defaults to the SQL', async () => {
      const { ds, query } = createDataSourceMock([]);
      const result = await new LeaderboardService(ds).findAll(
        new ListLeaderboardQueryDto(),
      );

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(paramsOf(query)).toEqual([20, 0]);
    });
  });
});
