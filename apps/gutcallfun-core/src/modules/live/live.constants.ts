/**
 * Frozen constants for the live prediction loop.
 *
 * The ladder (outcome key -> base_gain -> display_order) is LOCKED: calibrated
 * on a 1,708-sample corpus and never recalibrated, rescaled or reordered
 * (CLAUDE.md "Game economy"). These values are the ONLY place the ladder is
 * declared; every question instance copies them into its own
 * `game_question_option` rows at open time, and every award reads `base_gain`
 * back from that stored row — never from this table.
 */

/** The four ladder rungs, lowest to highest. Order is significant. */
export type Rung = 'fizzles' | 'danger' | 'shot' | 'goal';

export interface LadderEntry {
  outcomeKey: Rung;
  baseGain: number;
  displayOrder: number;
}

/** LOCKED 5/7/15/100 ladder. Never recalibrate, never reorder. */
export const LADDER: readonly LadderEntry[] = Object.freeze([
  Object.freeze({
    outcomeKey: 'fizzles',
    baseGain: 5,
    displayOrder: 1,
  }),
  Object.freeze({ outcomeKey: 'danger', baseGain: 7, displayOrder: 2 }),
  Object.freeze({ outcomeKey: 'shot', baseGain: 15, displayOrder: 3 }),
  Object.freeze({ outcomeKey: 'goal', baseGain: 100, displayOrder: 4 }),
]);

/** Verbatim, frozen question copy — the UI is built against this exact string. */
export const QUESTION_CONTENT = 'How far will this attack go?';

/**
 * StatusIds during which a prediction window may open (WNDW-01): H1, H2, ET1,
 * ET2 — the four in-play halves. Half-time (3), HT-ET (8), and every break /
 * terminal / suspension status are excluded, so no window ever opens while the
 * ball is not in play.
 *
 * StatusId is an OPEN SET on the wire (100+ observed values) and is never
 * modelled as a closed enum — this is a membership test against a whitelist,
 * not an exhaustive mapping.
 */
export const IN_PLAY_STATUS_IDS: ReadonlySet<number> = new Set([2, 4, 7, 9]);

/** Answer-lock TTL in seconds. `expires_at` = open + this, on the SERVER WALL CLOCK (STAT-03). */
export const ANSWER_WINDOW_TTL_SECONDS = 5;

/**
 * DEMO-SHORTCUT: simplifies WNDW-03 (soft-terminal `pendingCloseAt` stamping,
 * 12s attacking-team pressure cancellation, and finalise-at-stamp-time). The
 * full close rule was too large for the pre-kickoff window; this is a flat
 * timer from open, still resolving to the faithfully accumulated high-water
 * rung. Reconcile post-match.
 */
export const RESOLVE_AFTER_MS = 12_000;

/**
 * HARD CAP on deferred resolution. If an unconfirmed goal neither confirms nor
 * is discarded within this long from window OPEN, the window resolves anyway to
 * its highest non-goal rung.
 *
 * This cap is the most safety-critical constant in the module. A window that
 * hangs open forever holds that game's slot in `LiveWindowRegistry` (and, while
 * `state='open'`, its row in the `uq_gq_one_open_per_game` partial index), so NO
 * further question could ever open for that game — one stuck goal would kill the
 * live loop for the rest of the match. Deferral must always terminate.
 *
 * 90s is chosen against the ~76s median goal confirm lag: long enough to catch
 * the large majority of real confirmations, short enough that a lost incident
 * costs one window rather than the match.
 */
export const GOAL_CONFIRM_GRACE_MS = 90_000;

/** Re-arm interval while deferred — bounds worst-case latency after a confirm/discard lands. */
export const GOAL_CONFIRM_POLL_MS = 5_000;

/**
 * Per-game wall-clock cooldown between window opens, so a sustained attacking
 * passage cannot spam windows. Backstop only — the primary guard is the
 * one-open-window-per-game rule plus its DB partial unique index.
 */
export const OPEN_COOLDOWN_MS = 20_000;

/** SchedulerRegistry timeout-name prefix. Namespaced so cleanup only ever sweeps this module's own timers. */
export const RESOLVE_TIMER_PREFIX = 'live-resolve';

export function resolveTimerName(gameId: number, questionId: string): string {
  return `${RESOLVE_TIMER_PREFIX}:${gameId}:${questionId}`;
}
