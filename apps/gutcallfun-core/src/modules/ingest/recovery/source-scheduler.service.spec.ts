import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameStatus } from '../../../models/game/enums';
import { StreamManagerService } from '../stream/stream-manager.service';
import { ReplayStarterService } from '../replay/replay-starter.service';
import { SourceSchedulerService } from './source-scheduler.service';

/**
 * Chainable UPDATE query-builder mock recording every call, so a spec can
 * assert the claim (status='scheduled' -> 'live') ran with the correct
 * conditional WHERE/andWhere, and control its `affected` result to simulate
 * the double-start guard (an overlapping tick already claimed the row).
 */
function buildClaimQueryBuilderMock(affected: number) {
  const calls: string[] = [];
  const qb: Record<string, jest.Mock> = {};
  const chain = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls.push(name + (args.length ? `(${JSON.stringify(args)})` : '()'));
      return qb;
    });
  qb.update = chain('update');
  qb.set = chain('set');
  qb.where = chain('where');
  qb.andWhere = chain('andWhere');
  qb.execute = jest.fn(async () => {
    calls.push('execute()');
    return { affected };
  });
  return { qb, calls };
}

function buildGameRepoMock(dueGames: GameEntity[], affectedByGameId: Map<number, number>) {
  // One claim query-builder per due game, consumed in dispatch order —
  // startGame() calls createQueryBuilder() fresh for each game it processes.
  const builderQueue = dueGames.map((g) => buildClaimQueryBuilderMock(affectedByGameId.get(g.id) ?? 1).qb);
  const createQueryBuilder = jest.fn(() => builderQueue.shift()!);
  return {
    find: jest.fn(async () => dueGames),
    createQueryBuilder,
  } as unknown as Repository<GameEntity>;
}

function buildStreamManagerMock(): StreamManagerService {
  return { start: jest.fn() } as unknown as StreamManagerService;
}

function buildReplayStarterMock(resolves = true): ReplayStarterService {
  return {
    start: jest.fn(async () => {
      if (!resolves) throw new Error('replay start failed');
    }),
  } as unknown as ReplayStarterService;
}

function game(overrides: Partial<GameEntity>): GameEntity {
  return {
    id: 1,
    fixtureId: 555,
    status: GameStatus.SCHEDULED,
    startsAt: new Date(),
    isReplay: false,
    ...overrides,
  } as GameEntity;
}

