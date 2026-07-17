/**
 * Upstream SSE consumer for the TxLINE feed (INGST-02).
 *
 * Ported near-verbatim from `github.com/mckrava/txodds-txline-api-monitor`'s
 * `src/upstream.ts` (CLAUDE.md LOCK: port, don't rebuild on a third-party SSE
 * polyfill package — TxLINE requires two custom auth headers a browser's
 * native streaming API cannot send). Battle-tested against a 23,510-record
 * empirical corpus.
 *
 * Adaptations for this NestJS integration (StreamManagerService, Plan 05):
 *  - Removed the reference repo's `./constants.ts` import; the default SSE
 *    endpoint is inlined here (matches the txodds-api skill's verified
 *    origin) and is always overridable via `endpoint`.
 *  - Added `initialLastEventId` to `ConnectWithRetryOptions` so a caller can
 *    seed Last-Event-ID resume from a persisted cursor (`game.stream_cursor`)
 *    on the very first connect attempt, not only across reconnects within a
 *    single `connectWithRetry` call. Everything else (idle watchdog,
 *    exponential backoff, AUTH_EXPIRED sentinel, receivedAt-before-decode
 *    ordering) is unchanged from the reference implementation.
 *
 * Critical invariant (INGST-02, RESEARCH Pitfall 1 in this project's own
 * research — measurement-latency gate):
 *
 *   const { value, done } = await reader.read();
 *   const receivedAt = Date.now();   ← FIRST statement after read — before decode
 *   if (done) break;
 *   const chunk = decoder.decode(…); ← decode happens AFTER receivedAt stamp
 *
 * The receivedAt gate must NOT be moved. Any decode or parse before this line
 * would corrupt the latency measurement.
 *
 * Security:
 *  - JWT and apiToken are set ONLY as request headers; never relayed, never
 *    logged (CLAUDE.md: never commit/log TxODDS JWT/API tokens).
 *  - JSON.parse errors are caught -> onMeta('parse_error'), never crash the
 *    stream (RESEARCH Security Domain V5).
 *  - AUTH_EXPIRED is a Symbol sentinel -- cannot be confused with an Error or
 *    a string.
 */

// ── buildStreamUrl ────────────────────────────────────────────────────────────

/**
 * Append a fixtureId query parameter to the SSE endpoint URL when set.
 *
 * @param base      — SSE endpoint base URL (e.g. https://txline.txodds.com/api/scores/stream)
 * @param fixtureId — Optional validated positive-integer string (server-side
 *                    per-fixture stream filter — txodds-api skill,
 *                    sse-streaming.md). When undefined or empty, returns
 *                    `base` unchanged (byte-identical). When set, appends
 *                    `?fixtureId=<id>` (or `&fixtureId=<id>` if the base
 *                    already contains a query string).
 *
 * Security: fixtureId must already be validated as a positive integer by the
 * caller before reaching this function — no query-string metacharacters or
 * injection surface (RESEARCH Security Domain: query-string injection via
 * fixtureId). Last-Event-ID is sent as a header, not a query param, so it
 * coexists transparently.
 */
export function buildStreamUrl(base: string, fixtureId?: string): string {
  if (!fixtureId) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}fixtureId=${fixtureId}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** A fully parsed SSE block (the text between two consecutive double-newlines). */
export interface SseBlock {
  /** SSE `id:` field value, if present. */
  id?: string;
  /** SSE `event:` field value, if present (e.g. 'heartbeat'). */
  event?: string;
  /**
   * Joined `data:` field values — verbatim string, NEVER re-serialized.
   * Treated as an opaque string here. Do NOT make casing assumptions.
   */
  data: string;
}

/** Options for connectUpstream. */
export interface ConnectUpstreamOptions {
  jwt: string;
  apiToken: string;
  /** Last event ID to resume from on reconnect; sent as `Last-Event-ID` header when set. */
  lastEventId?: string;
  /** SSE endpoint URL. Defaults to the TxLINE scores/stream endpoint. */
  endpoint?: string;
  /**
   * Optional fixture ID for server-side stream filtering. When set, appended as
   * `?fixtureId=<id>` to the endpoint URL. Coexists with the Last-Event-ID resume header.
   * Must be a validated positive-integer string (digits only, non-zero).
   */
  fixtureId?: string;
  /**
   * Injection seam for tests. Defaults to the global `fetch`.
   * Signature matches native fetch: (url, init) => Promise<Response>.
   */
  fetchImpl?: (url: string, opts: RequestInit) => Promise<Response>;
  /** Called for each non-heartbeat data block (raw SSE data). */
  onEvent: (receivedAt: number, block: SseBlock) => void;
  /**
   * Called for heartbeat blocks and internal meta events (parse errors,
   * liveness signals). NOT called for real data blocks.
   */
  onMeta: (receivedAt: number, meta: Record<string, unknown>) => void;
}

