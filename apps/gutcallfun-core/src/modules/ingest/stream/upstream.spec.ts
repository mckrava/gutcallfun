import { connectWithRetry } from './upstream';

// CR-02 (02-REVIEW.md) regression coverage. Unlike stream-manager.service.spec.ts,
// this file does NOT `jest.mock('./upstream')` — it drives the REAL exported
// connectWithRetry with an injected fetchImpl, so the abort-into-fetch and
// abort-into-reader.cancel() wiring is exercised for real.
//
// Never read real credentials from .env (INGST-01) — all values here are
// obviously synthetic.

/** Flush the microtask/macrotask queue enough times for chained awaits to settle. */
async function flushAsync(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** A reader whose read() never settles on its own — only cancel() resolves it. */
function createBlockedReader() {
  let resolveRead: ((v: { done: boolean; value?: Uint8Array }) => void) | null = null;

  const read = jest.fn(() => {
    return new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
      resolveRead = resolve;
    });
  });

  const cancel = jest.fn(async () => {
    resolveRead?.({ done: true });
    resolveRead = null;
  });

  return { read, cancel };
}

/** A reader whose read() resolves { done: true } immediately (normal stream end). */
function createDoneReader() {
  const read = jest.fn(async () => ({ done: true }) as { done: boolean; value?: Uint8Array });
  const cancel = jest.fn(async () => undefined);
  return { read, cancel };
}

function fakeResponse(reader: { read: jest.Mock; cancel: jest.Mock }): Response {
  return {
    status: 200,
    ok: true,
    headers: { get: () => null },
    body: { getReader: () => reader },
  } as unknown as Response;
}

describe('connectWithRetry — CR-02 abort-signal threading (real upstream.ts)', () => {
  it('Test 1: the signal reaches the transport — fetchImpl receives the same AbortSignal passed to connectWithRetry', async () => {
    const controller = new AbortController();
    const reader = createBlockedReader();
    let capturedInit: RequestInit | undefined;
    const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => {
      capturedInit = init;
      return fakeResponse(reader);
    });

    const promise = connectWithRetry({
      jwt: 'jwt-test',
      apiToken: 'token-test',
      fetchImpl,
      onEvent: jest.fn(),
      onMeta: jest.fn(),
      watchdogMs: 60_000,
      baseBackoffMs: 1,
      capBackoffMs: 1,
      jitterMs: 0,
      signal: controller.signal,
    });

    await flushAsync();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(capturedInit?.signal).toBe(controller.signal);

    controller.abort();
    await promise;
  });

  it('Test 2: abort promptly interrupts a blocked read (not the 60s watchdog)', async () => {
    const controller = new AbortController();
    const reader = createBlockedReader();
    const fetchImpl = jest.fn(async () => fakeResponse(reader));

    const promise = connectWithRetry({
      jwt: 'jwt-test',
      apiToken: 'token-test',
      fetchImpl,
      onEvent: jest.fn(),
      onMeta: jest.fn(),
      watchdogMs: 60_000, // sub-second resolution proves ABORT interrupted the read, not the watchdog
      baseBackoffMs: 1,
      capBackoffMs: 1,
      jitterMs: 0,
      signal: controller.signal,
    });

    await flushAsync();

    const start = Date.now();
    controller.abort();
    await promise;
    const elapsed = Date.now() - start;

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(1_000);
  });

  it('Test 3: no watchdog-timer leak on normal completion — reader.cancel is not invoked after the stream already ended', async () => {
    let reader: ReturnType<typeof createDoneReader> | undefined;
    const fetchImpl = jest.fn(async () => {
      reader = createDoneReader();
      return fakeResponse(reader);
    });
    const controller = new AbortController();
    // Exit the retry loop as soon as it announces the next reconnect attempt,
    // right after the stream ended normally.
    const onMeta = jest.fn((_receivedAt: number, meta: Record<string, unknown>) => {
      if (meta.type === 'reconnecting') controller.abort();
    });

    await connectWithRetry({
      jwt: 'jwt-test',
      apiToken: 'token-test',
      fetchImpl,
      onEvent: jest.fn(),
      onMeta,
      watchdogMs: 50,
      baseBackoffMs: 1,
      capBackoffMs: 1,
      jitterMs: 0,
      signal: controller.signal,
    });

    expect(reader).toBeDefined();
    const cancelCallsAfterResolve = reader!.cancel.mock.calls.length;

    // Wait past the 50ms watchdog window in real time — if the timer wasn't
    // cleared in the finally block, it would fire here and call cancel() again.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(reader!.cancel.mock.calls.length).toBe(cancelCallsAfterResolve);
  });

  it('Test 4: no abort-listener leak — the exact handler runSingleStream registered is later removed', async () => {
    const controller = new AbortController();
    const addSpy = jest.spyOn(controller.signal, 'addEventListener');
    const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');

    const fetchImpl = jest.fn(async () => fakeResponse(createDoneReader()));
    const onMeta = jest.fn((_receivedAt: number, meta: Record<string, unknown>) => {
      if (meta.type === 'reconnecting') controller.abort();
    });

    await connectWithRetry({
      jwt: 'jwt-test',
      apiToken: 'token-test',
      fetchImpl,
      onEvent: jest.fn(),
      onMeta,
      watchdogMs: 50,
      baseBackoffMs: 1,
      capBackoffMs: 1,
      jitterMs: 0,
      signal: controller.signal,
    });

    // sleep() also registers an 'abort' listener on the same signal, so compare
    // by handler IDENTITY (the first one registered, by runSingleStream), not
    // just a call count.
    const abortAddCalls = addSpy.mock.calls.filter(([type]) => type === 'abort');
    expect(abortAddCalls.length).toBeGreaterThan(0);
    const streamHandler = abortAddCalls[0][1];

    const abortRemoveCalls = removeSpy.mock.calls.filter(([type]) => type === 'abort');
    expect(abortRemoveCalls.some(([, handler]) => handler === streamHandler)).toBe(true);
  });

  it('Regression guard: AUTH_EXPIRED still short-circuits with exactly one fetch attempt', async () => {
    const fetchImpl = jest.fn(
      async () =>
        ({
          status: 401,
          ok: false,
          headers: { get: () => null },
          body: null,
        }) as unknown as Response,
    );
    const onMeta = jest.fn();

    await connectWithRetry({
      jwt: 'jwt-test',
      apiToken: 'token-test',
      fetchImpl,
      onEvent: jest.fn(),
      onMeta,
      baseBackoffMs: 1,
      capBackoffMs: 1,
      jitterMs: 0,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onMeta).toHaveBeenCalledTimes(1);
    expect(onMeta).toHaveBeenCalledWith(expect.any(Number), { type: 'auth_expired' });
  });
});