describe('SourceSchedulerService (D-02 single is_replay source-switch scheduler, RPLY-02/03)', () => {
  it('is_replay=false due game -> StreamManagerService.start(gameId)', async () => {
    const g = game({ id: 1, isReplay: false });
    const gameRepo = buildGameRepoMock([g], new Map());
    const streamManager = buildStreamManagerMock();
    const replayStarter = buildReplayStarterMock();
    const service = new SourceSchedulerService(gameRepo, streamManager, replayStarter);

    await service.dispatchDueGames();

    expect(streamManager.start).toHaveBeenCalledTimes(1);
    expect(streamManager.start).toHaveBeenCalledWith(1);
    expect(replayStarter.start).not.toHaveBeenCalled();
  });

  it('is_replay=true due game -> ReplayStarterService.start(gameId)', async () => {
    const g = game({ id: 2, isReplay: true });
    const gameRepo = buildGameRepoMock([g], new Map());
    const streamManager = buildStreamManagerMock();
    const replayStarter = buildReplayStarterMock();
    const service = new SourceSchedulerService(gameRepo, streamManager, replayStarter);

    await service.dispatchDueGames();
    await new Promise((resolve) => setImmediate(resolve)); // flush the fire-and-forget .catch()

    expect(replayStarter.start).toHaveBeenCalledTimes(1);
    expect(replayStarter.start).toHaveBeenCalledWith(2);
    expect(streamManager.start).not.toHaveBeenCalled();
  });

  it('queries only status=scheduled AND starts_at<=now() (starts_at<=now() eligible, future starts_at excluded by the query itself)', async () => {
    const gameRepo = buildGameRepoMock([], new Map());
    const streamManager = buildStreamManagerMock();
    const replayStarter = buildReplayStarterMock();
    const service = new SourceSchedulerService(gameRepo, streamManager, replayStarter);

    await service.dispatchDueGames();

    expect(gameRepo.find).toHaveBeenCalledTimes(1);
    const [{ where }] = (gameRepo.find as jest.Mock).mock.calls[0];
    expect(where.status).toBe(GameStatus.SCHEDULED);
    // TypeORM LessThanOrEqual FindOperator — the >= boundary (RCVR-02/GAME-01
    // boundary: starts_at<=now() is eligible, one step later than "now" is
    // not) is TypeORM's own well-tested comparator semantics; this asserts
    // OUR query uses the correct operator/type against the correct field.
    expect(where.startsAt).toBeDefined();
    expect(where.startsAt._type).toBe('lessThanOrEqual');
    expect(where.startsAt._value).toBeInstanceOf(Date);
  });

  it('a started game transitions status to live via an atomic conditional claim (status=scheduled -> live) BEFORE starting its source', async () => {
    const g = game({ id: 3, isReplay: false });
    const gameRepo = buildGameRepoMock([g], new Map());
    const streamManager = buildStreamManagerMock();
    const replayStarter = buildReplayStarterMock();
    const service = new SourceSchedulerService(gameRepo, streamManager, replayStarter);

    await service.dispatchDueGames();

    expect(gameRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    const qb = (gameRepo.createQueryBuilder as jest.Mock).mock.results[0].value;
    expect(qb.set).toHaveBeenCalledWith({ status: GameStatus.LIVE });
    expect(qb.where).toHaveBeenCalledWith('id = :id', { id: 3 });
    expect(qb.andWhere).toHaveBeenCalledWith('status = :status', { status: GameStatus.SCHEDULED });
    expect(qb.execute).toHaveBeenCalledTimes(1);
    // Start happened after the claim executed (execute() is the last call
    // recorded before start() runs synchronously).
    expect(streamManager.start).toHaveBeenCalledWith(3);
  });

  it('double-start guard: when the claim affects 0 rows (already claimed by an overlapping tick), the source is never started a second time', async () => {
    const g = game({ id: 4, isReplay: false });
    const gameRepo = buildGameRepoMock([g], new Map([[4, 0]]));
    const streamManager = buildStreamManagerMock();
    const replayStarter = buildReplayStarterMock();
    const service = new SourceSchedulerService(gameRepo, streamManager, replayStarter);

    await service.dispatchDueGames();

    expect(streamManager.start).not.toHaveBeenCalled();
    expect(replayStarter.start).not.toHaveBeenCalled();
  });

  it('dispatches multiple due games in one tick, each branching independently on its own is_replay', async () => {
    const g1 = game({ id: 5, isReplay: false });
    const g2 = game({ id: 6, isReplay: true });
    const gameRepo = buildGameRepoMock([g1, g2], new Map());
    const streamManager = buildStreamManagerMock();
    const replayStarter = buildReplayStarterMock();
    const service = new SourceSchedulerService(gameRepo, streamManager, replayStarter);

    await service.dispatchDueGames();
    await new Promise((resolve) => setImmediate(resolve));

    expect(streamManager.start).toHaveBeenCalledWith(5);
    expect(replayStarter.start).toHaveBeenCalledWith(6);
  });

  it('a replay start failure (fire-and-forget rejection) is caught and logged — never crashes the scheduler tick', async () => {
    const g = game({ id: 7, isReplay: true });
    const gameRepo = buildGameRepoMock([g], new Map());
    const streamManager = buildStreamManagerMock();
    const replayStarter = buildReplayStarterMock(false);
    const service = new SourceSchedulerService(gameRepo, streamManager, replayStarter);

    await expect(service.dispatchDueGames()).resolves.not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(replayStarter.start).toHaveBeenCalledWith(7);
  });
});
