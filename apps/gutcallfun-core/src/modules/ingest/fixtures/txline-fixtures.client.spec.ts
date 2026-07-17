import { GameStatus } from '../../../models/game/enums';
import { TxlineFixturesClient, todayEpochDay, type TxlineFixture } from './txline-fixtures.client';
import { TxlineHttpClient } from './txline-http.client';

// Source: PLAN.md 02-04 Task 2 acceptance criteria — forward-only snapshot
// endpoint (RESEARCH Pitfall 1), past-fixture pull via a past startEpochDay
// anchor (D-09), no competition filter (D-10), 7-day upcoming window (D-11).
describe('TxlineFixturesClient (GAME-01)', () => {
  function fixture(overrides: Partial<TxlineFixture>): TxlineFixture {
    return {
      Ts: Date.now(),
      StartTime: Date.now(),
      Competition: 'Test Cup',
      CompetitionId: 1,
      FixtureGroupId: 10,
      Participant1Id: 100,
      Participant1: 'Team A',
      Participant2Id: 200,
      Participant2: 'Team B',
      FixtureId: 1,
      Participant1IsHome: true,
      ...overrides,
    };
  }

  it('Test 1: fetchPast(N) requests snapshot with a startEpochDay in the past', async () => {
    const requestMock = jest.fn().mockResolvedValue([]);
    const http = { request: requestMock } as unknown as TxlineHttpClient;
    const client = new TxlineFixturesClient(http);

    await client.fetchPast(20);

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [path] = requestMock.mock.calls[0];
    const match = /startEpochDay=(-?\d+)/.exec(String(path));
    expect(match).not.toBeNull();
    const requestedEpochDay = Number(match![1]);
    expect(requestedEpochDay).toBe(todayEpochDay() - 20);
    expect(requestedEpochDay).toBeLessThan(todayEpochDay());
  });

  it('Test 2: fetchPast(N) returns the last N fixtures by StartTime desc, marked finished', async () => {
    const now = Date.now();
    const fixtures = [
      fixture({ FixtureId: 1, StartTime: now - 5 * 86_400_000 }),
      fixture({ FixtureId: 2, StartTime: now - 1 * 86_400_000 }),
      fixture({ FixtureId: 3, StartTime: now - 3 * 86_400_000 }),
      fixture({ FixtureId: 4, StartTime: now + 86_400_000 }), // future — excluded from "past"
    ];
    const http = { request: jest.fn().mockResolvedValue(fixtures) } as unknown as TxlineHttpClient;
    const client = new TxlineFixturesClient(http);

    const result = await client.fetchPast(2);

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.FixtureId)).toEqual([2, 3]); // desc by StartTime, top 2
    expect(result.every((f) => f.status === GameStatus.FINISHED)).toBe(true);
  });

  it('Test 3: fetchUpcoming(7) calls snapshot(today) and returns fixtures within the next 7 days, marked scheduled', async () => {
    const now = Date.now();
    const fixtures = [
      fixture({ FixtureId: 1, StartTime: now + 2 * 86_400_000 }), // within window
      fixture({ FixtureId: 2, StartTime: now + 20 * 86_400_000 }), // outside window
      fixture({ FixtureId: 3, StartTime: now - 86_400_000 }), // already started — excluded
    ];
    const requestMock = jest.fn().mockResolvedValue(fixtures);
    const http = { request: requestMock } as unknown as TxlineHttpClient;
    const client = new TxlineFixturesClient(http);

    const result = await client.fetchUpcoming(7);

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [path] = requestMock.mock.calls[0];
    expect(String(path)).toContain(`startEpochDay=${todayEpochDay()}`);

    expect(result.map((f) => f.FixtureId)).toEqual([1]);
    expect(result[0].status).toBe(GameStatus.SCHEDULED);
  });

  it('Test 4: snapshot() applies no competition filter — every returned fixture is kept', async () => {
    const fixtures = [
      fixture({ FixtureId: 1, CompetitionId: 501 }),
      fixture({ FixtureId: 2, CompetitionId: 999 }),
    ];
    const http = { request: jest.fn().mockResolvedValue(fixtures) } as unknown as TxlineHttpClient;
    const client = new TxlineFixturesClient(http);

    const result = await client.snapshot(todayEpochDay());

    expect(result).toHaveLength(2);
  });

  it('Test 5: snapshot() handles an empty response without throwing', async () => {
    const http = { request: jest.fn().mockResolvedValue([]) } as unknown as TxlineHttpClient;
    const client = new TxlineFixturesClient(http);

    await expect(client.snapshot(todayEpochDay())).resolves.toEqual([]);
  });
});
