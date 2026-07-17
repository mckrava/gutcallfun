import { Injectable } from '@nestjs/common';
import { Mutex } from 'async-mutex';

// Per-game serial event processing (STAT-02). This is the ONLY concurrency
// guarantee this phase provides: per-game serial processing via one
// async-mutex Mutex per gameId. There is NO cross-game ordering guarantee
// and NO distributed lock (single-process deployment, D-02) — flagged in
// PLAN.md as an assumption for reviewer confirmation.
@Injectable()
export class GameMutexRegistry {
  private readonly mutexes = new Map<number, Mutex>();

  // Public so the eviction/identity contract (STAT-02: same Mutex per
  // gameId, distinct Mutex per distinct gameId) can be asserted directly
  // in a spec, per PLAN.md acceptance criteria.
  forGame(gameId: number): Mutex {
    let mutex = this.mutexes.get(gameId);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(gameId, mutex);
    }
    return mutex;
  }

  async runExclusive<T>(gameId: number, fn: () => Promise<T>): Promise<T> {
    return this.forGame(gameId).runExclusive(fn);
  }

  // Eviction for finished/cancelled games — bounds Map growth across a
  // long-running process handling many fixtures (RESEARCH Security Domain).
  remove(gameId: number): void {
    this.mutexes.delete(gameId);
  }
}
