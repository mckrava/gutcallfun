import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

interface TicketRecord {
  userId: string;
  expiresAt: number;
}

/** A freshly issued socket ticket and when it expires (ms epoch). */
export interface IssuedWsTicket {
  ticket: string;
  expiresAt: number;
}

/**
 * In-memory, single-use WebSocket handshake tickets (BFF pattern). The JWT
 * never reaches the browser: the Next.js server mints a ticket on the user's
 * behalf, the browser hands it to socket.io's `auth.ticket`, and the gateway
 * exchanges it for a user id exactly once at connection time. Short-lived and
 * single-use, so interception is near-worthless. In-memory per the single
 * long-lived process (lost on restart, which just forces a reconnect).
 *
 * `now` is injectable per call for deterministic expiry tests.
 */
@Injectable()
export class WsTicketStore {
  private readonly tickets = new Map<string, TicketRecord>();

  issue(
    userId: string,
    ttlMs: number,
    now: number = Date.now(),
  ): IssuedWsTicket {
    this.prune(now);
    const ticket = randomBytes(24).toString('base64url');
    const expiresAt = now + ttlMs;
    this.tickets.set(ticket, { userId, expiresAt });
    return { ticket, expiresAt };
  }

  /**
   * Exchange a ticket for its user id, removing it (single-use). Returns null
   * when unknown or expired; every rejecting path still deletes it.
   */
  consume(ticket: string, now: number = Date.now()): string | null {
    const record = this.tickets.get(ticket);
    if (!record) return null;
    this.tickets.delete(ticket);
    if (record.expiresAt <= now) return null;
    return record.userId;
  }

  private prune(now: number): void {
    for (const [ticket, record] of this.tickets) {
      if (record.expiresAt <= now) this.tickets.delete(ticket);
    }
  }
}
