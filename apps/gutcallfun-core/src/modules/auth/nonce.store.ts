import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/**
 * One issued sign-in challenge, held in memory until it is consumed or expires.
 * `message` is the exact byte-for-byte text the wallet must sign — the server
 * authors it so verification never has to trust a client-reconstructed string.
 */
export interface NonceRecord {
  walletAddress: string;
  message: string;
  issuedAt: number;
  expiresAt: number;
}

/** A freshly issued challenge: the record plus the opaque nonce handle. */
export interface IssuedNonce extends NonceRecord {
  nonce: string;
}

/**
 * In-memory, single-use nonce store (AUTH-01). Justified by the single-process
 * deployment (PROJECT.md: no horizontal scaling) — a restart simply invalidates
 * outstanding challenges, which is safe. Not shared across processes.
 *
 * `now` is injectable on every method purely so tests can drive expiry
 * deterministically; production callers use the Date.now() default.
 */
@Injectable()
export class NonceStore {
  private readonly records = new Map<string, NonceRecord>();

  /**
   * Mint a nonce and store the exact message to be signed. The nonce is part of
   * that message, so the caller supplies a builder that receives the freshly
   * generated nonce + timestamps and returns the byte-exact text.
   */
  issue(
    walletAddress: string,
    buildMessage: (ctx: {
      nonce: string;
      issuedAt: number;
      expiresAt: number;
    }) => string,
    ttlMs: number,
    now: number = Date.now(),
  ): IssuedNonce {
    this.prune(now);
    const nonce = randomBytes(24).toString('base64url');
    const expiresAt = now + ttlMs;
    const message = buildMessage({ nonce, issuedAt: now, expiresAt });
    const record: NonceRecord = {
      walletAddress,
      message,
      issuedAt: now,
      expiresAt,
    };
    this.records.set(nonce, record);
    return { nonce, ...record };
  }

  /**
   * Look up a nonce and atomically remove it (single-use). Returns the record
   * only when it exists, has not expired, and belongs to the given wallet;
   * every rejecting path deletes the nonce so it can never be retried.
   */
  consume(
    nonce: string,
    walletAddress: string,
    now: number = Date.now(),
  ): NonceRecord | null {
    const record = this.records.get(nonce);
    if (!record) return null;
    this.records.delete(nonce); // single-use: gone whether or not it validates
    if (record.expiresAt <= now) return null;
    if (record.walletAddress !== walletAddress) return null;
    return record;
  }

  /** Drop expired entries so the map can't grow without bound. */
  private prune(now: number): void {
    for (const [nonce, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(nonce);
    }
  }
}
