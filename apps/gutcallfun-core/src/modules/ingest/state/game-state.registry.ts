import { Injectable } from '@nestjs/common';
import { createInitialGameState, GameState } from './game-state.types';

// Singleton registry holding one in-memory state per live game (STAT-01).
// Same per-key Map<number, T> shape as GameMutexRegistry — kept eviction-
// consistent (RESEARCH Security Domain: unbounded map growth).
@Injectable()
export class GameStateRegistry {
  private readonly states = new Map<number, GameState>();

  getOrCreate(gameId: number): GameState {
    let state = this.states.get(gameId);
    if (!state) {
      state = createInitialGameState(gameId);
      this.states.set(gameId, state);
    }
    return state;
  }

  get(gameId: number): GameState | undefined {
    return this.states.get(gameId);
  }

  // Eviction for finished/cancelled games — bounds Map growth across a
  // long-running process handling many fixtures (RESEARCH Security Domain).
  remove(gameId: number): void {
    this.states.delete(gameId);
  }
}
