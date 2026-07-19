/**
 * HistoricalClient (Source A, D-01) — GET /api/scores/historical/{fixtureId}
 * via the shared TxlineHttpClient (Plan 04, INGST-01: Bearer JWT +
 * X-Api-Token, 401 refresh-once/retry-once), cached in-memory ONLY per
 * process (never persisted — D-01 explicit).
 *
 * This endpoint returns SSE-formatted text (`data: {...}` lines) despite
 * the OpenAPI spec declaring an `application/json` array response — the
 * client requests it in text mode (`TxlineHttpClient.requestText`) and
 * hands the raw string to `parseHistoricalResponse` untouched.
 *
 * Retention window is exactly 2 weeks to 6 hours in the past (RESEARCH
 * Pitfall 2) — a fixture outside that window returns an empty array here
 * (never throws past this boundary), letting ReplaySourceService fall back
 * to Source B.
 */

import { Injectable, Logger } from '@nestjs/common';
import { TxlineHttpClient } from '../fixtures/txline-http.client';
import { parseHistoricalResponse } from './replay';

const HISTORICAL_PATH_TEMPLATE = '/api/scores/historical/{fixtureId}';

@Injectable()
export class HistoricalClient {
  private readonly logger = new Logger(HistoricalClient.name);

  // In-memory per-process cache (D-01: "cached in-memory only") — a plain
  // Map is sufficient; this project's deployment shape is a single
  // long-lived process (no multi-instance cache coherency concern).
  private readonly cache = new Map<number, Record<string, unknown>[]>();

  constructor(private readonly txline: TxlineHttpClient) {}

  /**
   * Fetch (or return the cached copy of) the full historical update
   * sequence for `fixtureId`. Never throws: a retention-window miss, a
   * network error, or an unparseable body all resolve to `[]` so the
   * caller (ReplaySourceService) can fall back to Source B without special
   * error handling.
   */
  async fetch(fixtureId: number): Promise<Record<string, unknown>[]> {
    const cached = this.cache.get(fixtureId);
    if (cached !== undefined) {
      return cached;
    }

    let raw: unknown;
    try {
      // buildFixtureUrl validates fixtureId as a positive integer BEFORE
      // any interpolation/network call (Security Domain: query-string/path
      // tampering) and throws synchronously on an invalid id — that throw
      // is intentionally NOT caught here, it is a caller-programming-error
      // signal distinct from a legitimate "no historical data" outcome.
      const url = this.txline.buildFixtureUrl(HISTORICAL_PATH_TEMPLATE, fixtureId);
      raw = await this.txline.requestText(url);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('TxlineHttpClient: fixtureId')) {
        throw err;
      }
      // Retention-window miss (400/empty) or a transient network failure —
      // never fatal here; Source B (replay-source.service.ts) is the
      // designed fallback (RESEARCH Pitfall 2).
      this.logger.warn(
        `Historical fetch failed for fixture ${fixtureId} — falling back to Source B: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }

    const parsed = parseHistoricalResponse(raw);
    this.cache.set(fixtureId, parsed);
    return parsed;
  }
}
