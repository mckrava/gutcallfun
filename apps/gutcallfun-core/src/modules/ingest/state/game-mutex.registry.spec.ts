import { Mutex } from 'async-mutex';
import { GameMutexRegistry } from './game-mutex.registry';
import { GameStateRegistry } from './game-state.registry';
import { GameStreamGapEmitter } from '../events/game-stream-gap.emitter';
import { GameStreamGapDetected } from '../events/game-stream-gap.event';

describe('GameMutexRegistry (STAT-02)', () => {
  it('Test 1: forGame(1) called twice returns the same Mutex reference', () => {
    const registry = new GameMutexRegistry();

    const first = registry.forGame(1);
    const second = registry.forGame(1);

    expect(first).toBeInstanceOf(Mutex);
    expect(second).toBe(first);
  });

  it('Test 2: forGame(2) returns a different Mutex than forGame(1)', () => {
    const registry = new GameMutexRegistry();

    const forGame1 = registry.forGame(1);
    const forGame2 = registry.forGame(2);

    expect(forGame2).not.toBe(forGame1);
  });

  it('Test 3: runExclusive serializes calls for the same gameId', async () => {
    const registry = new GameMutexRegistry();
    const order: number[] = [];

    const a = registry.runExclusive(1, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(1);
    });
    const b = registry.runExclusive(1, async () => {
      order.push(2);
    });

    await Promise.all([a, b]);

    expect(order).toEqual([1, 2]);
  });

  it('Test 4: remove(gameId) evicts the mutex so a subsequent forGame creates a new one', () => {
    const registry = new GameMutexRegistry();

    const before = registry.forGame(1);
    registry.remove(1);
    const after = registry.forGame(1);

    expect(after).not.toBe(before);
  });
});

describe('GameStateRegistry (STAT-01 store)', () => {
  it('Test 5: getOrCreate returns a defined initial GameState for a fresh gameId', () => {
    const registry = new GameStateRegistry();

    const state = registry.getOrCreate(42);

    expect(state).toBeDefined();
    expect(state.gameId).toBe(42);
    expect(state.score1).toBe(0);
    expect(state.score2).toBe(0);
    expect(state.attackRunActive).toBe(false);
    expect(state.currentStatusId).toBeNull();
  });

  it('Test 6: getOrCreate is idempotent — returns the same object on repeated calls', () => {
    const registry = new GameStateRegistry();

    const first = registry.getOrCreate(7);
    const second = registry.getOrCreate(7);

    expect(second).toBe(first);
  });

  it('Test 7: remove(gameId) evicts the state so get(gameId) returns undefined', () => {
    const registry = new GameStateRegistry();

    registry.getOrCreate(1);
    registry.remove(1);

    expect(registry.get(1)).toBeUndefined();
  });
});

describe('GameStreamGapEmitter (D-13 seam)', () => {
  it('Test 8: emitting a GameStreamGapDetected payload drives a registered handler', () => {
    const emitter = new GameStreamGapEmitter();
    const handler = jest.fn();

    emitter.on(handler);

    const payload: GameStreamGapDetected = {
      gameId: 99,
      expectedSeq: 5,
      actualSeq: 7,
      at: new Date('2026-07-17T12:00:00Z'),
    };
    emitter.emit(payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('Test 9: GameStreamGapDetected exports exactly the four documented fields', () => {
    const payload: GameStreamGapDetected = {
      gameId: 1,
      expectedSeq: 1,
      actualSeq: 2,
      at: new Date(),
    };

    expect(Object.keys(payload).sort()).toEqual(['actualSeq', 'at', 'expectedSeq', 'gameId']);
  });
});
