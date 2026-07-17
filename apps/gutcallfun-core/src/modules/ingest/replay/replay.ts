/**
 * Replay emitter (RPLY-01, D-03, D-04).
 *
 * Ported from github.com/mckrava/txodds-txline-api-monitor `src/replay.ts`
 * (`createReplayDriver`'s historical-array branch + `parseHistoricalResponse`),
 * adapted to this project's own two-source contract (D-01): an ordered
 * raw-event array in (Source A: historical fetch; Source B: captured
 * NDJSON / the game's own game_event rows — see replay-source.service.ts),
 * an async per-event callback out. The callback feeds
 * EventIngestService.processEvent(gameId, raw) directly — nothing in this
 * module or its caller sets a downstream "replay mode" flag (RPLY-02).
 *
 * The reference repo's NDJSON-file playback branch and its CLI arg parser
 * (`parseReplayArgs`) are NOT ported here — this project's Source B already
 * normalizes to the SAME "ordered raw-event array" shape as Source A
 * (replay-source.service.ts owns reading the NDJSON file or the game_event
 * rows), so `emitReplay` below only needs the one array-driven code path.
 *
 * ── DEVIATION FROM PORT-AS-IS (D-04) ────────────────────────────────────
 * The reference driver defaults `maxGapMs` to 5000 and ALWAYS clamps
 * inter-event gaps to that ceiling — this compresses multi-hour pre-match
 * dead time down to 5s. CONTEXT.md's D-04 explicitly LOCKS the opposite
 * behavior for this project: "the pre-match segment plays at full original
 * pacing — no compression, no skip." This is a deliberate, documented
 * deviation (CONTEXT.md wins over "port as-is" per RESEARCH.md's Summary
 * conflict resolution), not an oversight: the default here is `Infinity`
 * (no clamp) unless a caller explicitly passes `maxGapMs` (kept only for
 * headless-testing flexibility — never wired to a user-facing surface).
 *
 * ── ADDED, not present in the reference (D-03) ──────────────────────────
 * Timestamp rebasing: `delta = now() - firstEvent.Ts` is computed once from
 * the first event's `Ts` and added to EVERY event's `Ts` (and `ts`, if
 * present) before it reaches the caller's `onEvent` callback, so replayed
 * match time lines up with wall time. The live SSE path is an untouched
 * passthrough — rebasing only ever happens inside this replay emitter.
 */

export interface ReplayEmitterOptions {
  /**
   * Ordered raw-event array — Source A (historical fetch, cached
   * in-memory) or Source B (captured NDJSON / the game's own game_event
   * rows), both already normalized to this same shape by
   * ReplaySourceService.load().
   */
  events: Array<Record<string, unknown>>;
  /**
   * Playback speed multiplier. Default 1 (preserves original inter-event
   * gap ratios so replayed event time aligns with wall time — the RPLY-03
   * precision-edge backstop). Must be a positive finite number. speed>1 is
   * a headless-testing configuration ONLY — never reachable from a
   * user-facing surface (D-04).
   */
  speed?: number;
  /**
   * Upper bound on inter-event sleep in ms, applied AFTER speed division:
   * `min(originalGap / speed, maxGapMs)`. Reference repo default: 5000.
   * THIS PROJECT's default: `Infinity` (no clamp) — see the module-level
   * DEVIATION note above (D-04). Only override for headless testing; never
   * clamp the pre-match segment in a demo/production path.
   */
  maxGapMs?: number;
  /** Called once per rebased event, in original order. Awaited before advancing to the next event. */
  onEvent: (event: Record<string, unknown>) => Promise<void> | void;
  /** Injectable sleep implementation. Defaults to a real setTimeout-based sleep; tests inject a no-op so a full fixture runs instantly. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Injectable wall-clock reader for the D-03 rebase delta. Defaults to Date.now. */
  now?: () => number;
}

const defaultSleepImpl = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads `Ts` (PascalCase, preferred) falling back to `ts` (lowercase) — same defensive read as the reference driver's historical-array branch. */
function extractTs(event: Record<string, unknown>): number | null {
  if (typeof event.Ts === 'number') return event.Ts;
  if (typeof event.ts === 'number') return event.ts;
  return null;
}