// ── AUTH_EXPIRED sentinel ─────────────────────────────────────────────────────

/**
 * Symbol thrown/rejected by connectUpstream on a 401 response.
 *
 * Callers (StreamManagerService's reconnect handling) check `err ===
 * AUTH_EXPIRED` and re-authenticate exactly once via the shared
 * TxlineHttpClient rather than retrying blindly — the token is dead and
 * retrying will always 401 (RESEARCH Security Domain: 401 retry storm).
 */
export const AUTH_EXPIRED: unique symbol = Symbol('AUTH_EXPIRED');

// ── parseSseBlock ─────────────────────────────────────────────────────────────

/**
 * Parse a raw SSE block string into a SseBlock.
 *
 * Follows SSE spec field parsing:
 *  - `data:` lines — strip leading colon + one optional space; join with '\n'
 *  - `id:`   — strip leading colon + one optional space; store last value
 *  - `event:` — strip leading colon + one optional space; store last value
 *  - Comment lines (starting with ':'), blank lines, and unknown fields → ignored
 *
 * Note: TxLINE `data:` payloads are single-line JSON. Multi-data-line joining
 * is a robustness precaution, not expected behavior.
 */
export function parseSseBlock(block: string): SseBlock {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];
  let id: string | undefined;
  let event: string | undefined;

  for (const line of lines) {
    if (line.startsWith('data:')) {
      // Strip colon (5 chars) + one optional leading space per SSE spec
      dataLines.push(line.length > 5 && line[5] === ' ' ? line.slice(6) : line.slice(5));
    } else if (line.startsWith('id:')) {
      id = line.length > 3 && line[3] === ' ' ? line.slice(4) : line.slice(3);
    } else if (line.startsWith('event:')) {
      event = line.length > 6 && line[6] === ' ' ? line.slice(7) : line.slice(6);
    }
    // Comments (':'), 'retry:', blank lines, and unknown fields → ignored (SSE spec)
  }

  return { id, event, data: dataLines.join('\n') };
}

// ── connectUpstream ───────────────────────────────────────────────────────────

/**
 * Open a long-lived SSE connection to the TxLINE feed and process events.
 *
 * The function resolves when the upstream stream signals done (which in
 * production only happens on error). Kept for reference-repo fidelity;
 * StreamManagerService (Plan 05) drives the retry-aware `connectWithRetry`
 * below rather than this one-shot variant.
 *
 * Throws/rejects with `AUTH_EXPIRED` (the exported Symbol) on a 401 response.
 * Any other HTTP error throws a plain Error.
 *
 * @param opts.jwt          — Bearer token for Authorization header (INGST-01)
 * @param opts.apiToken     — X-Api-Token header value (INGST-01)
 * @param opts.lastEventId  — If set, sent as Last-Event-ID for SSE reconnect (INGST-02)
 * @param opts.endpoint     — Override the SSE endpoint URL
 * @param opts.fetchImpl    — Injectable fetch for testing (defaults to global fetch)
 * @param opts.onEvent      — Called for each non-heartbeat data block
 * @param opts.onMeta       — Called for heartbeat + internal meta (parse errors, etc.)
 */
