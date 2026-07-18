import { ReplayStarterService } from './replay-starter.service';
import { GameStateRegistry } from '../state/game-state.registry';
import { GameStateMachine } from '../state/game-state.machine';
import { ReplaySourceService } from './replay-source.service';
import { EventIngestService } from '../persistence/event-ingest.service';
import { GameEntity } from '../../../models/game/game.entity';
import * as replayModule from './replay';

function replayGame(overrides: Partial<GameEntity> = {}): GameEntity {
  return {
    id: 7,
    fixtureId: 555,
    isReplay: true,
    ...overrides,
  } as GameEntity;
}

describe('ReplayStarterService.start', () => {
  function build() {
    const gameRepo = { findOne: jest.fn(), update: jest.fn() };
    const gameEventRepo = { delete: jest.fn() };
    const stateRegistry = new GameStateRegistry();
    const removeStateSpy = jest.spyOn(stateRegistry, 'remove');
    const stateMachine = new GameStateMachine();
    const removeMachineSpy = jest.spyOn(stateMachine, 'remove');
    const replaySource = { load: jest.fn() };
    const eventIngest = { processEvent: jest.fn() };

    const service = new ReplayStarterService(
      gameRepo as any,

      gameEventRepo as any,
      stateRegistry,
      stateMachine,

      replaySource as any,

      eventIngest as any,
    );

    return {
      service,
      gameRepo,
      gameEventRepo,
      stateRegistry,
      removeStateSpy,
      stateMachine,
      removeMachineSpy,
      replaySource,
      eventIngest,
    };
  }

  it('wipes prior game_event rows + resets denormalized state BEFORE emitting, for an is_replay=true game (D-07)', async () => {
    const { service, gameRepo, gameEventRepo, replaySource, eventIngest } =
      build();
    gameRepo.findOne.mockResolvedValue(replayGame());
    const events = [
      { Action: 'jersey', Ts: 1, Seq: 1 },
      { Action: 'status', Ts: 2, Seq: 2 },
    ];
    replaySource.load.mockResolvedValue(events);

    await service.start(7, 1);

    expect(gameEventRepo.delete).toHaveBeenCalledWith({ gameId: 7 });
    expect(gameRepo.update).toHaveBeenCalledWith(
      { id: 7 },
      {
        scoreP1: 0,
        scoreP2: 0,
        currentStatusId: null,
        streamCursor: null,
        streamCursorAt: null,
      },
    );

    // Wipe must happen before the source is even loaded / emitted.
    const deleteOrder = gameEventRepo.delete.mock.invocationCallOrder[0];
    const loadOrder = replaySource.load.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(loadOrder);
  });

  it('resets BOTH GameStateRegistry and GameStateMachine in-memory state before emitting (take #2 correctness)', async () => {
    const {
      service,
      gameRepo,
      replaySource,
      removeStateSpy,
      removeMachineSpy,
    } = build();
    gameRepo.findOne.mockResolvedValue(replayGame());
    replaySource.load.mockResolvedValue([{ Action: 'jersey', Ts: 1, Seq: 1 }]);

    await service.start(7, 1);

    expect(removeStateSpy).toHaveBeenCalledWith(7);
    expect(removeMachineSpy).toHaveBeenCalledWith(7);
  });

  it('drives every rebased event into EventIngestService.processEvent with NO mode flag (RPLY-02)', async () => {
    const { service, gameRepo, replaySource, eventIngest } = build();
    gameRepo.findOne.mockResolvedValue(replayGame());
    const events = [
      { Action: 'jersey', Ts: 1, Seq: 1 },
      { Action: 'status', Ts: 2, Seq: 2 },
    ];
    replaySource.load.mockResolvedValue(events);

    await service.start(7, 1);

    expect(eventIngest.processEvent).toHaveBeenCalledTimes(2);
    // Same 2-arg call shape as the live SSE path — (gameId, raw), nothing else.
    for (const call of eventIngest.processEvent.mock.calls) {
      expect(call).toHaveLength(2);
      expect(call[0]).toBe(7);
      expect(typeof call[1]).toBe('object');
    }
  });

  it('refuses to wipe or emit for an is_replay=false game (D-07 hard guard)', async () => {
    const { service, gameRepo, gameEventRepo, replaySource, eventIngest } =
      build();
    gameRepo.findOne.mockResolvedValue(replayGame({ isReplay: false }));

    await expect(service.start(7, 1)).rejects.toThrow(/is_replay=false/);

    expect(gameEventRepo.delete).not.toHaveBeenCalled();
    expect(gameRepo.update).not.toHaveBeenCalled();
    expect(replaySource.load).not.toHaveBeenCalled();
    expect(eventIngest.processEvent).not.toHaveBeenCalled();
  });

  it('throws when the game does not exist, without any side effect', async () => {
    const { service, gameRepo, gameEventRepo, eventIngest } = build();
    gameRepo.findOne.mockResolvedValue(null);

    await expect(service.start(999, 1)).rejects.toThrow(/not found/);

    expect(gameEventRepo.delete).not.toHaveBeenCalled();
    expect(eventIngest.processEvent).not.toHaveBeenCalled();
  });

  it('does not call processEvent when the resolved source has zero events', async () => {
    const { service, gameRepo, replaySource, eventIngest } = build();
    gameRepo.findOne.mockResolvedValue(replayGame());
    replaySource.load.mockResolvedValue([]);

    await service.start(7, 1);

    expect(eventIngest.processEvent).not.toHaveBeenCalled();
  });

  describe('pacing clamp (D-04 amendment, quick task 260718-3cm)', () => {
    afterEach(() => {
      delete process.env.REPLAY_MAX_GAP_MS;
      jest.restoreAllMocks();
    });

    it('Test A: passes a finite maxGapMs to emitReplay, defaulting to 5000', async () => {
      const { service, gameRepo, replaySource, eventIngest } = build();
      gameRepo.findOne.mockResolvedValue(replayGame());
      replaySource.load.mockResolvedValue([
        { Action: 'jersey', Ts: 1, Seq: 1 },
      ]);
      eventIngest.processEvent.mockResolvedValue(undefined);

      const emitReplaySpy = jest
        .spyOn(replayModule, 'emitReplay')
        .mockResolvedValue(undefined);

      await service.start(7, 1);

      expect(emitReplaySpy).toHaveBeenCalledTimes(1);
      const opts = emitReplaySpy.mock.calls[0][0];
      expect(Number.isFinite(opts.maxGapMs)).toBe(true);
      expect(opts.maxGapMs).toBe(5000);
    });

    it('Test B: a 4.98-day inter-event gap is clamped — no single sleep exceeds 5000ms', async () => {
      const { service, gameRepo, replaySource, eventIngest } = build();
      gameRepo.findOne.mockResolvedValue(replayGame());

      // Measured real-fixture pre-match dead zone: 430,164,128 ms gap
      // between events #2 and #3.
      const events = [
        { Action: 'coverage_update', Ts: 1000, Seq: 1 },
        { Action: 'comment', Ts: 2000, Seq: 2 },
        { Action: 'connected', Ts: 430166128, Seq: 3 },
      ];
      replaySource.load.mockResolvedValue(events);
      eventIngest.processEvent.mockResolvedValue(undefined);

      const recordedSleeps: number[] = [];
      const realEmitReplay = replayModule.emitReplay;
      jest.spyOn(replayModule, 'emitReplay').mockImplementation((opts) =>
        realEmitReplay({
          ...opts,
          sleepImpl: (ms: number) => {
            recordedSleeps.push(ms);
            return Promise.resolve();
          },
        }),
      );

      await service.start(7, 1);

      expect(recordedSleeps.length).toBeGreaterThan(0);
      expect(Math.max(...recordedSleeps)).toBeLessThanOrEqual(5000);
    });

    it('Test C: REPLAY_MAX_GAP_MS overrides the default; an invalid value falls back to 5000', async () => {
      const { service, gameRepo, replaySource, eventIngest } = build();
      gameRepo.findOne.mockResolvedValue(replayGame());
      replaySource.load.mockResolvedValue([
        { Action: 'jersey', Ts: 1, Seq: 1 },
      ]);
      eventIngest.processEvent.mockResolvedValue(undefined);

      let emitReplaySpy = jest
        .spyOn(replayModule, 'emitReplay')
        .mockResolvedValue(undefined);

      process.env.REPLAY_MAX_GAP_MS = '250';
      await service.start(7, 1);
      expect(emitReplaySpy.mock.calls[0][0].maxGapMs).toBe(250);

      jest.restoreAllMocks();
      emitReplaySpy = jest
        .spyOn(replayModule, 'emitReplay')
        .mockResolvedValue(undefined);

      process.env.REPLAY_MAX_GAP_MS = 'not-a-number';
      await service.start(7, 1);
      expect(emitReplaySpy.mock.calls[0][0].maxGapMs).toBe(5000);

      jest.restoreAllMocks();
      emitReplaySpy = jest
        .spyOn(replayModule, 'emitReplay')
        .mockResolvedValue(undefined);

      process.env.REPLAY_MAX_GAP_MS = '-10';
      await service.start(7, 1);
      expect(emitReplaySpy.mock.calls[0][0].maxGapMs).toBe(5000);
    });
  });
});