/** Returns a shallow clone of `event` with `Ts` (and `ts`, if present) replaced by `rebasedTs`. Never mutates the input — the caller's array (and, for Source B, the DB-sourced payload) stays untouched. */
function rebaseEvent(event: Record<string, unknown>, rebasedTs: number): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...event };
  if (typeof event.Ts === 'number') clone.Ts = rebasedTs;
  if (typeof event.ts === 'number') clone.ts = rebasedTs;
  return clone;
}

/**
 * Drive `events` through `onEvent`, rebased (D-03) and paced by original
 * inter-event gaps ÷ speed (D-04). Resolves once every event has been
 * emitted and its `onEvent` callback has settled. A `speed` that is not a
 * positive finite number throws synchronously, before any event is emitted
 * or any sleep occurs.
 */
export async function emitReplay(opts: ReplayEmitterOptions): Promise<void> {
  const { events, onEvent } = opts;
  const speed = opts.speed ?? 1;
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error(`emitReplay: speed must be a positive finite number; got ${String(speed)}`);
  }
  // See module-level DEVIATION note (D-04): Infinity, not the reference's 5000.
  const maxGapMs = opts.maxGapMs ?? Infinity;
  const sleepImpl = opts.sleepImpl ?? defaultSleepImpl;
  const now = opts.now ?? Date.now;

  if (events.length === 0) return;

  const firstTs = extractTs(events[0]);
  // D-03: delta computed once from the FIRST event's Ts, then applied to
  // every event (including the first) — this is what aligns replayed
  // match time with wall time at speed=1.
  const delta = firstTs === null ? 0 : now() - firstTs;

  let prevTs: number | null = null;
  for (const raw of events) {
    const ts = extractTs(raw);

    if (ts !== null && prevTs !== null) {
      const gap = Math.min((ts - prevTs) / speed, maxGapMs);
      if (gap > 0) {
        await sleepImpl(gap);
      }
    }
    if (ts !== null) prevTs = ts;

    const rebased = ts !== null ? rebaseEvent(raw, ts + delta) : raw;
    await onEvent(rebased);
  }
}

// ── parseHistoricalResponse (ported near-verbatim) ──────────────────────────

/**
 * Parse a historical response body from GET /api/scores/historical/{id}
 * into an array of Scores objects ready for replay.
 *
 * txline-openapi.yaml documents this endpoint as returning a JSON array
 * directly (`application/json`, `Scores[]`) — case (a) below is the
 * expected path. Cases (b)/(c) are ported defensively from the reference
 * repo, which observed the endpoint sometimes returning SSE-formatted text
 * (`data: {...}\n` lines) instead; keeping that defensive handling costs
 * nothing and protects against the same drift the reference repo hardened
 * against.
 *
 *   (a) Already an array → returned as-is (passthrough; the expected shape
 *       per the OpenAPI spec).
 *   (b) A string that is itself a JSON array → parsed to that array
 *       (defensive shortcut).
 *   (c) A string in SSE format → split on newlines, keep only `data:`
 *       lines, strip the prefix and optional single following space,
 *       JSON.parse each payload inside a try/catch that skips malformed
 *       lines without throwing.
 *   (d) Any other type → empty array (never throws).
 *
 * Security: performs ZERO logging and ZERO network I/O — the raw response
 * body may transit auth-bearing headers in the same pipeline; this
 * function never touches them.
 */
export function parseHistoricalResponse(data: unknown): Record<string, unknown>[] {
  // (a) Already an array → passthrough
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }

  // (b) and (c) require a string
  if (typeof data !== 'string') {
    return [];
  }

  const trimmed = data.trim();

  // (b) String that is itself a JSON array → try whole-string parse first
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as Record<string, unknown>[];
      }
    } catch {
      // Fall through to SSE line-by-line parsing
    }
  }

  // (c) SSE-format text: split on newlines, keep data: lines, parse each payload
  const result: Record<string, unknown>[] = [];

  for (const line of data.split('\n')) {
    const stripped = line.trimEnd();

    if (!stripped.startsWith('data:')) {
      continue;
    }

    let payload = stripped.slice('data:'.length);
    if (payload.startsWith(' ')) {
      payload = payload.slice(1);
    }

    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        result.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Skip malformed payload; remaining valid lines still parsed
    }
  }

  return result;
}
