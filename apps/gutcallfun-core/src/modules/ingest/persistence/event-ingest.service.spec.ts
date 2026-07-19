import { EventIngestService } from './event-ingest.service';
import { MessageNormalizer } from './message-normalizer';
import { GameMutexRegistry } from '../state/game-mutex.registry';
import { GameStateRegistry } from '../state/game-state.registry';
import { GameStateMachine } from '../state/game-state.machine';
import { GameStreamGapEmitter } from '../events/game-stream-gap.emitter';
import { LiveFeedEmitter } from '../../live/events/live-feed.emitter';

/**
 * Chainable QueryBuilder mock recording every method call in `calls`, so a
 * spec can assert BOTH "insert used orIgnore" and "the insert + the update
 * ran against the SAME manager" (Pitfall 4) without a real Postgres
 * connection. Every chainable method returns `this`; execute() resolves.
 */
/** Stand-in for the uuid Postgres RETURNINGs on a real game_event insert. */
const MOCK_INSERTED_EVENT_ID = '00000000-0000-4000-8000-00000000e001';

function createQueryBuilderMock(calls: string[]) {
  const builder: Record<string, jest.Mock> = {};
  const chain = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls.push(name + (args.length ? `(${JSON.stringify(args)})` : '()'));
      return builder;
    });
  builder.insert = chain('insert');
  builder.into = chain('into');
  builder.values = chain('values');
  builder.orIgnore = chain('orIgnore');
  builder.update = chain('update');
  builder.set = chain('set');
  builder.where = chain('where');
  builder.execute = jest.fn(async () => {
    calls.push('execute()');
    // Must mirror TypeORM's real InsertResult shape, not a bare `{}`.
    // EventIngestService reads `insertResult.identifiers[0]?.id` to obtain the
    // freshly-inserted game_event id (used as game_question.trigger_event_id),
    // and TypeORM ALWAYS returns an `identifiers` array — so `{}` made
    // `.identifiers[0]` throw TypeError and every test in this file fail.
    // `identifiers` is also the correct shape for the UPDATE executed by the
    // same mock: an extra key on an update result is harmless, whereas a
    // missing one is not.
    return { identifiers: [{ id: MOCK_INSERTED_EVENT_ID }], generatedMaps: [], raw: [] };
  });
  return builder;
}

function createManagerMock(calls: string[]) {
  return {
    createQueryBuilder: jest.fn(() => createQueryBuilderMock(calls)),
  };
}

function createDataSourceMock() {
  const calls: string[] = [];
  const managers: unknown[] = [];
  const transaction = jest.fn(async (cb: (manager: unknown) => Promise<void>) => {
    const manager = createManagerMock(calls);
    managers.push(manager);
    await cb(manager);
  });
  return { transaction, calls, managers };
}

function stagedGoalMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Action: 'shot',
    FixtureId: 14790158,
    Id: 900,
    Seq: 100,
    Ts: 1_718_033_066_851,
    ConnectionId: 555,
    Confirmed: true,
    Participant: 1,
    StatusId: 2,
    ...overrides,
  };
}

