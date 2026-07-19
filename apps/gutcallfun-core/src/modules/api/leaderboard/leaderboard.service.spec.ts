import { Repository } from 'typeorm';
import { LeaderboardService } from './leaderboard.service';
import { UserEntity } from '../../../models/account/user.entity';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * LeaderboardService is now DB-backed (LDRB-01): it ranks real users by their
 * score-profile total rather than serving a fixture.
 *
 * The previous version of this spec constructed `new LeaderboardService()` with
 * no arguments and called `findAll()` synchronously, both of which stopped
 * being true once the repository was injected. It crashed the Jest worker with
 * "Cannot read properties of undefined (reading 'count')" — which takes
 * unrelated suites down with it rather than failing cleanly.
 *
 * What is worth asserting here is the APPLICATION-layer behaviour, not the SQL:
 * ordering and the join are Postgres's job and are not meaningfully testable
 * against a mock. Rank arithmetic, numeric coercion and pagination passthrough
 * are this service's own logic.
 */

type RawRow = {
  user_id: string;
  handle: string;
  image: string | null;
  emoji: string | null;
  total_points: string | number;
};

function createRepoMock(rows: RawRow[], total: number) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of [
    'leftJoin',
    'select',
    'orderBy',
    'addOrderBy',
    'limit',
    'offset',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn(async () => rows);

  return {
    count: jest.fn(async () => total),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  } as unknown as Repository<UserEntity> & { __qb: Record<string, jest.Mock> };
}

const row = (over: Partial<RawRow> = {}): RawRow => ({
  user_id: '00000000-0000-4000-8000-000000000001',
  handle: 'player',
  image: null,
  emoji: null,
  total_points: 100,
  ...over,
});

describe('LeaderboardService', () => {
  it('assigns rank starting at 1 for the first page', async () => {
    const repo = createRepoMock(
      [
        row({ user_id: 'a', total_points: 300 }),
        row({ user_id: 'b', total_points: 200 }),
        row({ user_id: 'c', total_points: 100 }),
      ],
      3,
    );
    const result = await new LeaderboardService(repo).findAll({
      limit: 20,
      offset: 0,
    });

    expect(result.items.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('continues rank across pages rather than restarting at 1', async () => {
    const repo = createRepoMock(
      [row({ user_id: 'd' }), row({ user_id: 'e' })],
      42,
    );
    const result = await new LeaderboardService(repo).findAll({
      limit: 2,
      offset: 20,
    });

    // Rank is offset-relative — a second page must not re-rank from 1.
    expect(result.items.map((e) => e.rank)).toEqual([21, 22]);
  });

  it('coerces total_points to a number when the driver returns a string', async () => {
    // user_score_profile.total_points is bigint, and node-postgres returns
    // bigint as a STRING. Without coercion the wire type silently changes from
    // number to string and breaks clients.
    const repo = createRepoMock([row({ total_points: '9007199254740' })], 1);
    const result = await new LeaderboardService(repo).findAll({
      limit: 20,
      offset: 0,
    });

    expect(typeof result.items[0].total_points).toBe('number');
    expect(result.items[0].total_points).toBe(9007199254740);
  });

  it('reports the unpaginated total, not the page size', async () => {
    const repo = createRepoMock([row(), row()], 137);
    const result = await new LeaderboardService(repo).findAll({
      limit: 2,
      offset: 0,
    });

    expect(result.total).toBe(137);
    expect(result.items).toHaveLength(2);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);
  });

  it('applies the DTO defaults (limit 20 / offset 0) to the query', async () => {
    // PaginationQueryDto carries field initializers, so a request that omits
    // both arrives at the service already defaulted — this asserts the
    // effective default reaches the SQL, not just the response envelope.
    const repo = createRepoMock([], 0);
    const result = await new LeaderboardService(repo).findAll(
      new PaginationQueryDto(),
    );

    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(repo.__qb.limit).toHaveBeenCalledWith(20);
    expect(repo.__qb.offset).toHaveBeenCalledWith(0);
  });

  it('returns an empty page without error when no users exist', async () => {
    const repo = createRepoMock([], 0);
    const result = await new LeaderboardService(repo).findAll({
      limit: 20,
      offset: 0,
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
