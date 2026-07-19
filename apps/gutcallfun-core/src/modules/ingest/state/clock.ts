/**
 * Two-clock discipline helpers (STAT-03).
 *
 * GutCall's live loop runs two independent clocks that must never be mixed in
 * one comparison:
 *  - Match-time (feed Ts): possession attack-run segmentation, debounce
 *    windows, and any duration derived from the TxLINE feed's own event
 *    timestamps. `possession.ts` imports `feedElapsedMs()` for its attack-run
 *    gap check and MUST NOT call `Date.now()` directly.
 *  - User-time (server wall clock): answer-window expiry (`expires_at`), the
 *    5-second prediction-window TTL. Phase 4 (WNDW/ANSW) is the first
 *    consumer of `wallClockNow()`/`isExpired()` — they are exposed here now so
 *    STAT-03 has exactly one canonical home for both clock sources, even
 *    though Phase 2 itself only exercises the feed-Ts side.
 *
 * Pure module: no I/O, no NestJS DI, no DB.
 */

/**
 * Match-time: elapsed milliseconds between two feed `Ts` values (epoch ms).
 * Both arguments MUST be feed `Ts` values — never mix with a wall-clock
 * (`Date.now()`) value in this computation.
 */
export function feedElapsedMs(fromTs: number, toTs: number): number {
  return toTs - fromTs;
}

/**
 * User-time: current server wall-clock timestamp (epoch ms).
 * Phase 4 answer-window seam — unused by Phase 2's match-time logic.
 */
export function wallClockNow(): number {
  return Date.now();
}

/**
 * User-time: whether a wall-clock expiry timestamp has already passed.
 * Phase 4 answer-window seam — unused by Phase 2's match-time logic.
 */
export function isExpired(expiresAt: Date): boolean {
  return wallClockNow() > expiresAt.getTime();
}
