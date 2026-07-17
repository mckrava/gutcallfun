import { classifyGoalEvent, createGoalStore } from './goals';

function goalMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Action: 'goal',
    Id: 508,
    FixtureId: 14790158,
    Participant: 1,
    Confirmed: false,
    Ts: 1_783_051_552_644,
    Seq: 540,
    ...overrides,
  };
}

function amendMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Action: 'action_amend',
    Id: 999,
    FixtureId: 14790158,
    Participant: 1,
    Data: { Action: 'goal', Id: 508, New: { PlayerId: 42 } },
    Ts: 1_783_051_700_000,
    Seq: 545,
    ...overrides,
  };
}

function discardMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Action: 'action_discarded',
    Id: 508,
    FixtureId: 14790158,
    Ts: 1_783_051_800_000,
    Seq: 546,
    ...overrides,
  };
}

describe('classifyGoalEvent', () => {
  it('classifies a goal message', () => {
    const signal = classifyGoalEvent(goalMessage());
    expect(signal).toEqual({
      action: 'goal',
      id: 508,
      confirmed: false,
      participant: 1,
      ts: 1_783_051_552_644,
      seq: 540,
      fixtureId: 14790158,
    });
  });

  it('classifies an action_amend targeting a goal action via Data.Id', () => {
    const signal = classifyGoalEvent(amendMessage());
    expect(signal?.action).toBe('action_amend');
    expect(signal?.id).toBe(508);
  });

  it('ignores an action_amend that does not target a goal action', () => {
    const nonGoalAmend = amendMessage({ Data: { Action: 'yellow_card', Id: 700 } });
    expect(classifyGoalEvent(nonGoalAmend)).toBeNull();
  });

  it('classifies an action_discarded via its top-level Id (the discarded action id, reused not fresh)', () => {
    const signal = classifyGoalEvent(discardMessage());
    expect(signal?.action).toBe('action_discarded');
    expect(signal?.id).toBe(508);
  });

  it('returns null for unrelated actions', () => {
    expect(classifyGoalEvent({ Action: 'shot', Id: 1, Ts: 1, Seq: 1 })).toBeNull();
  });

  it('never throws on malformed/hostile input and returns null', () => {
    expect(classifyGoalEvent(null as unknown as Record<string, unknown>)).toBeNull();
    expect(classifyGoalEvent(undefined as unknown as Record<string, unknown>)).toBeNull();
    expect(classifyGoalEvent([] as unknown as Record<string, unknown>)).toBeNull();
    expect(classifyGoalEvent({ Action: 'goal', Id: 'not-a-number' } as unknown as Record<string, unknown>)).toBeNull();
    expect(
      classifyGoalEvent({ Action: 'action_discarded', Id: 'not-a-number' } as unknown as Record<string, unknown>),
    ).toBeNull();
  });
});

describe('createGoalStore', () => {
  it('counts Confirmed:false then Confirmed:true on one Id as a single goal (no double count)', () => {
    const store = createGoalStore();

    const unconfirmed = classifyGoalEvent(goalMessage({ Confirmed: false }))!;
    store.ingest(unconfirmed);
    expect(store.deriveScore()).toEqual({ participant1: 0, participant2: 0 });

    // ~76s later, same Id, now confirmed.
    const confirmed = classifyGoalEvent(
      goalMessage({ Confirmed: true, Ts: 1_783_051_629_091, Seq: 541 }),
    )!;
    store.ingest(confirmed);
    expect(store.deriveScore()).toEqual({ participant1: 1, participant2: 0 });

    // A redundant duplicate confirmed re-delivery (Last-Event-ID resume) must
    // never double-count.
    store.ingest(confirmed);
    expect(store.deriveScore()).toEqual({ participant1: 1, participant2: 0 });
  });

  it('preserves the anchor (earliest Ts/Seq) after a later confirmation, never overwriting it', () => {
    const store = createGoalStore();
    store.ingest(classifyGoalEvent(goalMessage({ Confirmed: false }))!);
    const aggregate = store.ingest(
      classifyGoalEvent(goalMessage({ Confirmed: true, Ts: 1_783_051_629_091, Seq: 541 }))!,
    );

    expect(aggregate.anchorTs).toBe(1_783_051_552_644);
    expect(aggregate.anchorSeq).toBe(540);
  });

  it('reverses a previously-counted goal on action_discarded', () => {
    const store = createGoalStore();
    store.ingest(classifyGoalEvent(goalMessage({ Confirmed: false }))!);
    store.ingest(classifyGoalEvent(goalMessage({ Confirmed: true, Seq: 541 }))!);
    expect(store.deriveScore()).toEqual({ participant1: 1, participant2: 0 });

    store.ingest(classifyGoalEvent(discardMessage())!);
    expect(store.deriveScore()).toEqual({ participant1: 0, participant2: 0 });
  });

  it('a discard of a never-confirmed goal simply prevents it from ever counting', () => {
    const store = createGoalStore();
    store.ingest(classifyGoalEvent(goalMessage({ Confirmed: false, Id: 900, Seq: 700 }))!);
    store.ingest(classifyGoalEvent(discardMessage({ Id: 900, Seq: 701 }))!);
    expect(store.deriveScore()).toEqual({ participant1: 0, participant2: 0 });
  });

  it('an action_amend does not change the derived score', () => {
    const store = createGoalStore();
    store.ingest(classifyGoalEvent(goalMessage({ Confirmed: false }))!);
    store.ingest(classifyGoalEvent(goalMessage({ Confirmed: true, Seq: 541 }))!);
    store.ingest(classifyGoalEvent(amendMessage())!);
    expect(store.deriveScore()).toEqual({ participant1: 1, participant2: 0 });
  });

  it('replays a multi-goal sample sequence and matches the terminal Score field, with confirm/discard/amend churn', () => {
    // Simulated sequence for a 1-0 final: participant1 scores a genuine
    // confirmed goal (Id 508); participant2's apparent goal (Id 512) is
    // unconfirmed then discarded (VAR overturn) and must never count; an
    // action_amend on the confirmed goal (PlayerId correction) must not
    // affect the score.
    const sequence: Record<string, unknown>[] = [
      goalMessage({ Id: 508, Participant: 1, Confirmed: false, Ts: 100, Seq: 1 }),
      goalMessage({ Id: 512, Participant: 2, Confirmed: false, Ts: 200, Seq: 2 }),
      goalMessage({ Id: 508, Participant: 1, Confirmed: true, Ts: 176_100, Seq: 3 }),
      discardMessage({ Id: 512, Ts: 176_200, Seq: 4 }),
      amendMessage({ Id: 999, Data: { Action: 'goal', Id: 508 }, Ts: 176_300, Seq: 5 }),
    ];

    const store = createGoalStore();
    for (const raw of sequence) {
      const signal = classifyGoalEvent(raw);
      if (signal !== null) store.ingest(signal);
    }

    const derived = store.deriveScore();
    // Terminal Score field from the sequence's final message (message-reference.md
    // Score.Participant{1,2}.Total.Goals shape): {Participant1:{Total:{Goals:1}},
    // Participant2:{Total:{Goals:0}}}.
    const terminalScore = { participant1: 1, participant2: 0 };

    expect(derived).toEqual(terminalScore);
    expect(Number.isInteger(derived.participant1)).toBe(true);
    expect(Number.isInteger(derived.participant2)).toBe(true);
  });
});