export async function connectUpstream(opts: ConnectUpstreamOptions): Promise<void> {
  const {
    jwt,
    apiToken,
    lastEventId: initialLastEventId,
    endpoint = DEFAULT_STREAM_ENDPOINT,
    fixtureId,
    fetchImpl = fetch as unknown as NonNullable<ConnectUpstreamOptions['fetchImpl']>,
    onEvent,
    onMeta,
  } = opts;

  // INGST-01: Both auth headers are required on the upstream request
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    'X-Api-Token': apiToken,
    Accept: 'text/event-stream',
    'Cache-Control': 'no-cache',
  };

  // INGST-02: Last-Event-ID enables resuming after disconnection.
  // Sent as a header — coexists transparently with the ?fixtureId query param below.
  if (initialLastEventId !== undefined) {
    headers['Last-Event-ID'] = initialLastEventId;
  }

  // Append ?fixtureId=<id> when set; leave URL byte-identical to today when unset.
  const response = await fetchImpl(buildStreamUrl(endpoint, fixtureId), { method: 'GET', headers });

  // 401 → throw AUTH_EXPIRED sentinel (not a string — callers use `=== AUTH_EXPIRED`)
  if (response.status === 401) {
    throw AUTH_EXPIRED;
  }

  if (!response.ok || !response.body) {
    throw new Error(`Upstream SSE fetch failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();

    // ── MEASUREMENT GATE (INGST-02) ───────────────────────────────────────
    // receivedAt is stamped as the FIRST statement after reader.read() resolves,
    // before TextDecoder.decode() or any other processing.
    // DO NOT move this line down — any processing before this stamp corrupts
    // the latency measurement.
    const receivedAt = Date.now();
    // ───────────────────────────────────────────────────────────────────────

    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    // SSE blocks are separated by double-newlines (\r\n\r\n or \n\n)
    const blocks = buffer.split(/\r?\n\r?\n/);
    // Preserve the trailing partial fragment across chunk boundaries
    buffer = blocks.pop() ?? '';

    for (const rawBlock of blocks) {
      if (!rawBlock.trim()) continue; // skip empty separators

      const block = parseSseBlock(rawBlock);

      // FEED-05: Track lastEventId for the reconnect loop (connectWithRetry consumes this)
      // Here we just note it — the caller's reconnect wrapper tracks state
      void block.id;

      // Heartbeat → liveness-only; does NOT invoke onEvent
      if (block.event === 'heartbeat') {
        onMeta(receivedAt, { type: 'heartbeat' });
        continue;
      }

      if (!block.data) continue; // skip empty data blocks

      // Defensive JSON.parse: failures are reported but never crash
      // Raw logging MUST NOT depend on parse success — raw block must still be logged verbatim
      try {
        JSON.parse(block.data);
      } catch {
        onMeta(receivedAt, { type: 'parse_error', raw: block.data });
        // Fall through to onEvent — raw block must still be logged verbatim
      }

      onEvent(receivedAt, block);
    }
  }
}

// ── connectWithRetry constants ─────────────────────────────────────────────────

/** Default TxLINE SSE endpoint (txodds-api skill, sse-streaming.md — verified live 2026-07). */
const DEFAULT_STREAM_ENDPOINT = 'https://txline.txodds.com/api/scores/stream';
/** Default idle watchdog timeout: 30 seconds without any chunk → reconnect (INGST-02). */
const WATCHDOG_MS = 30_000;
/** Base exponential backoff delay in ms. */
const BASE_BACKOFF_MS = 1_000;
/** Maximum backoff cap in ms. */
const CAP_BACKOFF_MS = 30_000;
/** Maximum random jitter added to the backoff (ms). */
const JITTER_MS = 500;

// ── ConnectWithRetryOptions ───────────────────────────────────────────────────

/**
 * Options for connectWithRetry.
 *
 * The four timing knobs (watchdogMs, baseBackoffMs, capBackoffMs, jitterMs) are
 * injectable so tests can run without real delays. In production, all default to
 * their INGST-02 recommended values.
 */
export interface ConnectWithRetryOptions {
  jwt: string;
  apiToken: string;
  /** SSE endpoint URL. Defaults to the TxLINE scores/stream endpoint. */
  endpoint?: string;
  /**
   * Optional fixture ID for server-side stream filtering. When set, appended as
   * `?fixtureId=<id>` to the endpoint URL on every (re)connect attempt. Coexists
   * with the Last-Event-ID resume header, which is set independently in the headers
   * object and is not affected by this query parameter.
   * Must be a validated positive-integer string (digits only, non-zero).
   */
  fixtureId?: string;
  /**
   * Seeds Last-Event-ID resume on the FIRST connect attempt of this call
   * (Plan 05 adaptation). Set from the persisted `game.stream_cursor` so a
   * fresh process (or a re-`start()` after a prior stop) resumes exactly
   * where the last committed event left off, instead of always starting
   * from scratch. Subsequent reconnects within this same call use the most
   * recently observed SSE `id:` field instead (unchanged from the reference
   * repo's reconnect behavior).
   */
  initialLastEventId?: string;
  /** Injectable fetch impl for tests. Defaults to the global `fetch`. */
  fetchImpl?: (url: string, opts: RequestInit) => Promise<Response>;
  /** Called for each non-heartbeat data block (raw SSE data). */
  onEvent: (receivedAt: number, block: SseBlock) => void;
  /** Called for heartbeat and internal meta events (reconnecting, reconnected, etc.). */
  onMeta: (receivedAt: number, meta: Record<string, unknown>) => void;
  /** Idle watchdog timeout override for tests (default: 30_000 ms). */
  watchdogMs?: number;
  /** Exponential backoff base override for tests (default: 1_000 ms). */
  baseBackoffMs?: number;
  /** Backoff cap override for tests (default: 30_000 ms). */
  capBackoffMs?: number;
  /** Max random jitter override for tests (default: 500 ms). */
  jitterMs?: number;
  /** Optional AbortSignal to terminate the retry loop cleanly. */
  signal?: AbortSignal;
  /**
   * Called immediately after a successful HTTP 200 response, before stream
   * processing begins, on EVERY connect and reconnect.
   *
   * Provides the parsed HTTP `Date` response header as an epoch-ms value
   * (null when absent or unparseable — the Date header is second-granularity,
   * which is acceptable for clock-skew estimation), and the local
   * `Date.now()` captured at the same instant.
   *
   * callers use: clockSkewMs = serverDateMs − localAt
   * (positive → local clock is behind the server)
   *
   * Security: Date.parse result is guarded for NaN → null so a hostile or
   * missing Date header cannot crash the stream or corrupt the receivedAt
   * measurement gate.
   *
   * Implementation invariant: this callback fires at connection setup, NOT per
   * chunk. The receivedAt measurement gate in the read loop is NOT touched.
   */
  onConnectInfo?: (serverDateMs: number | null, localAt: number) => void;
}

// ── sleep helper ──────────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

// ── SingleStreamOpts (private) ────────────────────────────────────────────────

interface SingleStreamOpts {
  jwt: string;
  apiToken: string;
  lastEventId: string | undefined;
  endpoint: string;
  fetchImpl: NonNullable<ConnectWithRetryOptions['fetchImpl']>;
  onEvent: ConnectWithRetryOptions['onEvent'];
  onMeta: ConnectWithRetryOptions['onMeta'];
  watchdogMs: number;
  /** Invoked with each SSE id field value so the caller can track lastEventId. */
  onLastEventId: (id: string) => void;
  /**
   * Called immediately after a successful HTTP 200 response, before stream
   * processing begins. Used by connectWithRetry to emit the "reconnected"
   * meta right when the new connection opens.
   */
  onConnected?: () => void;
  /**
   * Called immediately after a successful HTTP 200 response, before stream
   * processing begins, on EVERY connect and reconnect.
   * Provides the parsed HTTP Date header (null if absent/invalid) and the local
   * Date.now() captured at the same instant. See ConnectWithRetryOptions for details.
   */
  onConnectInfo?: ConnectWithRetryOptions['onConnectInfo'];
}

// ── runSingleStream (private) ─────────────────────────────────────────────────

/**
 * Open one SSE connection, process its stream until exhausted or watchdog fires,
 * and return. This is the inner workhorse called by the connectWithRetry loop.
 *
 * Throws AUTH_EXPIRED (the Symbol) on 401. Throws Error on other HTTP errors.
 * Returns normally on stream end (done) or watchdog cancellation.
 *
 * The idle watchdog resets on EVERY transport-level `reader.read()` result —
 * including heartbeat chunks — because non-heartbeat SSE actions are NOT
 * liveness signals by themselves. Only actual bytes on the wire reset it.
 */
async function runSingleStream(opts: SingleStreamOpts): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.jwt}`,
    'X-Api-Token': opts.apiToken,
    Accept: 'text/event-stream',
    'Cache-Control': 'no-cache',
  };
  if (opts.lastEventId !== undefined) {
    headers['Last-Event-ID'] = opts.lastEventId;
  }

  const response = await opts.fetchImpl(opts.endpoint, { method: 'GET', headers });

  // 401 → AUTH_EXPIRED sentinel: callers must not retry
  if (response.status === 401) {
    throw AUTH_EXPIRED;
  }
  if (!response.ok || !response.body) {
    throw new Error(`Upstream SSE fetch failed: HTTP ${response.status}`);
  }

  // Connection established — notify caller so it can emit "reconnected" meta
  // right now (before streaming events), not deferred to stream end.
  opts.onConnected?.();

  // Capture clock skew from the HTTP Date response header. Fires on every
  // connect and reconnect so the skew stays fresh across reconnects.
  // Guard: Date.parse returns NaN on missing/garbage headers — map to null so a
  // hostile header cannot crash the stream or corrupt the receivedAt gate below.
  // Implementation invariant: this block runs at connection setup, NOT inside the
  // read loop — the receivedAt measurement gate MUST NOT be moved or preceded by work.
  if (opts.onConnectInfo) {
    const dateHeader = response.headers.get('date');
    const parsed = dateHeader !== null ? Date.parse(dateHeader) : NaN;
    const serverDateMs = Number.isNaN(parsed) ? null : parsed;
    const localAt = Date.now();
    opts.onConnectInfo(serverDateMs, localAt);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;

  /** Reset the idle watchdog. Called on every raw chunk from reader.read(). */
  const resetWatchdog = (): void => {
    if (watchdogTimer !== undefined) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      // Watchdog fired: cancel the reader to break the read loop
      try {
        reader.cancel();
      } catch {
        // Ignore errors from fake/already-closed readers in tests
      }
    }, opts.watchdogMs);
  };

  try {
    resetWatchdog(); // start the watchdog before the first read

    while (true) {
      let result: { value?: Uint8Array; done: boolean };
      try {
        result = await reader.read();
      } catch {
        // reader.read() threw — watchdog cancelled it, or stream errored.
        // Either way, treat as stream end and let the reconnect loop handle it.
        break;
      }

      // ── MEASUREMENT GATE (INGST-02) ────────────────────────────────────
      // receivedAt MUST be the FIRST statement after reader.read() resolves —
      // before TextDecoder.decode() or any other processing.
      // Moving this line after decode() would add ~0–2ms processing time and
      // corrupt the latency distribution.
      const receivedAt = Date.now();
      // ─────────────────────────────────────────────────────────────────────

      // Reset watchdog on every transport-level chunk (data OR heartbeat)
      resetWatchdog();

      if (result.done) break;

      const chunk = decoder.decode(result.value, { stream: true });
      buffer += chunk;

      // SSE blocks separated by double-newlines
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? ''; // preserve trailing partial fragment

      for (const rawBlock of blocks) {
        if (!rawBlock.trim()) continue;

        const block = parseSseBlock(rawBlock);

        // Track SSE id field for Last-Event-ID reconnect recovery
        if (block.id) {
          opts.onLastEventId(block.id);
        }

        if (block.event === 'heartbeat') {
          // Liveness only — NOT a data event; do NOT invoke onEvent
          opts.onMeta(receivedAt, { type: 'heartbeat' });
          continue;
        }

        if (!block.data) continue;

        // Defensive JSON parse: failures reported, never crash
        try {
          JSON.parse(block.data);
        } catch {
          opts.onMeta(receivedAt, { type: 'parse_error', raw: block.data });
          // Fall through to onEvent — raw data must still be logged verbatim
        }

        opts.onEvent(receivedAt, block);
      }
    }
  } finally {
    if (watchdogTimer !== undefined) clearTimeout(watchdogTimer);
  }
}

