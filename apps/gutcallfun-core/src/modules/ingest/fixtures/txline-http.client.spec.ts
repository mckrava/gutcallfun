import { ConfigService } from '@nestjs/config';
import { TxlineAuthExpiredError, TxlineHttpClient } from './txline-http.client';

// Source: PLAN.md 02-04 Task 1 acceptance criteria — headers attached,
// safe 401 refresh-once/retry-once, no retry storm, fixtureId guard.
describe('TxlineHttpClient (INGST-01)', () => {
  const config = {
    get: (key: string) => {
      const values: Record<string, string> = {
        TXLINE_GUEST_JWT: 'initial-guest-jwt',
        TXLINE_API_TOKEN: 'stable-api-token',
      };
      return values[key];
    },
  } as unknown as ConfigService;

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  function jsonResponse(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 401 ? 'Unauthorized' : 'OK',
      json: async () => body,
    } as unknown as Response;
  }

  it('Test 1: attaches Authorization Bearer and X-Api-Token headers on every request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const client = new TxlineHttpClient(config);

    await client.request('/api/fixtures/snapshot?startEpochDay=20200');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer initial-guest-jwt');
    expect(headers['X-Api-Token']).toBe('stable-api-token');
  });

  it('Test 2: a single 401 triggers exactly one refresh + one retry, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, 'Unauthorized')) // original request
      .mockResolvedValueOnce(jsonResponse(200, { token: 'refreshed-guest-jwt' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retried request

    const client = new TxlineHttpClient(config);
    const result = await client.request<{ ok: boolean }>('/api/fixtures/snapshot');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [refreshUrl] = fetchMock.mock.calls[1];
    expect(String(refreshUrl)).toContain('/auth/guest/start');

    const [, retryInit] = fetchMock.mock.calls[2];
    const retryHeaders = retryInit.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer refreshed-guest-jwt');
  });

  it('Test 3: a repeated 401 after refresh surfaces an error without a third request attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, 'Unauthorized')) // original request
      .mockResolvedValueOnce(jsonResponse(200, { token: 'refreshed-guest-jwt' })) // refresh
      .mockResolvedValueOnce(jsonResponse(401, 'Unauthorized')); // retried request, still dead

    const client = new TxlineHttpClient(config);

    await expect(client.request('/api/fixtures/snapshot')).rejects.toBeInstanceOf(
      TxlineAuthExpiredError,
    );
    // original + refresh + one retry = 3 total fetch calls; no second refresh/retry loop.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('Test 4: buildFixtureUrl rejects 0/negative/non-integer fixtureId before any fetch call', () => {
    const client = new TxlineHttpClient(config);

    expect(() => client.buildFixtureUrl('/api/scores/historical/{fixtureId}', 0)).toThrow();
    expect(() => client.buildFixtureUrl('/api/scores/historical/{fixtureId}', -5)).toThrow();
    expect(() => client.buildFixtureUrl('/api/scores/historical/{fixtureId}', 1.5)).toThrow();
    expect(() =>
      client.buildFixtureUrl('/api/scores/historical/{fixtureId}', Number.NaN),
    ).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();

    const url = client.buildFixtureUrl('/api/scores/historical/{fixtureId}', 42);
    expect(url).toBe('https://txline.txodds.com/api/scores/historical/42');
  });
});
