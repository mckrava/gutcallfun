import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { GameStatus } from '../../../models/game/enums';
import { GameStateRegistry } from '../state/game-state.registry';
import { GameStateMachine } from '../state/game-state.machine';
import { StreamManagerService } from '../stream/stream-manager.service';
import { GameStateRebuildService } from './game-state-rebuild.service';

function liveGame(overrides: Partial<GameEntity>): GameEntity {
  return {
    id: 1,
    fixtureId: 555,
    status: GameStatus.LIVE,
    isReplay: false,
    streamCursor: null,
    ...overrides,
  } as GameEntity;
}

function eventRow(overrides: Partial<GameEventEntity>): GameEventEntity {
  return {
    id: 'row-id',
    gameId: 1,
    type: 'shot',
    payload: { Action: 'shot', Seq: 1, Ts: 1_000, ConnectionId: 42 },
    actionId: null,
    seq: 1,
    confirmed: null,
    participant: null,
    statusId: null,
    feedTs: new Date(1_000),
    receivedAt: new Date(),
    ...overrides,
  } as GameEventEntity;
}

/** Records every mutating repository method call for the never-write assertion (T-02-07-01). */
function buildGameEventRepoMock(rows: GameEventEntity[]) {
  const mutatingCalls: string[] = [];
  const trackMutation = (name: string) =>
    jest.fn((...args: unknown[]) => {
      mutatingCalls.push(name);
      throw new Error(`GameStateRebuildService must never call ${name} on the game_event repository`);
    });
  return {
    repo: {
      find: jest.fn(async () => rows),
      save: trackMutation('save'),
      insert: trackMutation('insert'),
      update: trackMutation('update'),
      delete: trackMutation('delete'),
      createQueryBuilder: trackMutation('createQueryBuilder'),
    } as unknown as Repository<GameEventEntity>,
    mutatingCalls,
  };
}

function buildGameRepoMock(liveGames: GameEntity[]): Repository<GameEntity> {
  return { find: jest.fn(async () => liveGames) } as unknown as Repository<GameEntity>;
}

function buildStreamManagerMock(): StreamManagerService {
  return { start: jest.fn() } as unknown as StreamManagerService;
}