// ── connectWithRetry ──────────────────────────────────────────────────────────

/**
 * Maintain a long-lived SSE connection with idle watchdog, exponential-backoff
 * reconnect, Last-Event-ID recovery, and AUTH_EXPIRED short-circuit (INGST-02).
 *
 * Design invariants:
 *  - Idle watchdog (~30s default) fires when the stream goes silent at the
 *    transport level.
 *  - On each drop/timeout: backoff = min(base * 2^(attempt-1), cap) + jitter.
 *    Backoff counter resets to 0 when a reconnect connection successfully opens.
 *  - Last-Event-ID from the most recent `id:` field is forwarded on every
 *    reconnect so the server can resume from the last seen event. Seeded on
 *    the FIRST connect attempt from `opts.initialLastEventId` (Plan 05
 *    adaptation) so a fresh process resumes from the persisted
 *    `game.stream_cursor` rather than always starting cold.
 *  - A 401 / AUTH_EXPIRED response from the server calls onMeta with
 *    `{ type: 'auth_expired' }` and returns WITHOUT retrying (RESEARCH
 *    Security Domain: 401 retry storm). The caller (StreamManagerService)
 *    decides whether to re-authenticate once via TxlineHttpClient and call
 *    connectWithRetry again — this function itself never loops on 401.
 *
 * Meta events emitted (caller routes to logging):
 *  - `{ type: 'reconnecting', attempt: N, backoffMs: B }` before each sleep
 *  - `{ type: 'reconnected' }` immediately when the new connection opens
 *  - `{ type: 'auth_expired' }` on 401 (final event — function returns after)
 *
 * @param opts.watchdogMs   Override idle timeout for tests (default: WATCHDOG_MS = 30s)
 * @param opts.baseBackoffMs Override backoff base for tests (default: BASE_BACKOFF_MS = 1s)
 * @param opts.capBackoffMs  Override backoff cap for tests (default: CAP_BACKOFF_MS = 30s)
 * @param opts.jitterMs      Override jitter range for tests (default: JITTER_MS = 500ms)
 * @param opts.signal        AbortSignal to stop the loop externally
 */
