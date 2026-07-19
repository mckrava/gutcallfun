import { RefreshTokenStore } from './refresh-token.store';

const USER = '00000000-0000-4000-8000-000000000001';
const TTL = 30 * 24 * 60 * 60 * 1000;

describe('RefreshTokenStore', () => {
  let store: RefreshTokenStore;
  beforeEach(() => {
    store = new RefreshTokenStore();
  });

  it('issues an opaque token that resolves back to its user', () => {
    const { token, expiresAt } = store.issue(USER, TTL, 1_000);
    expect(typeof token).toBe('string');
    expect(expiresAt).toBe(1_000 + TTL);
    expect(store.resolve(token, 2_000)).toBe(USER);
  });

  it('does not resolve an expired token', () => {
    const { token } = store.issue(USER, TTL, 1_000);
    expect(store.resolve(token, 1_000 + TTL + 1)).toBeNull();
  });

  it('rotate() invalidates the old token and mints a new one for the same user', () => {
    const first = store.issue(USER, TTL, 1_000);
    const second = store.rotate(first.token, TTL, 2_000);
    expect(second).not.toBeNull();
    expect(second!.token).not.toBe(first.token);
    expect(store.resolve(first.token, 2_000)).toBeNull(); // old is dead
    expect(store.resolve(second!.token, 2_000)).toBe(USER); // new is live
  });

  it('rotate() returns null and consumes an unknown/expired token', () => {
    expect(store.rotate('unknown-token', TTL, 2_000)).toBeNull();
    const { token } = store.issue(USER, TTL, 1_000);
    expect(store.rotate(token, TTL, 1_000 + TTL + 1)).toBeNull();
  });

  it('revoke() makes a token unusable (logout)', () => {
    const { token } = store.issue(USER, TTL, 1_000);
    store.revoke(token);
    expect(store.resolve(token, 2_000)).toBeNull();
  });
});
