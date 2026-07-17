import { MessageNormalizer, STALENESS_THRESHOLD_MS } from './message-normalizer';

function baseEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Action: 'shot',
    FixtureId: 14790158,
    Id: 900,
    Seq: 100,
    Ts: 1_718_033_066_851,
    Confirmed: true,
    Participant: 1,
    StatusId: 2,
    ...overrides,
  };
}

describe('MessageNormalizer.normalize', () => {
  const normalizer = new MessageNormalizer();

  it('normalizes a valid event: keys match GameEventEntity property names and receivedAt is absent', () => {
    const raw = baseEvent();
    const result = normalizer.normalize(raw);

    expect(result.ignorable).toBe(false);
    expect(result.event).not.toBeNull();
    expect(Object.keys(result.event!).sort()).toEqual(
      ['actionId', 'confirmed', 'feedTs', 'participant', 'payload', 'seq', 'statusId', 'type'].sort(),
    );
    expect(result.event).not.toHaveProperty('receivedAt');
    expect(result.event).not.toHaveProperty('gameId');

    expect(result.event!.type).toBe('shot');
    expect(result.event!.payload).toEqual(raw);
    expect(result.event!.actionId).toBe(900);
    expect(result.event!.seq).toBe(100);
    expect(result.event!.confirmed).toBe(true);
    expect(result.event!.participant).toBe(1);
    expect(result.event!.statusId).toBe(2);
    expect(result.event!.feedTs).toEqual(new Date(1_718_033_066_851));
  });

  it('handles the Fusion-style {Update: {...}} envelope via defensive inner-field read', () => {
    const inner = baseEvent();
    const wrapped = { FixtureInfo: { GameState: 'live' }, Update: inner };
    const result = normalizer.normalize(wrapped);

    expect(result.ignorable).toBe(false);
    expect(result.event!.type).toBe('shot');
    // payload is the FULL raw message, not just the inner Update object.
    expect(result.event!.payload).toEqual(wrapped);
  });

  it('returns a valid, non-throwing row for an unknown Action (store-and-ignore contract)', () => {
    const raw = baseEvent({ Action: 'some_future_unknown_action' });
    const result = normalizer.normalize(raw);

    expect(result.ignorable).toBe(false);
    expect(result.event!.type).toBe('some_future_unknown_action');
    expect(result.event!.payload).toEqual(raw);
  });

  it('returns a valid row for an open-set StatusId (e.g. 100, observed in the wild)', () => {
    const raw = baseEvent({ StatusId: 100 });
    const result = normalizer.normalize(raw);

    expect(result.ignorable).toBe(false);
    expect(result.event!.statusId).toBe(100);
  });

  it('classifies a malformed message (missing Seq) as ignorable without throwing', () => {
    const raw = { Action: 'shot', Ts: 1_718_033_066_851 };
    const result = normalizer.normalize(raw);

    expect(result.ignorable).toBe(true);
    expect(result.event).toBeNull();
  });

  it('classifies a malformed message (missing Ts) as ignorable without throwing', () => {
    const raw = { Action: 'shot', Seq: 1 };
    const result = normalizer.normalize(raw);

    expect(result.ignorable).toBe(true);
    expect(result.event).toBeNull();
  });

  it('classifies non-JSON-object input (null, undefined, array, string) as ignorable without throwing', () => {
    expect(normalizer.normalize(null).ignorable).toBe(true);
    expect(normalizer.normalize(undefined).ignorable).toBe(true);
    expect(normalizer.normalize([1, 2, 3]).ignorable).toBe(true);
    expect(normalizer.normalize('not json').ignorable).toBe(true);
  });

  it('never throws on hostile input (circular-safe: a Proxy that throws on property access)', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('hostile access');
        },
      },
    );
    expect(() => normalizer.normalize(hostile)).not.toThrow();
    expect(normalizer.normalize(hostile).ignorable).toBe(true);
  });
});

describe('MessageNormalizer.lazyFillPatch', () => {
  const normalizer = new MessageNormalizer();

  it('maps a jersey message (Participant 1) to team1JerseyColor', () => {
    const raw = baseEvent({ Action: 'jersey', Participant: 1, Data: { Color: 'red' } });
    expect(normalizer.lazyFillPatch(raw)).toEqual({ team1JerseyColor: 'red' });
  });

  it('maps a jersey message (Participant 2) to team2JerseyColor', () => {
    const raw = baseEvent({ Action: 'jersey', Participant: 2, Data: { Color: 'navyblue' } });
    expect(normalizer.lazyFillPatch(raw)).toEqual({ team2JerseyColor: 'navyblue' });
  });

  it('maps a status message to currentStatusId', () => {
    const raw = baseEvent({ Action: 'status', Data: { StatusId: 4, StatusName: 'H2' } });
    expect(normalizer.lazyFillPatch(raw)).toEqual({ currentStatusId: 4 });
  });

  it('maps a score_adjustment message to scoreP1/scoreP2 unconditionally (authoritative resync)', () => {
    const raw = baseEvent({
      Action: 'score_adjustment',
      Confirmed: undefined,
      Data: {
        Participant1: { Total: { Goals: 2 } },
        Participant2: { Total: { Goals: 1 } },
      },
      Score: {
        Participant1: { Total: { Goals: 2 } },
        Participant2: { Total: { Goals: 1 } },
      },
    });
    expect(normalizer.lazyFillPatch(raw)).toEqual({ scoreP1: 2, scoreP2: 1 });
  });

  it('maps a Confirmed:true goal message to scoreP1/scoreP2 (derived from the goal Score field)', () => {
    const raw = baseEvent({
      Action: 'goal',
      Confirmed: true,
      Participant: 1,
      Score: {
        Participant1: { Total: { Goals: 1 } },
        Participant2: { Total: { Goals: 0 } },
      },
    });
    expect(normalizer.lazyFillPatch(raw)).toEqual({ scoreP1: 1, scoreP2: 0 });
  });

  it('does NOT apply a score patch for a Confirmed:false goal message (avoid premature denormalization)', () => {
    const raw = baseEvent({
      Action: 'goal',
      Confirmed: false,
      Participant: 1,
      Score: {
        Participant1: { Total: { Goals: 1 } },
        Participant2: { Total: { Goals: 0 } },
      },
    });
    expect(normalizer.lazyFillPatch(raw)).toBeNull();
  });

  it('returns null for an Action with no lazy-fill mapping', () => {
    const raw = baseEvent({ Action: 'shot' });
    expect(normalizer.lazyFillPatch(raw)).toBeNull();
  });

  it('returns null (never throws) for malformed input', () => {
    expect(normalizer.lazyFillPatch(null)).toBeNull();
    expect(normalizer.lazyFillPatch({ Action: 'jersey', Data: null })).toBeNull();
  });
});

describe('MessageNormalizer.isStale', () => {
  const normalizer = new MessageNormalizer();

  it('returns false when transit is well within the threshold', () => {
    expect(normalizer.isStale(1000, 1140)).toBe(false);
  });

  it('returns true when transit exceeds STALENESS_THRESHOLD_MS', () => {
    expect(normalizer.isStale(1000, 1000 + STALENESS_THRESHOLD_MS + 1)).toBe(true);
  });
});
