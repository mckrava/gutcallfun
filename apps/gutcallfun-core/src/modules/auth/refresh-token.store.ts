import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

interface RefreshRecord {
  userId: string;
  expiresAt: number;
}

/** A newly minted refresh token and when it expires (ms epoch). */
export interface IssuedRefresh {
  token: string;
  expiresAt: number;
}

/**
 * In-memory refresh-token store (opaque tokens, not JWTs). Rotating and
 * revocable, which a stateless JWT could not be. Keyed by the SHA-256 of the
 * token so the raw secret is never held in memory. Lost on restart by design
 * (decided with the user) — acceptable for the demo; clients simply re-sign.
 *
 * `now` is injectable per call for deterministic expiry tests.
 */
@Injectable()
export class RefreshTokenStore {
  private readonly records = new Map<string, RefreshRecord>();

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  issue(
    userId: string,
    ttlMs: number,
    now: number = Date.now(),
  ): IssuedRefresh {
    this.prune(now);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + ttlMs;
    this.records.set(RefreshTokenStore.hash(token), { userId, expiresAt });
    return { token, expiresAt };
  }

  /** Resolve a token to its user id, or null if unknown/expired. */
  resolve(token: string, now: number = Date.now()): string | null {
    const record = this.records.get(RefreshTokenStore.hash(token));
    if (!record) return null;
    if (record.expiresAt <= now) {
      this.records.delete(RefreshTokenStore.hash(token));
      return null;
    }
    return record.userId;
  }

  /**
   * Rotate: consume `oldToken` and, if it was valid, mint a fresh one for the
   * same user. Returns null when the old token is unknown/expired — the caller
   * treats that as a failed refresh. A used token is always invalidated.
   */
  rotate(
    oldToken: string,
    ttlMs: number,
    now: number = Date.now(),
  ): IssuedRefresh | null {
    const userId = this.resolve(oldToken, now);
    this.records.delete(RefreshTokenStore.hash(oldToken));
    if (!userId) return null;
    return this.issue(userId, ttlMs, now);
  }

  /** Revoke a single token (logout). No-op if it is already gone. */
  revoke(token: string): void {
    this.records.delete(RefreshTokenStore.hash(token));
  }

  private prune(now: number): void {
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(key);
    }
  }
}
