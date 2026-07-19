/**
 * RCVR-01 vs RCVR-02 GameState equivalence (Phase 2 UAT backstop #4).
 *
 * WHY THIS TEST EXISTS — it is a DIVERGENCE GUARD, not a behavior test.
 *
 * Two independent code paths reconstruct a game's in-memory state:
 *   - RCVR-01 (boot rebuild): GameStateRebuildService.rebuildOne() reads the
 *     append-only log (`order: { seq: 'ASC' }`) and calls
 *     GameStateMachine.applyEvent(state, row.payload) for each row.
 *   - RCVR-02 (resumed stream): after a reconnect, EventIngestService applies
 *     each freshly-persisted message through the SAME applyEvent().
 *
 * Today both converge on one function, so equivalence holds by construction.
 * That is exactly why it is worth pinning: if someone later makes one path
 * preprocess, filter, or reorder differently, the two paths would silently
 * diverge and a recovered game would drift from a live one. This test fails
 * loudly the moment that happens.
 *
 * Note the two paths use SEPARATE GameStateMachine instances. The machine
 * holds per-game attack/goal stores keyed by gameId, so sharing one instance
 * would let path A's stores contaminate path B and mask a real difference.
 * Separate instances also truthfully model two separate process boots.
 */
import { GameStateMachine } from '../state/game-state.machine';
import { GameStateRegistry } from '../state/game-state.registry';
import type { GameState } from '../state/game-state.types';

const GAME_ID = 4242;
const FIXTURE_ID = 18241006;
const CONNECTION_ID = 901;

/** One fixed, realistic PascalCase TxLINE sequence with monotonic Ts and Seq. */
const MESSAGES: Record<string, unknown>[] = [
  { Action: 'status', StatusId: 1, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_600_000, Seq: 10 },
  { Action: 'status', StatusId: 2, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_610_000, Seq: 11 },
  { Action: 'safe_possession', Possession: 1, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_620_000, Seq: 12 },
  { Action: 'attack_possession', Possession: 1, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_630_000, Seq: 13 },
  { Action: 'danger_possession', Possession: 1, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_640_000, Seq: 14 },
  { Action: 'high_danger_possession', Possession: 1, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_650_000, Seq: 15 },
  { Action: 'shot', FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_655_000, Seq: 16 },
  // Unconfirmed -> confirmed goal for participant 2 (real feed emits both).
  { Action: 'goal', Id: 508, Participant: 2, Confirmed: false, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_660_000, Seq: 17 },
  { Action: 'goal', Id: 508, Participant: 2, Confirmed: true, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_666_000, Seq: 18 },
  { Action: 'clock_adjustment', FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_670_000, Seq: 19 },
  { Action: 'safe_possession', Possession: 2, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_680_000, Seq: 20 },
  { Action: 'status', StatusId: 4, FixtureId: FIXTURE_ID, ConnectionId: CONNECTION_ID, Ts: 1_783_281_690_000, Seq: 21 },
];

/** RCVR-01: mirror GameStateRebuildService.rebuildOne() — rows sorted by seq ASC, apply row.payload. */
function rebuildFromPersistedLog(rows: { seq: number; payload: Record<string, unknown> }[]): GameState {
  const registry = new GameStateRegistry();
  const machine = new GameStateMachine();
  const state = registry.getOrCreate(GAME_ID);
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    machine.applyEvent(state, row.payload);
  }
  return state;
}

/** RCVR-02: mirror EventIngestService — apply each message in arrival order after persist. */
function rebuildFromResumedStream(messages: Record<string, unknown>[]): GameState {
  const registry = new GameStateRegistry();
  const machine = new GameStateMachine();
  const state = registry.getOrCreate(GAME_ID);
  for (const raw of messages) {
    machine.applyEvent(state, raw);
  }
  return state;
}

describe('RCVR-01 vs RCVR-02 GameState equivalence (UAT backstop #4)', () => {
  // Persisted rows deliberately SHUFFLED: the DB may return them in any order,
  // and rebuildOne()'s `order: { seq: 'ASC' }` is what guarantees correctness.
  // Sorting must reproduce arrival-order state exactly.
  const shuffledRows = [...MESSAGES]
    .map((payload) => ({ seq: payload.Seq as number, payload }))
    .reverse();

  it('produces byte-identical GameState from the persisted log and from a resumed stream', () => {
    const fromLog = rebuildFromPersistedLog(shuffledRows);
    const fromStream = rebuildFromResumedStream(MESSAGES);

    expect(fromLog).toEqual(fromStream);
  });

  it('agrees on every field the UAT names (score, possession stage, attack run, lastSeq, connectionId)', () => {
    const fromLog = rebuildFromPersistedLog(shuffledRows);
    const fromStream = rebuildFromResumedStream(MESSAGES);

    // Explicit per-field assertions so adding a GameState field later cannot
    // silently weaken this guard to a vacuous comparison.
    expect(fromLog.score1).toBe(fromStream.score1);
    expect(fromLog.score2).toBe(fromStream.score2);
    expect(fromLog.possessionStage).toBe(fromStream.possessionStage);
    expect(fromLog.attackRunActive).toBe(fromStream.attackRunActive);
    expect(fromLog.attackRunHighWaterStage).toBe(fromStream.attackRunHighWaterStage);
    expect(fromLog.lastSeq).toBe(fromStream.lastSeq);
    expect(fromLog.connectionId).toBe(fromStream.connectionId);
  });

  it('actually advanced state (guards against two identically-empty states passing vacuously)', () => {
    const fromLog = rebuildFromPersistedLog(shuffledRows);

    // The confirmed goal for participant 2 must have been derived.
    expect(fromLog.score2).toBe(1);
    expect(fromLog.score1).toBe(0);
    // Last message is the StatusId:4 status change at Seq 21.
    expect(fromLog.currentStatusId).toBe(4);
    expect(fromLog.lastSeq).toBe(21);
    expect(fromLog.connectionId).toBe(String(CONNECTION_ID));
    expect(fromLog.lastFeedTs).toBe(1_783_281_690_000);
  });
});
