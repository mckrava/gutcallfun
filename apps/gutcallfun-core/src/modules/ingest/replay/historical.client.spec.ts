import { ConfigService } from '@nestjs/config';
import { TxlineHttpClient } from '../fixtures/txline-http.client';
import { HistoricalClient } from './historical.client';

// Source: quick task 260718-3cm Task 2 acceptance criteria — SSE text
// consumed via requestText, cache holds, [] fallback, fixtureId guard.

// Build a TxlineHttpClient double whose buildFixtureUrl is the REAL
// implementation (positive-integer validation + https://txline.txodds.com
// prefixing) so Test 5 exercises the actual guard, with requestText
// swapped for a jest.fn() double.
interface TxlineDouble {
  buildFixtureUrl: TxlineHttpClient['buildFixtureUrl'];
  requestText: jest.Mock<Promise<string>, [string]>;
}

function buildTxlineDouble(): TxlineDouble {
  const config = {
    get: (key: string) => {
      const values: Record<string, string> = {
        TXLINE_GUEST_JWT: 'initial-guest-jwt',
        TXLINE_API_TOKEN: 'stable-api-token',
      };
      return values[key];
    },
  } as unknown as ConfigService;
  const real = new TxlineHttpClient(config);

  return {
    buildFixtureUrl: (pathTemplate: string, fixtureId: number) =>
      real.buildFixtureUrl(pathTemplate, fixtureId),
    requestText: jest.fn<Promise<string>, [string]>(),
  };
}

const SSE_BODY =
  'data: {"FixtureId":18241006,"Action":"safe_possession","Ts":1783281625878,"Seq":23}\n' +
  '\n' + // blank line — must be skipped without breaking the parse
  ': keep-alive comment line\n' + // SSE comment line — must also be skipped
  'data: {"FixtureId":18241006,"Action":"comment","Ts":1783281625999,"Seq":24}\n' +
  'data: {"FixtureId":18241006,"Action":"connected","Ts":1783712000000,"Seq":25}\n';

describe('HistoricalClient.fetch', () => {
  it('Test 1: parses a realistic SSE body into N event objects preserving PascalCase keys', async () => {
    const txline = buildTxlineDouble();
    txline.requestText.mockResolvedValue(SSE_BODY);
    const client = new HistoricalClient(txline as unknown as TxlineHttpClient);

    const events = await client.fetch(18241006);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      FixtureId: 18241006,
      Action: 'safe_possession',
      Ts: 1783281625878,
      Seq: 23,
    });
    expect(events[1]).toEqual({
      FixtureId: 18241006,
      Action: 'comment',
      Ts: 1783281625999,
      Seq: 24,
    });
    expect(events[2]).toEqual({
      FixtureId: 18241006,
      Action: 'connected',
      Ts: 1783712000000,
      Seq: 25,
    });
  });

  it('Test 2: calls requestText with the fully-built absolute historical URL for the fixture id', async () => {
    const txline = buildTxlineDouble();
    txline.requestText.mockResolvedValue(SSE_BODY);
    const client = new HistoricalClient(txline as unknown as TxlineHttpClient);

    await client.fetch(18241006);

    expect(txline.requestText).toHaveBeenCalledWith(
      'https://txline.txodds.com/api/scores/historical/18241006',
    );
  });

  it('Test 3: caches the parsed result — a second fetch(sameFixtureId) does not call requestText again', async () => {
    const txline = buildTxlineDouble();
    txline.requestText.mockResolvedValue(SSE_BODY);
    const client = new HistoricalClient(txline as unknown as TxlineHttpClient);

    const first = await client.fetch(18241006);
    const second = await client.fetch(18241006);

    expect(txline.requestText).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('Test 4: a rejected requestText resolves to [] rather than throwing', async () => {
    const txline = buildTxlineDouble();
    txline.requestText.mockRejectedValue(new Error('network error'));
    const client = new HistoricalClient(txline as unknown as TxlineHttpClient);

    const events = await client.fetch(18241006);

    expect(events).toEqual([]);
  });

  it('Test 5: an invalid fixture id rethrows the fixtureId guard and never reaches the network', async () => {
    const txline = buildTxlineDouble();
    const client = new HistoricalClient(txline as unknown as TxlineHttpClient);

    await expect(client.fetch(0)).rejects.toThrow(/fixtureId/);
    await expect(client.fetch(-5)).rejects.toThrow(/fixtureId/);
    await expect(client.fetch(1.5)).rejects.toThrow(/fixtureId/);

    expect(txline.requestText).not.toHaveBeenCalled();
  });
});
