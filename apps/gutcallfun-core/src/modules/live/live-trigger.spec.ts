import { isAscendingAttackEdge, seedRungForStage } from './live-trigger';
import type { PossessionStage } from '../ingest/state/possession';

describe('isAscendingAttackEdge', () => {
  it('does not fire on first contact into safe (not attacking)', () => {
    expect(isAscendingAttackEdge(null, 'safe')).toBe(false);
  });

  it('fires on first-ever attack (LD-1: prior === null still triggers)', () => {
    expect(isAscendingAttackEdge(null, 'attack')).toBe(true);
  });

  it('fires on first-ever danger', () => {
    expect(isAscendingAttackEdge(null, 'danger')).toBe(true);
  });

  it('fires on first-ever high_danger', () => {
    expect(isAscendingAttackEdge(null, 'high_danger')).toBe(true);
  });

  it('fires on safe -> attack (old behaviour preserved)', () => {
    expect(isAscendingAttackEdge('safe', 'attack')).toBe(true);
  });

  it('fires on safe -> danger (NEW — previously false)', () => {
    expect(isAscendingAttackEdge('safe', 'danger')).toBe(true);
  });

  it('fires on safe -> high_danger (NEW)', () => {
    expect(isAscendingAttackEdge('safe', 'high_danger')).toBe(true);
  });

  it('fires on attack -> danger (NEW — the sustained-attack self-suppression case)', () => {
    expect(isAscendingAttackEdge('attack', 'danger')).toBe(true);
  });

  it('fires on danger -> high_danger (NEW)', () => {
    expect(isAscendingAttackEdge('danger', 'high_danger')).toBe(true);
  });

  it('does not fire on a flat repeat (attack -> attack)', () => {
    expect(isAscendingAttackEdge('attack', 'attack')).toBe(false);
  });

  it('does not fire on a flat repeat (danger -> danger)', () => {
    expect(isAscendingAttackEdge('danger', 'danger')).toBe(false);
  });

  it('does not fire on a descent (high_danger -> attack) — the fading-attack case', () => {
    expect(isAscendingAttackEdge('high_danger', 'attack')).toBe(false);
  });

  it('does not fire on a descent (high_danger -> danger)', () => {
    expect(isAscendingAttackEdge('high_danger', 'danger')).toBe(false);
  });

  it('does not fire when current is not attacking (danger -> safe)', () => {
    expect(isAscendingAttackEdge('danger', 'safe')).toBe(false);
  });

  it('treats an unknown prior string as below safe (defensive)', () => {
    expect(
      isAscendingAttackEdge('garbage' as unknown as PossessionStage as unknown as string, 'attack'),
    ).toBe(true);
  });
});

describe('seedRungForStage', () => {
  it('seeds fizzles for an attack-stage trigger', () => {
    expect(seedRungForStage('attack')).toBe('fizzles');
  });

  it('seeds danger for a danger-stage trigger', () => {
    expect(seedRungForStage('danger')).toBe('danger');
  });

  it('seeds danger for a high_danger-stage trigger', () => {
    expect(seedRungForStage('high_danger')).toBe('danger');
  });
});
