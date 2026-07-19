import { ConfigService } from '@nestjs/config';
import { GameStatus } from '../../../models/game/enums';
import { GameEntity } from '../../../models/game/game.entity';
import { FixturesCronService } from './fixtures-cron.service';
import { DiscoveredFixture, TxlineFixturesClient } from './txline-fixtures.client';

// Source: PLAN.md 02-04 Task 2 acceptance criteria — upsert by fixture_id
// (create/update), no competition filter, empty-response safety (GAME-01).
describe('FixturesCronService (GAME-01)', () => {
  function discovered(overrides: Partial<DiscoveredFixture>): DiscoveredFixture {
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
      status: GameStatus.SCHEDULED,
      ...overrides,
    };
  }

  function buildRepoMock(existingByFixtureId: Map<number, Partial<GameEntity>>) {
    const findOne = jest.fn(async ({ where: { fixtureId } }: { where: { fixtureId: number } }) => {
      return existingByFixtureId.get(fixtureId) ?? null;
    });
    const create = jest.fn((partial: Partial<GameEntity>) => ({ ...partial }) as GameEntity);
    const save = jest.fn(async (entity: GameEntity) => entity);
    const update = jest.fn(async () => ({ affected: 1 }));
    return { findOne, create, save, update } as const;
  }

  function buildConfig(pastFixturesCount = 20): ConfigService {
    return { get: () => pastFixturesCount } as unknown as ConfigService;
  }

  it('Test 1: upserts by fixture_id — an existing fixture_id updates, a new one inserts', async () => {
    const existing = { id: 55, fixtureId: 2, status: GameStatus.SCHEDULED } as GameEntity;
    const repo = buildRepoMock(new Map([[2, existing]]));
    const fixturesClient = {
      fetchUpcoming: jest.fn().mockResolvedValue([discovered({ FixtureId: 1 })]),
      fetchPast: jest.fn().mockResolvedValue([discovered({ FixtureId: 2, status: GameStatus.FINISHED })]),
    } as unknown as TxlineFixturesClient;

    const service = new FixturesCronService(fixturesClient, repo as any, buildConfig());
    await service.discoverFixtures();

    expect(repo.create).toHaveBeenCalledTimes(1); // only the new fixture_id=1
    expect(repo.save).toHaveBeenCalledTimes(1); // the insert only
    expect(repo.update).toHaveBeenCalledTimes(1); // the existing row, via partial update

    const savedFixtureIds = repo.save.mock.calls.map(([entity]) => entity.fixtureId).sort();
    expect(savedFixtureIds).toEqual([1]);

    const [updateCriteria] = repo.update.mock.calls[0];
    expect(updateCriteria).toEqual({ id: 55 });
  });

  it('Test A (CR-01 regression): a re-discovered live game is never touched on status/score/cursor', async () => {
    const existing = {
      id: 77,
      fixtureId: 2,
      status: GameStatus.LIVE,
      scoreP1: 2,
      scoreP2: 1,
      streamCursor: '4711',
      currentStatusId: 2,
    } as GameEntity;
    const repo = buildRepoMock(new Map([[2, existing]]));
    const fixturesClient = {
      fetchUpcoming: jest.fn().mockResolvedValue([]),
      fetchPast: jest.fn().mockResolvedValue([discovered({ FixtureId: 2, status: GameStatus.FINISHED })]),
    } as unknown as TxlineFixturesClient;

    const service = new FixturesCronService(fixturesClient, repo as any, buildConfig());
    await service.discoverFixtures();

    expect(repo.update).toHaveBeenCalledTimes(1);
    const [updateCriteria, updatePayload] = repo.update.mock.calls[0];
    expect(updateCriteria).toEqual({ id: 77 });

    expect(Object.keys(updatePayload).sort()).toEqual(
      [
        'competition',
        'fixtureGroupId',
        'participant1Id',
        'participant1IsHome',
        'participant2Id',
        'startsAt',
        'team1Name',
        'team2Name',
      ].sort(),
    );

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('Test B: the INSERT path is unchanged — a first-seen fixture still goes through create + save and carries status', async () => {
    const repo = buildRepoMock(new Map());
    const fixturesClient = {
      fetchUpcoming: jest.fn().mockResolvedValue([discovered({ FixtureId: 3, status: GameStatus.SCHEDULED })]),
      fetchPast: jest.fn().mockResolvedValue([]),
    } as unknown as TxlineFixturesClient;

    const service = new FixturesCronService(fixturesClient, repo as any, buildConfig());
    await service.discoverFixtures();

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.update).not.toHaveBeenCalled();

    const [createPayload] = repo.create.mock.calls[0];
    expect(createPayload.status).toBe(GameStatus.SCHEDULED);
  });

  it('Test 2: applies no competition filter — every discovered fixture is upserted regardless of competition', async () => {
    const repo = buildRepoMock(new Map());
    const fixturesClient = {
      fetchUpcoming: jest
        .fn()
        .mockResolvedValue([
          discovered({ FixtureId: 1, CompetitionId: 501 }),
          discovered({ FixtureId: 2, CompetitionId: 999 }),
        ]),
      fetchPast: jest.fn().mockResolvedValue([]),
    } as unknown as TxlineFixturesClient;

    const service = new FixturesCronService(fixturesClient, repo as any, buildConfig());
    await service.discoverFixtures();

    expect(repo.save).toHaveBeenCalledTimes(2);
  });

  it('Test 3: an empty fixtures response completes the cron with zero rows created and no crash', async () => {
    const repo = buildRepoMock(new Map());
    const fixturesClient = {
      fetchUpcoming: jest.fn().mockResolvedValue([]),
      fetchPast: jest.fn().mockResolvedValue([]),
    } as unknown as TxlineFixturesClient;

    const service = new FixturesCronService(fixturesClient, repo as any, buildConfig());

    await expect(service.discoverFixtures()).resolves.not.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('Test 4: calls fetchPast with the configured PAST_FIXTURES_COUNT', async () => {
    const repo = buildRepoMock(new Map());
    const fixturesClient = {
      fetchUpcoming: jest.fn().mockResolvedValue([]),
      fetchPast: jest.fn().mockResolvedValue([]),
    } as unknown as TxlineFixturesClient;

    const service = new FixturesCronService(fixturesClient, repo as any, buildConfig(35));
    await service.discoverFixtures();

    expect(fixturesClient.fetchPast).toHaveBeenCalledWith(35);
    expect(fixturesClient.fetchUpcoming).toHaveBeenCalledWith(7);
  });
});