describe('GameStateRebuildService (RCVR-01 boot rebuild, RCVR-02 stream resume)', () => {
  function build(gameRepo: Repository<GameEntity>, gameEventRepo: Repository<GameEventEntity>) {
    const stateRegistry = new GameStateRegistry();
    const stateMachine = new GameStateMachine();
    const streamManager = buildStreamManagerMock();
    const service = new GameStateRebuildService(
      gameRepo,
      gameEventRepo,
      stateRegistry,
      stateMachine,
      streamManager,
    );
    return { service, stateRegistry, stateMachine, streamManager };
  }

  it('rebuilds GameStateRegistry state from persisted game_event rows via applyEvent, with NO insert/update/delete on the event repository (T-02-07-01)', async () => {
    const rows = [
      eventRow({
        seq: 1,
        payload: {
          Action: 'goal',
          Id: 900,
          Seq: 1,
          Ts: 1_000,
          ConnectionId: 42,
          Confirmed: true,
          Participant: 1,
        },
      }),
      eventRow({ seq: 2, payload: { Action: 'status', Seq: 2, Ts: 2_000, ConnectionId: 42, StatusId: 3 } }),
    ];
    const { repo: gameEventRepo, mutatingCalls } = buildGameEventRepoMock(rows);
    const gameRepo = buildGameRepoMock([liveGame({ id: 1 })]);
    const { service, stateRegistry } = build(gameRepo, gameEventRepo);

    await service.onApplicationBootstrap();

    expect(mutatingCalls).toHaveLength(0);
    expect(gameEventRepo.find).toHaveBeenCalledWith({ where: { gameId: 1 }, order: { seq: 'ASC' } });

    const state = stateRegistry.get(1);
    expect(state).toBeDefined();
    expect(state!.score1).toBe(1);
    expect(state!.score2).toBe(0);
    expect(state!.currentStatusId).toBe(3);
    expect(state!.lastSeq).toBe(2);
    expect(state!.connectionId).toBe('42');
  });

  it('reconnects via StreamManagerService.start for each live game, and a null stream_cursor still reconnects (delegates to the already-proven Plan 05 null-cursor -> no Last-Event-ID behavior)', async () => {
    const { repo: gameEventRepo } = buildGameEventRepoMock([]);
    const gameRepo = buildGameRepoMock([liveGame({ id: 9, streamCursor: null })]);
    const { service, streamManager } = build(gameRepo, gameEventRepo);

    await service.onApplicationBootstrap();

    expect(streamManager.start).toHaveBeenCalledTimes(1);
    expect(streamManager.start).toHaveBeenCalledWith(9);
  });

  it('does NOT call StreamManagerService.start for an is_replay=true live game — recovery must never start the wrong source (D-02)', async () => {
    const { repo: gameEventRepo } = buildGameEventRepoMock([]);
    const gameRepo = buildGameRepoMock([liveGame({ id: 10, isReplay: true })]);
    const { service, streamManager } = build(gameRepo, gameEventRepo);

    await service.onApplicationBootstrap();

    expect(streamManager.start).not.toHaveBeenCalled();
  });

  it('the gap seam is reachable: rebuilt state.lastSeq/connectionId correctly seed detectGap — a same-ConnectionId Seq > max(seq)+1 is a gap, a ConnectionId change is not', async () => {
    const rows = [
      eventRow({ seq: 5, payload: { Action: 'shot', Seq: 5, Ts: 1_000, ConnectionId: 42 } }),
      eventRow({ seq: 6, payload: { Action: 'shot', Seq: 6, Ts: 2_000, ConnectionId: 42 } }),
    ];
    const { repo: gameEventRepo } = buildGameEventRepoMock(rows);
    const gameRepo = buildGameRepoMock([liveGame({ id: 1 })]);
    const { service, stateRegistry, stateMachine } = build(gameRepo, gameEventRepo);

    await service.onApplicationBootstrap();

    const state = stateRegistry.get(1)!;
    expect(state.lastSeq).toBe(6);
    expect(state.connectionId).toBe('42');

    // A true gap: same ConnectionId, Seq skips ahead.
    const gapResult = stateMachine.detectGap(state, 9, '42');
    expect(gapResult.isGap).toBe(true);
    expect(gapResult.expectedSeq).toBe(7);

    // A ConnectionId change: Seq reset is expected, never a gap (Pitfall 7).
    const resetResult = stateMachine.detectGap(state, 1, '99');
    expect(resetResult.isGap).toBe(false);
  });

  it('a rebuild/reconnect failure for one live game does not prevent other live games from rebuilding (isolation)', async () => {
    const rows = [eventRow({ seq: 1, payload: { Action: 'shot', Seq: 1, Ts: 1_000, ConnectionId: 1 } })];
    const gameEventRepo = {
      find: jest
        .fn()
        .mockRejectedValueOnce(new Error('DB blip for game 1'))
        .mockResolvedValueOnce(rows),
    } as unknown as Repository<GameEventEntity>;
    const gameRepo = buildGameRepoMock([liveGame({ id: 1 }), liveGame({ id: 2 })]);
    const { service, stateRegistry, streamManager } = build(gameRepo, gameEventRepo);

    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();

    expect(stateRegistry.get(1)).toBeUndefined();
    expect(stateRegistry.get(2)).toBeDefined();
    expect(streamManager.start).toHaveBeenCalledTimes(1);
    expect(streamManager.start).toHaveBeenCalledWith(2);
  });

  it('a live game with zero persisted game_event rows still reconnects (nothing to rebuild, but the stream must still resume)', async () => {
    const { repo: gameEventRepo } = buildGameEventRepoMock([]);
    const gameRepo = buildGameRepoMock([liveGame({ id: 3 })]);
    const { service, stateRegistry, streamManager } = build(gameRepo, gameEventRepo);

    await service.onApplicationBootstrap();

    expect(stateRegistry.get(3)).toBeDefined();
    expect(stateRegistry.get(3)!.lastSeq).toBeNull();
    expect(streamManager.start).toHaveBeenCalledWith(3);
  });

  it('no status=live games -> no-op, no reconnects attempted', async () => {
    const { repo: gameEventRepo } = buildGameEventRepoMock([]);
    const gameRepo = buildGameRepoMock([]);
    const { service, streamManager } = build(gameRepo, gameEventRepo);

    await service.onApplicationBootstrap();

    expect(gameEventRepo.find).not.toHaveBeenCalled();
    expect(streamManager.start).not.toHaveBeenCalled();
  });
});