describe('EventIngestService.processEvent', () => {
  function build() {
    const dataSource = createDataSourceMock();
    const normalizer = new MessageNormalizer();
    const mutexRegistry = new GameMutexRegistry();
    const runExclusiveSpy = jest.spyOn(mutexRegistry, 'runExclusive');
    const stateRegistry = new GameStateRegistry();
    const stateMachine = new GameStateMachine();
    const gapEmitter = new GameStreamGapEmitter();
    const emitSpy = jest.spyOn(gapEmitter, 'emit');
    const liveFeedEmitter = new LiveFeedEmitter();
    const liveEmitSpy = jest.spyOn(liveFeedEmitter, 'emit');

    const service = new EventIngestService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dataSource as any,
      normalizer,
      mutexRegistry,
      stateRegistry,
      stateMachine,
      gapEmitter,
      liveFeedEmitter,
    );

    return {
      service,
      dataSource,
      mutexRegistry,
      runExclusiveSpy,
      stateRegistry,
      gapEmitter,
      emitSpy,
      liveFeedEmitter,
      liveEmitSpy,
    };
  }

  it('runs the whole body inside GameMutexRegistry.runExclusive (STAT-02)', async () => {
    const { service, runExclusiveSpy } = build();

    await service.processEvent(1, stagedGoalMessage());

    expect(runExclusiveSpy).toHaveBeenCalledTimes(1);
    expect(runExclusiveSpy).toHaveBeenCalledWith(1, expect.any(Function));
  });

  it('inserts via .orIgnore() and updates stream_cursor inside the SAME transaction manager (INGST-03/04, Pitfall 4)', async () => {
    const { service, dataSource } = build();

    await service.processEvent(1, stagedGoalMessage());

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    // Exactly one manager was used for the whole transaction body.
    expect(dataSource.managers).toHaveLength(1);

    const calls = dataSource.calls;
    const insertIndex = calls.findIndex((c) => c === 'insert()');
    const orIgnoreIndex = calls.findIndex((c) => c === 'orIgnore()');
    const updateIndex = calls.findIndex((c) => c.startsWith('update('));
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(orIgnoreIndex).toBeGreaterThanOrEqual(0);
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    // insert happens before update, both against the one transaction manager.
    expect(insertIndex).toBeLessThan(updateIndex);
    // Both execute() calls happened (insert + update), never a bare
    // dataSource-level .execute() outside dataSource.transaction().
    expect(calls.filter((c) => c === 'execute()')).toHaveLength(2);
  });

  it('does not persist or mutate state for a malformed message (missing Seq/Ts)', async () => {
    const { service, dataSource, stateRegistry } = build();

    await service.processEvent(1, { Action: 'shot' });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(stateRegistry.get(1)).toBeUndefined();
  });

  it('emits GameStreamGapDetected for Seq > lastSeq+1 on the SAME ConnectionId (RCVR-02)', async () => {
    const { service, emitSpy } = build();

    await service.processEvent(1, stagedGoalMessage({ Seq: 100, ConnectionId: 555 }));
    await service.processEvent(1, stagedGoalMessage({ Seq: 103, ConnectionId: 555, Id: 901 }));

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith({
      gameId: 1,
      expectedSeq: 101,
      actualSeq: 103,
      at: expect.any(Date),
    });
  });

  it('does NOT emit GameStreamGapDetected for a Seq reset across a ConnectionId change (Pitfall 7)', async () => {
    const { service, emitSpy } = build();

    await service.processEvent(1, stagedGoalMessage({ Seq: 500, ConnectionId: 555 }));
    // New reporter connection: Seq resets low — this is expected, not a gap.
    await service.processEvent(1, stagedGoalMessage({ Seq: 1, ConnectionId: 777, Id: 901 }));

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('does NOT emit GameStreamGapDetected for consecutive Seq on the same ConnectionId', async () => {
    const { service, emitSpy } = build();

    await service.processEvent(1, stagedGoalMessage({ Seq: 10, ConnectionId: 555 }));
    await service.processEvent(1, stagedGoalMessage({ Seq: 11, ConnectionId: 555, Id: 901 }));

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('updates in-memory GameState only after a successful commit (score reflects a confirmed goal)', async () => {
    const { service, stateRegistry } = build();

    await service.processEvent(
      1,
      stagedGoalMessage({
        Action: 'goal',
        Confirmed: true,
        Participant: 1,
        Score: { Participant1: { Total: { Goals: 1 } }, Participant2: { Total: { Goals: 0 } } },
      }),
    );

    const state = stateRegistry.get(1);
    expect(state).toBeDefined();
    expect(state!.score1).toBe(1);
    expect(state!.score2).toBe(0);
  });
});