export async function connectWithRetry(opts: ConnectWithRetryOptions): Promise<void> {
  const {
    jwt,
    apiToken,
    endpoint = DEFAULT_STREAM_ENDPOINT,
    fixtureId,
    initialLastEventId,
    fetchImpl = fetch as unknown as NonNullable<ConnectWithRetryOptions['fetchImpl']>,
    onEvent,
    onMeta,
    watchdogMs = WATCHDOG_MS,
    baseBackoffMs = BASE_BACKOFF_MS,
    capBackoffMs = CAP_BACKOFF_MS,
    jitterMs = JITTER_MS,
    signal,
    onConnectInfo,
  } = opts;

  // Seeded from the persisted cursor on the first attempt; overwritten by
  // the SSE stream's own `id:` field thereafter (carries across reconnects).
  let lastEventId: string | undefined = initialLastEventId;
  let reconnectAttempt = 0; // 0 = initial connect; increments on each drop/failure

  while (!signal?.aborted) {
    try {
      await runSingleStream({
        jwt,
        apiToken,
        lastEventId,
        // buildStreamUrl appends ?fixtureId=<id> when set; Last-Event-ID is sent as a
        // header by runSingleStream independently, so the two mechanisms coexist.
        endpoint: buildStreamUrl(endpoint, fixtureId),
        fetchImpl,
        onEvent,
        onMeta,
        watchdogMs,
        onLastEventId: (id) => {
          lastEventId = id;
        },
        // Emit "reconnected" the moment the NEW connection opens — not deferred to
        // stream end. Also resets the attempt counter so the next backoff starts fresh.
        onConnected:
          reconnectAttempt > 0
            ? () => {
                onMeta(Date.now(), { type: 'reconnected' });
                reconnectAttempt = 0; // reset: next drop starts the backoff from base again
              }
            : undefined,
        onConnectInfo,
      });
    } catch (err) {
      if (err === AUTH_EXPIRED) {
        // AUTH death: caller decides on the one-time re-auth, NEVER retried here.
        onMeta(Date.now(), { type: 'auth_expired' });
        return; // intentional: this function never loops on 401
      }
      // Other errors (HTTP 5xx, network error): fall through to reconnect logic
    }

    if (signal?.aborted) break;

    // ── Compute backoff + emit reconnecting meta ───────────────────────────
    reconnectAttempt++;
    const rawBackoff = Math.min(baseBackoffMs * Math.pow(2, reconnectAttempt - 1), capBackoffMs);
    const backoffMs = rawBackoff + Math.random() * jitterMs;

    onMeta(Date.now(), {
      type: 'reconnecting',
      attempt: reconnectAttempt,
      backoffMs: Math.round(backoffMs),
    });

    await sleep(backoffMs, signal);
  }
}
