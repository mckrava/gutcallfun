import { WsTicketStore } from './ws-ticket.store';

const USER = '00000000-0000-4000-8000-000000000001';
const TTL = 60 * 1000;

describe('WsTicketStore', () => {
  let store: WsTicketStore;
  beforeEach(() => {
    store = new WsTicketStore();
  });

  it('issues a ticket that exchanges back to its user', () => {
    const { ticket, expiresAt } = store.issue(USER, TTL, 1_000);
    expect(expiresAt).toBe(1_000 + TTL);
    expect(store.consume(ticket, 2_000)).toBe(USER);
  });

  it('is single-use (a replayed ticket is rejected)', () => {
    const { ticket } = store.issue(USER, TTL, 1_000);
    expect(store.consume(ticket, 2_000)).toBe(USER);
    expect(store.consume(ticket, 2_000)).toBeNull();
  });

  it('rejects an expired ticket', () => {
    const { ticket } = store.issue(USER, TTL, 1_000);
    expect(store.consume(ticket, 1_000 + TTL + 1)).toBeNull();
  });

  it('returns null for an unknown ticket', () => {
    expect(store.consume('nope')).toBeNull();
  });
});
