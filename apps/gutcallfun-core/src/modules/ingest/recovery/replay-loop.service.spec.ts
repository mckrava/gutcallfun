import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { UserGameEntity } from '../../../models/game/user-game.entity';
import { ReplayLoopEntity } from '../../../models/game/replay-loop.entity';
import { GameStatus } from '../../../models/game/enums';
import { ReplayLoopService } from './replay-loop.service';

// ---------------------------------------------------------------------
// Builder helpers (mirrors source-scheduler.service.spec.ts conventions:
// plain `new ReplayLoopService(...)` construction with hand-rolled
// jest.fn() repository mocks cast through `as unknown as Repository<T>` —
// no Test.createTestingModule).
// ---------------------------------------------------------------------

function loopRow(overrides: Partial<ReplayLoopEntity> = {}): ReplayLoopEntity {
  return {
    id: 1,
    enabled: true,
    fixtureId: 12345,
    templateGameId: null,
    restartDelaySeconds: 60,
    stallTimeoutSeconds: 300,
    maxIterations: null,
    iterationsRun: 0,
    currentGameId: null,
    lastRestartAt: null,
    lastError: null,
    updatedAt: null,
    ...overrides,
  };
}

function game(overrides: Partial<GameEntity> = {}): GameEntity {
  const now = new Date();
  return {
    id: 1,
    fixtureId: 12345,
    status: GameStatus.SCHEDULED,
    startsAt: now,
    participant1Id: 10,
    participant2Id: 20,
    participant1IsHome: true,
    team1Name: 'Team A',
    team2Name: 'Team B',
    competition: 'World Cup 2026',
    fixtureGroupId: null,
    team1JerseyColor: '#ff0000',
    team2JerseyColor: '#0000ff',
    currentStatusId: null,
    scoreP1: 0,
    scoreP2: 0,
    isReplay: true,
    streamCursor: null,
    streamCursorAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Chainable UPDATE query-builder mock (watchdog force-finish path),
 * modelled on source-scheduler.service.spec.ts's buildClaimQueryBuilderMock,
 * recording every call so a spec can assert `set(...)`/`where(...)`/
 * `andWhere(...)` and control `affected` to simulate a concurrent
 * `game_finalised` winning the race.
 */
function buildUpdateQueryBuilderMock(affected: number) {
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

/**
 * Chainable INSERT query-builder mock (user_game carry-forward path),
 * extended per Task 3's instructions to also record `.insert()`,
 * `.into()`, `.values()`, and `.orIgnore()` so the carry-forward INSERT can
 * be asserted.
 */
function buildInsertQueryBuilderMock() {
  const calls: string[] = [];
  const qb: Record<string, jest.Mock> = {};
  const chain = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls.push(name + (args.length ? `(${JSON.stringify(args)})` : '()'));
      return qb;
    });
  qb.insert = chain('insert');
  qb.into = chain('into');
  qb.values = chain('values');
  qb.orIgnore = chain('orIgnore');
  qb.execute = jest.fn(async () => {
    calls.push('execute()');
    return {};
  });
  return { qb, calls };
}

function buildLoopRepoMock(rows: ReplayLoopEntity[]) {
  return {
    find: jest.fn(async () => rows),
    update: jest.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<ReplayLoopEntity>;
}

function buildGameRepoMock(
  opts: {
    byId?: Map<number, GameEntity | null>;
    watchdogBuilders?: ReturnType<typeof buildUpdateQueryBuilderMock>['qb'][];
  } = {},
) {
  const byId = opts.byId ?? new Map<number, GameEntity | null>();
  const builderQueue = [...(opts.watchdogBuilders ?? [])];
  let nextId = 5000;

  const findOne = jest.fn(async ({ where }: { where: { id: number } }) =>
    byId.has(where.id) ? (byId.get(where.id) ?? null) : null,
  );
  const createQueryBuilder = jest.fn(() => builderQueue.shift());
  const create = jest.fn(
    (obj: Partial<GameEntity>) => ({ ...obj }) as GameEntity,
  );
  const save = jest.fn(async (entity: GameEntity) => {
    entity.id = entity.id ?? nextId++;
    return entity;
  });
  const find = jest.fn(async () => []);

  return {
    findOne,
    createQueryBuilder,
    create,
    save,
    find,
  } as unknown as Repository<GameEntity>;
}

function buildGameEventRepoMock(latest: GameEventEntity | null) {
  return {
    findOne: jest.fn(async () => latest),
  } as unknown as Repository<GameEventEntity>;
}

function buildUserGameRepoMock(
  opts: {
    prevParticipants?: UserGameEntity[];
    insertBuilders?: ReturnType<typeof buildInsertQueryBuilderMock>['qb'][];
  } = {},
) {
  const insertQueue = [...(opts.insertBuilders ?? [])];
  return {
    find: jest.fn(async () => opts.prevParticipants ?? []),
    createQueryBuilder: jest.fn(() => insertQueue.shift()),
  } as unknown as Repository<UserGameEntity>;
}

describe('ReplayLoopService (RPLY-LOOP-01/02/03 — DB-driven infinite replay loop)', () => {
  it('1. no enabled rows: queries loopRepo.find({enabled:true}) once and touches no other repository (off-state hot path)', async () => {
    const loopRepo = buildLoopRepoMock([]);
    const gameRepo = buildGameRepoMock();
    const gameEventRepo = buildGameEventRepoMock(null);
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(loopRepo.find).toHaveBeenCalledTimes(1);
    expect(loopRepo.find).toHaveBeenCalledWith({ where: { enabled: true } });
    expect(gameRepo.find).not.toHaveBeenCalled();
    expect(gameRepo.findOne).not.toHaveBeenCalled();
    expect(gameRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(gameEventRepo.findOne).not.toHaveBeenCalled();
  });

  it('2. delay not elapsed: current game FINISHED, lastRestartAt set to (restartDelaySeconds - 10s) ago -> no clone', async () => {
    const currentGame = game({ id: 100, status: GameStatus.FINISHED });
    const row = loopRow({
      currentGameId: 100,
      restartDelaySeconds: 60,
      lastRestartAt: new Date(Date.now() - 50 * 1000), // 50s ago, delay is 60s
    });
    const loopRepo = buildLoopRepoMock([row]);
    const gameRepo = buildGameRepoMock({ byId: new Map([[100, currentGame]]) });
    const gameEventRepo = buildGameEventRepoMock(null);
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(gameRepo.save).not.toHaveBeenCalled();
  });

  it('3. delay elapsed -> clones (same fixture, lastRestartAt well past the delay)', async () => {
    const currentGame = game({
      id: 100,
      status: GameStatus.FINISHED,
      fixtureId: 555,
    });
    const row = loopRow({
      fixtureId: 555,
      currentGameId: 100,
      restartDelaySeconds: 60,
      lastRestartAt: new Date(Date.now() - 120 * 1000), // 120s ago, delay is 60s
    });
    const loopRepo = buildLoopRepoMock([row]);
    const gameRepo = buildGameRepoMock({ byId: new Map([[100, currentGame]]) });
    const gameEventRepo = buildGameEventRepoMock(null);
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(gameRepo.save).toHaveBeenCalledTimes(1);
    const saved = (gameRepo.save as jest.Mock).mock.calls[0][0] as GameEntity;
    expect(saved.fixtureId).toBe(555);
  });

  describe('4. iteration cap', () => {
    it('cap reached (maxIterations=3, iterationsRun=3) -> no clone', async () => {
      const currentGame = game({ id: 100, status: GameStatus.FINISHED });
      const row = loopRow({
        currentGameId: 100,
        maxIterations: 3,
        iterationsRun: 3,
        lastRestartAt: new Date(Date.now() - 120 * 1000),
      });
      const loopRepo = buildLoopRepoMock([row]);
      const gameRepo = buildGameRepoMock({
        byId: new Map([[100, currentGame]]),
      });
      const gameEventRepo = buildGameEventRepoMock(null);
      const userGameRepo = buildUserGameRepoMock();
      const service = new ReplayLoopService(
        loopRepo,
        gameRepo,
        gameEventRepo,
        userGameRepo,
      );

      await service.tick();

      expect(gameRepo.save).not.toHaveBeenCalled();
    });

    it('under cap (maxIterations=3, iterationsRun=2) -> clones', async () => {
      const currentGame = game({ id: 100, status: GameStatus.FINISHED });
      const row = loopRow({
        currentGameId: 100,
        maxIterations: 3,
        iterationsRun: 2,
        lastRestartAt: new Date(Date.now() - 120 * 1000),
      });
      const loopRepo = buildLoopRepoMock([row]);
      const gameRepo = buildGameRepoMock({
        byId: new Map([[100, currentGame]]),
      });
      const gameEventRepo = buildGameEventRepoMock(null);
      const userGameRepo = buildUserGameRepoMock();
      const service = new ReplayLoopService(
        loopRepo,
        gameRepo,
        gameEventRepo,
        userGameRepo,
      );

      await service.tick();

      expect(gameRepo.save).toHaveBeenCalledTimes(1);
    });

    it('unlimited (maxIterations=null) -> clones', async () => {
      const currentGame = game({ id: 100, status: GameStatus.FINISHED });
      const row = loopRow({
        currentGameId: 100,
        maxIterations: null,
        iterationsRun: 500,
        lastRestartAt: new Date(Date.now() - 120 * 1000),
      });
      const loopRepo = buildLoopRepoMock([row]);
      const gameRepo = buildGameRepoMock({
        byId: new Map([[100, currentGame]]),
      });
      const gameEventRepo = buildGameEventRepoMock(null);
      const userGameRepo = buildUserGameRepoMock();
      const service = new ReplayLoopService(
        loopRepo,
        gameRepo,
        gameEventRepo,
        userGameRepo,
      );

      await service.tick();

      expect(gameRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  it('5. previous game finished -> clones a new game AND copies user_game rows', async () => {
    const currentGame = game({ id: 100, status: GameStatus.FINISHED });
    const template = game({
      id: 900,
      team1Name: 'Template A',
      team2Name: 'Template B',
      competition: 'Template Cup',
    });
    const row = loopRow({
      fixtureId: 555,
      templateGameId: 900,
      currentGameId: 100,
      iterationsRun: 2,
      lastRestartAt: new Date(Date.now() - 120 * 1000),
    });
    const loopRepo = buildLoopRepoMock([row]);
    const gameRepo = buildGameRepoMock({
      byId: new Map([
        [100, currentGame],
        [900, template],
      ]),
    });
    const gameEventRepo = buildGameEventRepoMock(null);
    const prevParticipants = [
      { gameId: 100, userId: 'user-1', squadId: 7 } as UserGameEntity,
      { gameId: 100, userId: 'user-2', squadId: null } as UserGameEntity,
    ];
    const insertBuilder = buildInsertQueryBuilderMock();
    const userGameRepo = buildUserGameRepoMock({
      prevParticipants,
      insertBuilders: [insertBuilder.qb],
    });
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(gameRepo.save).toHaveBeenCalledTimes(1);
    const saved = (gameRepo.save as jest.Mock).mock.calls[0][0] as GameEntity;
    expect(saved.isReplay).toBe(true);
    expect(saved.status).toBe(GameStatus.SCHEDULED);
    expect(saved.fixtureId).toBe(555); // LOOP row's fixtureId, not the template's
    expect(saved.scoreP1).toBe(0);
    expect(saved.scoreP2).toBe(0);
    expect(saved.currentStatusId).toBeNull();
    expect(saved.streamCursor).toBeNull();
    expect(saved.team1Name).toBe('Template A');
    expect(saved.team2Name).toBe('Template B');
    expect(saved.competition).toBe('Template Cup');

    const newGameId = saved.id;
    expect(insertBuilder.qb.orIgnore).toHaveBeenCalledTimes(1);
    expect(insertBuilder.qb.values).toHaveBeenCalledWith([
      { gameId: newGameId, userId: 'user-1', squadId: 7 },
      { gameId: newGameId, userId: 'user-2', squadId: null },
    ]);

    expect(loopRepo.update).toHaveBeenCalledWith(
      { id: row.id },
      expect.objectContaining({ currentGameId: newGameId, iterationsRun: 3 }),
    );
  });

  it('6. first iteration (currentGameId=null) -> clones, and does NOT attempt a user_game insert', async () => {
    const row = loopRow({ currentGameId: null, fixtureId: 777 });
    const loopRepo = buildLoopRepoMock([row]);
    const gameRepo = buildGameRepoMock();
    const gameEventRepo = buildGameEventRepoMock(null);
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(gameRepo.save).toHaveBeenCalledTimes(1);
    const saved = (gameRepo.save as jest.Mock).mock.calls[0][0] as GameEntity;
    expect(saved.fixtureId).toBe(777);
    expect(userGameRepo.find).not.toHaveBeenCalled();
    expect(userGameRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('7. current game LIVE with a fresh event -> no-op: no forced finish, no clone', async () => {
    const currentGame = game({ id: 100, status: GameStatus.LIVE });
    const row = loopRow({ currentGameId: 100, stallTimeoutSeconds: 300 });
    const loopRepo = buildLoopRepoMock([row]);
    const freshEvent = {
      gameId: 100,
      receivedAt: new Date(),
    } as GameEventEntity;
    const gameRepo = buildGameRepoMock({ byId: new Map([[100, currentGame]]) });
    const gameEventRepo = buildGameEventRepoMock(freshEvent);
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(gameRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(gameRepo.save).not.toHaveBeenCalled();
  });

  it('8. current game LIVE with a stale newest event -> forced to finished, no clone in the same tick', async () => {
    const staleEvent = {
      gameId: 100,
      receivedAt: new Date(Date.now() - 400 * 1000), // 400s ago, timeout is 300s
    } as GameEventEntity;
    const currentGame = game({ id: 100, status: GameStatus.LIVE });
    const row = loopRow({ currentGameId: 100, stallTimeoutSeconds: 300 });
    const loopRepo = buildLoopRepoMock([row]);
    const watchdogBuilder = buildUpdateQueryBuilderMock(1);
    const gameRepo = buildGameRepoMock({
      byId: new Map([[100, currentGame]]),
      watchdogBuilders: [watchdogBuilder.qb],
    });
    const gameEventRepo = buildGameEventRepoMock(staleEvent);
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(gameRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(watchdogBuilder.qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: GameStatus.FINISHED }),
    );
    expect(watchdogBuilder.qb.andWhere).toHaveBeenCalledWith('status = :live', {
      live: GameStatus.LIVE,
    });
    expect(gameRepo.save).not.toHaveBeenCalled();
  });

  it('9. current game LIVE with zero events and a stale updatedAt/startsAt fallback -> also forced to finished', async () => {
    const currentGame = game({
      id: 100,
      status: GameStatus.LIVE,
      updatedAt: new Date(Date.now() - 400 * 1000),
      startsAt: new Date(Date.now() - 500 * 1000),
      createdAt: new Date(Date.now() - 600 * 1000),
    });
    const row = loopRow({ currentGameId: 100, stallTimeoutSeconds: 300 });
    const loopRepo = buildLoopRepoMock([row]);
    const watchdogBuilder = buildUpdateQueryBuilderMock(1);
    const gameRepo = buildGameRepoMock({
      byId: new Map([[100, currentGame]]),
      watchdogBuilders: [watchdogBuilder.qb],
    });
    const gameEventRepo = buildGameEventRepoMock(null); // zero events
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(gameRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(watchdogBuilder.qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: GameStatus.FINISHED }),
    );
    expect(gameRepo.save).not.toHaveBeenCalled();
  });

  it('10. a thrown error inside row processing is captured and never escapes the cron handler', async () => {
    const row = loopRow({ currentGameId: 100 });
    const loopRepo = buildLoopRepoMock([row]);
    const gameRepo = buildGameRepoMock();
    (gameRepo.findOne as jest.Mock).mockRejectedValueOnce(
      new Error('db connection lost'),
    );
    const gameEventRepo = buildGameEventRepoMock(null);
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await expect(service.tick()).resolves.not.toThrow();

    expect(loopRepo.update).toHaveBeenCalledWith(
      { id: row.id },
      expect.objectContaining({
        lastError: expect.stringContaining('db connection lost'),
      }),
    );
  });

  it('11. a successful tick on a row whose lastError was previously set clears it back to null', async () => {
    const row = loopRow({
      currentGameId: null,
      fixtureId: 999,
      lastError: 'previous failure',
    });
    const loopRepo = buildLoopRepoMock([row]);
    const gameRepo = buildGameRepoMock();
    const gameEventRepo = buildGameEventRepoMock(null);
    const userGameRepo = buildUserGameRepoMock();
    const service = new ReplayLoopService(
      loopRepo,
      gameRepo,
      gameEventRepo,
      userGameRepo,
    );

    await service.tick();

    expect(loopRepo.update).toHaveBeenCalledWith(
      { id: row.id },
      expect.objectContaining({ lastError: null }),
    );
  });
});
