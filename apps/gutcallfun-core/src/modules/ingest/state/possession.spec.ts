import {
  classifyPossession,
  nextPossessionStage,
  createAttackStore,
  ATTACK_GAP_MS,
  INITIAL_STAGE,
} from './possession';

function stagedMessage(
  action: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    Action: action,
    FixtureId: 14790158,
    Participant: 1,
    Ts: 1_718_033_066_851,
    Seq: 100,
    Id: 900,
    ...overrides,
  };
}

describe('classifyPossession', () => {
  it('classifies safe_possession, attack_possession, danger_possession, high_danger_possession to distinct stages', () => {
    expect(classifyPossession(stagedMessage('safe_possession'))?.stage).toBe('safe');
    expect(classifyPossession(stagedMessage('attack_possession'))?.stage).toBe('attack');
    expect(classifyPossession(stagedMessage('danger_possession'))?.stage).toBe('danger');
    expect(classifyPossession(stagedMessage('high_danger_possession'))?.stage).toBe(
      'high_danger',
    );

    const stages = new Set([
      classifyPossession(stagedMessage('safe_possession'))?.stage,
      classifyPossession(stagedMessage('attack_possession'))?.stage,
      classifyPossession(stagedMessage('danger_possession'))?.stage,
      classifyPossession(stagedMessage('high_danger_possession'))?.stage,
    ]);
    expect(stages.size).toBe(4);
  });

  it('does not classify a bare "possession" ball-holder-change marker as a danger stage', () => {
    // Real capture: Action:"possession", no PossessionType field at all.
    const marker = { Action: 'possession', Possession: 2, FixtureId: 14790158, Ts: 1, Seq: 1 };
    expect(classifyPossession(marker)).toBeNull();
  });

  it('never substring-matches "possession" (e.g. an unrelated action containing the word)', () => {
    expect(classifyPossession(stagedMessage('possession_something_else'))).toBeNull();
  });

  it('handles the Fusion-style {Update: {...}} envelope via defensive inner-field read', () => {
    const wrapped = { Update: stagedMessage('attack_possession') };
    expect(classifyPossession(wrapped)?.stage).toBe('attack');
  });

  it('never throws on malformed/hostile input and returns null', () => {
    expect(classifyPossession(null as unknown as Record<string, unknown>)).toBeNull();
    expect(classifyPossession(undefined as unknown as Record<string, unknown>)).toBeNull();
    expect(classifyPossession([] as unknown as Record<string, unknown>)).toBeNull();
    expect(classifyPossession({} as Record<string, unknown>)).toBeNull();
    expect(classifyPossession({ Action: 123 } as unknown as Record<string, unknown>)).toBeNull();
  });
});

describe('nextPossessionStage', () => {
  it('returns a defined initial stage for the first event ever seen (no crash/undefined)', () => {
    const stage = nextPossessionStage(null, { Action: 'possession', Possession: 1 });
    expect(stage).toBe(INITIAL_STAGE);
    expect(stage).toBeDefined();
  });

  it('advances the ladder on a staged action', () => {
    expect(nextPossessionStage('safe', stagedMessage('attack_possession'))).toBe('attack');
    expect(nextPossessionStage('attack', stagedMessage('high_danger_possession'))).toBe(
      'high_danger',
    );
  });

  it('leaves the stage unchanged on a bare possession marker (not a ladder step)', () => {
    const marker = { Action: 'possession', Possession: 2 };
    expect(nextPossessionStage('danger', marker)).toBe('danger');
    expect(nextPossessionStage('high_danger', marker)).toBe('high_danger');
  });

  it('self-heals from a single out-of-order/post-gap staged message without prior history', () => {
    // Simulates recovering state after a restart/reconnect gap: a fresh
    // high_danger_possession message alone reconstructs a consistent stage.
    const stage = nextPossessionStage(null, stagedMessage('high_danger_possession'));
    expect(stage).toBe('high_danger');
  });
});

describe('createAttackStore (feed-Ts attack-run segmentation)', () => {
  it('starts a new attack run on the first high_danger signal', () => {
    const store = createAttackStore();
    const signal = classifyPossession(stagedMessage('high_danger_possession', { Ts: 1000 }))!;
    const trigger = store.ingest(signal);

    expect(trigger).not.toBeNull();
    expect(trigger?.possessionStage).toBe('high_danger');
    expect(store.mostRecentTrigger()).toEqual(trigger);
  });

  it('collapses a second high_danger signal within ATTACK_GAP_MS (feed Ts) into the same run', () => {
    const store = createAttackStore();
    const first = classifyPossession(stagedMessage('high_danger_possession', { Ts: 1000 }))!;
    const collapsed = classifyPossession(
      stagedMessage('high_danger_possession', { Ts: 1000 + ATTACK_GAP_MS - 1 }),
    )!;

    const firstTrigger = store.ingest(first);
    const secondResult = store.ingest(collapsed);

    expect(firstTrigger).not.toBeNull();
    expect(secondResult).toBeNull(); // collapsed into the existing run
    expect(store.mostRecentTrigger()).toEqual(firstTrigger);
  });

  it('a safe_possession between two high_danger signals does not reset the run (only the feed-Ts gap does)', () => {
    const store = createAttackStore();
    const first = classifyPossession(stagedMessage('high_danger_possession', { Ts: 1000 }))!;
    const between = classifyPossession(stagedMessage('safe_possession', { Ts: 2000 }))!;
    const collapsed = classifyPossession(stagedMessage('high_danger_possession', { Ts: 4000 }))!;

    const firstTrigger = store.ingest(first);
    store.ingest(between);
    const secondResult = store.ingest(collapsed);

    expect(firstTrigger).not.toBeNull();
    expect(secondResult).toBeNull();
    expect(store.mostRecentTrigger()).toEqual(firstTrigger);
  });

  it('starts a fresh run once the feed-Ts gap exceeds ATTACK_GAP_MS', () => {
    const store = createAttackStore();
    const first = classifyPossession(stagedMessage('high_danger_possession', { Ts: 1000 }))!;
    const expired = classifyPossession(
      stagedMessage('high_danger_possession', { Ts: 1000 + ATTACK_GAP_MS + 1 }),
    )!;

    const firstTrigger = store.ingest(first);
    const freshTrigger = store.ingest(expired);

    expect(firstTrigger).not.toBeNull();
    expect(freshTrigger).not.toBeNull();
    expect(freshTrigger).not.toEqual(firstTrigger);
    expect(store.mostRecentTrigger()).toEqual(freshTrigger);
  });
});
