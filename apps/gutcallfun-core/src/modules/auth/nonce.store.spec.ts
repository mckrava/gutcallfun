import { NonceStore } from './nonce.store';

const WALLET = 'CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq';
const TTL = 5 * 60 * 1000;

describe('NonceStore', () => {
  let store: NonceStore;
  beforeEach(() => {
    store = new NonceStore();
  });

  // Builder that embeds the generated nonce, mirroring how AuthService uses it.
  const msg = (label: string) => (ctx: { nonce: string }) =>
    `${label}:${ctx.nonce}`;

  it('issues a unique nonce carrying the wallet, message and expiry', () => {
    const a = store.issue(WALLET, msg('msg-a'), TTL, 1_000);
    const b = store.issue(WALLET, msg('msg-b'), TTL, 1_000);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.walletAddress).toBe(WALLET);
    expect(a.message).toBe(`msg-a:${a.nonce}`);
    expect(a.expiresAt).toBe(1_000 + TTL);
  });

  it('consumes a valid nonce once and returns its record', () => {
    const issued = store.issue(WALLET, msg('msg'), TTL, 1_000);
    const record = store.consume(issued.nonce, WALLET, 2_000);
    expect(record).not.toBeNull();
    expect(record?.message).toBe(issued.message);
  });

  it('rejects a replayed nonce (single-use)', () => {
    const { nonce } = store.issue(WALLET, msg('msg'), TTL, 1_000);
    expect(store.consume(nonce, WALLET, 2_000)).not.toBeNull();
    expect(store.consume(nonce, WALLET, 2_000)).toBeNull();
  });

  it('rejects an expired nonce and does not leave it consumable', () => {
    const { nonce } = store.issue(WALLET, msg('msg'), TTL, 1_000);
    const afterExpiry = 1_000 + TTL + 1;
    expect(store.consume(nonce, WALLET, afterExpiry)).toBeNull();
    // even rolling the clock back, the expired attempt already removed it
    expect(store.consume(nonce, WALLET, 2_000)).toBeNull();
  });

  it('rejects a nonce presented for a different wallet', () => {
    const { nonce } = store.issue(WALLET, msg('msg'), TTL, 1_000);
    expect(
      store.consume(
        nonce,
        'SomeOtherWalletAddress1111111111111111111111',
        2_000,
      ),
    ).toBeNull();
  });

  it('returns null for an unknown nonce', () => {
    expect(store.consume('does-not-exist', WALLET)).toBeNull();
  });
});
