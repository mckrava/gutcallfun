import { emitReplay, parseHistoricalResponse } from './replay';
import { ReplaySourceService } from './replay-source.service';
import { HistoricalClient } from './historical.client';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';

describe('emitReplay', () => {
  const FIXED_NOW = 1_800_000_000_000; // arbitrary fixed wall-clock reading

  it('rebases every event Ts by delta = now() - firstEvent.Ts (D-03)', async () => {
    const firstTs = 1_000_000;
    const events = [
      { Action: 'jersey', Ts: firstTs, Seq: 1 },
      { Action: 'status', Ts: firstTs + 5_000, Seq: 2 },
      { Action: 'goal', Ts: firstTs + 12_000, Seq: 3 },
    ];
    const emitted: Record<string, unknown>[] = [];
    const expectedDelta = FIXED_NOW - firstTs;

    await emitReplay({
      events,
      onEvent: (event) => {
        emitted.push(event);
      },
      sleepImpl: async () => {},
      now: () => FIXED_NOW,
    });

    expect(emitted).toHaveLength(3);
    expect(emitted[0].Ts).toBe(firstTs + expectedDelta);
    expect(emitted[1].Ts).toBe(firstTs + 5_000 + expectedDelta);
    expect(emitted[2].Ts).toBe(firstTs + 12_000 + expectedDelta);
    // Rebased Ts should land exactly on "now" for the first event.
    expect(emitted[0].Ts).toBe(FIXED_NOW);
  });

  it('does not mutate the caller-supplied event objects', async () => {
    const original = { Action: 'jersey', Ts: 1_000, Seq: 1 };
    const events = [original];

    await emitReplay({
      events,
      onEvent: () => {},
      sleepImpl: async () => {},
      now: () => FIXED_NOW,
    });

    expect(original.Ts).toBe(1_000);
  });

  it('scales inter-event delay by originalGap / speed (D-04)', async () => {
    const firstTs = 0;
    const events = [
      { Action: 'a', Ts: firstTs, Seq: 1 },
      { Action: 'b', Ts: firstTs + 10_000, Seq: 2 }, // 10s original gap
    ];
    const sleeps: number[] = [];

    await emitReplay({
      events,
      speed: 2,
      onEvent: () => {},
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      now: () => FIXED_NOW,
    });

    // 10s gap / speed=2 -> 5s sleep before the second event.
    expect(sleeps).toEqual([5_000]);
  });

  it('preserves original pacing at speed=1 (no scaling)', async () => {
    const events = [
      { Action: 'a', Ts: 0, Seq: 1 },
      { Action: 'b', Ts: 3_000, Seq: 2 },
    ];
    const sleeps: number[] = [];

    await emitReplay({
      events,
      onEvent: () => {},
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      now: () => FIXED_NOW,
    });

    expect(sleeps).toEqual([3_000]);
  });

  it('does NOT clamp a large pre-match gap to the reference repo default of 5000ms (D-04)', async () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const events = [
      { Action: 'pre-match-marker', Ts: 0, Seq: 1 },
      { Action: 'kickoff', Ts: twoHoursMs, Seq: 2 },
    ];
    const sleeps: number[] = [];

    await emitReplay({
      events,
      onEvent: () => {},
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      now: () => FIXED_NOW,
    });

    // Full original gap must be preserved, NOT clamped down to 5000ms.
    expect(sleeps).toEqual([twoHoursMs]);
    expect(sleeps[0]).toBeGreaterThan(5_000);
  });

  it('still honors an explicitly-passed maxGapMs (headless-testing override only, D-04)', async () => {
    const events = [
      { Action: 'a', Ts: 0, Seq: 1 },
      { Action: 'b', Ts: 100_000, Seq: 2 },
    ];
    const sleeps: number[] = [];

    await emitReplay({
      events,
      maxGapMs: 1_000,
      onEvent: () => {},
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      now: () => FIXED_NOW,
    });

    expect(sleeps).toEqual([1_000]);
  });

  it('rejects a non-positive speed synchronously, before emitting anything', async () => {
    const events = [{ Action: 'a', Ts: 0, Seq: 1 }];
    const onEvent = jest.fn();

    await expect(
      emitReplay({ events, speed: 0, onEvent, sleepImpl: async () => {} }),
    ).rejects.toThrow(/positive finite number/);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('resolves immediately for an empty event array', async () => {
    const onEvent = jest.fn();
    await emitReplay({ events: [], onEvent, sleepImpl: async () => {} });
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('parseHistoricalResponse', () => {
  it('passes an already-parsed array through as-is', () => {
    const arr = [{ Ts: 1 }, { Ts: 2 }];
    expect(parseHistoricalResponse(arr)).toBe(arr);
  });

  it('parses a JSON-array-shaped string', () => {
    expect(parseHistoricalResponse('[{"Ts":1},{"Ts":2}]')).toEqual([{ Ts: 1 }, { Ts: 2 }]);
  });

  it('parses SSE-format text, skipping malformed data: lines', () => {
    const sse = 'data: {"Ts":1}\ndata: not-json\ndata: {"Ts":2}\n';
    expect(parseHistoricalResponse(sse)).toEqual([{ Ts: 1 }, { Ts: 2 }]);
  });

  it('returns an empty array for an unrecognized shape', () => {
    expect(parseHistoricalResponse(42)).toEqual([]);
    expect(parseHistoricalResponse(null)).toEqual([]);
  });
});

describe('ReplaySourceService.load (D-01 A->B fallback)', () => {
  function build() {
    const historicalClient = { fetch: jest.fn() } as unknown as HistoricalClient;
    const gameEventRepo = { find: jest.fn() } as unknown as { find: jest.Mock };

    const service = new ReplaySourceService(
      historicalClient,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gameEventRepo as any,
    );

    return { service, historicalClient, gameEventRepo };
  }

  it('returns Source A (historical) directly when it is non-empty', async () => {
    const { service, historicalClient, gameEventRepo } = build();
    const historicalEvents = [{ Action: 'jersey', Ts: 1, Seq: 1 }];
    (historicalClient.fetch as jest.Mock).mockResolvedValue(historicalEvents);

    const game = { id: 7, fixtureId: 555 } as GameEntity;
    const result = await service.load(game);

    expect(result).toBe(historicalEvents);
    expect(historicalClient.fetch).toHaveBeenCalledWith(555);
    expect(gameEventRepo.find).not.toHaveBeenCalled();
  });

  it('falls back to Source B (own game_event rows) when Source A returns empty (Pitfall 2)', async () => {
    const { service, historicalClient, gameEventRepo } = build();
    (historicalClient.fetch as jest.Mock).mockResolvedValue([]);
    const ownRows = [
      { id: 'a', gameId: 7, seq: 1, payload: { Action: 'jersey', Ts: 1, Seq: 1 } },
      { id: 'b', gameId: 7, seq: 2, payload: { Action: 'status', Ts: 2, Seq: 2 } },
    ] as GameEventEntity[];
    gameEventRepo.find.mockResolvedValue(ownRows);

    const game = { id: 7, fixtureId: 555 } as GameEntity;
    const result = await service.load(game);

    expect(historicalClient.fetch).toHaveBeenCalledWith(555);
    expect(gameEventRepo.find).toHaveBeenCalledWith({
      where: { gameId: 7 },
      order: { seq: 'ASC' },
    });
    expect(result).toEqual([
      { Action: 'jersey', Ts: 1, Seq: 1 },
      { Action: 'status', Ts: 2, Seq: 2 },
    ]);
  });

  it('returns an empty array when both Source A and Source B (no capture, no rows) are empty', async () => {
    const { service, historicalClient, gameEventRepo } = build();
    (historicalClient.fetch as jest.Mock).mockResolvedValue([]);
    gameEventRepo.find.mockResolvedValue([]);

    const game = { id: 7, fixtureId: 555 } as GameEntity;
    const result = await service.load(game);

    expect(result).toEqual([]);
  });
});
