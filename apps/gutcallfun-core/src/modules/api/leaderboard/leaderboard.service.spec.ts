import { LeaderboardService } from './leaderboard.service';

// Source: 02.1-03-PLAN.md Task 3 acceptance criteria (LDRB-01, D-04).
describe('LeaderboardService', () => {
  let service: LeaderboardService;

  beforeEach(() => {
    service = new LeaderboardService();
  });

  it('orders results by total_points descending', () => {
    const result = service.findAll({ limit: 20, offset: 0 });
    const points = result.items.map((e) => e.total_points);
    const sortedDesc = [...points].sort((a, b) => b - a);
    expect(points).toEqual(sortedDesc);
  });

  it('rank is strictly increasing from 1', () => {
    const result = service.findAll({ limit: 20, offset: 0 });
    result.items.forEach((entry, index) => {
      expect(entry.rank).toBe(index + 1);
    });
  });

  it('ten concurrent findAll calls all produce deeply-equal results (no mutable per-request state)', async () => {
    const calls = Array.from({ length: 10 }, () =>
      Promise.resolve(service.findAll({ limit: 20, offset: 0 })),
    );
    const results = await Promise.all(calls);
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });
});
