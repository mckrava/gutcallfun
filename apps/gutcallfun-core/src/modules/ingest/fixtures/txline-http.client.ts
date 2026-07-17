import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// TxLINE Solana-gated public origin (txodds-api SKILL.md Quick reference).
const TXLINE_ORIGIN = 'https://txline.txodds.com';
const GUEST_JWT_REFRESH_PATH = '/auth/guest/start';

// RESEARCH Security: 401 retry storm — surfaced when a refresh-and-retry
// still fails. Never retried a third time; caller must treat this as fatal
// for the current credentials (never log the credential values themselves).
export class TxlineAuthExpiredError extends Error {
  constructor(message = 'TxLINE auth expired: guest JWT refresh + retry both failed') {
    super(message);
    this.name = 'TxlineAuthExpiredError';
  }
}

interface GuestJwtStartResponse {
  token?: string;
  jwt?: string;
}

// Shared authenticated TxLINE HTTP client (INGST-01). Reused by fixtures
// (this plan), the SSE client (Plan 05), and the historical client (Plan
// 06) — the Bearer JWT + X-Api-Token headers and the 401 refresh-once/
// retry-once discipline live here exactly once.
@Injectable()
export class TxlineHttpClient {
  private readonly logger = new Logger(TxlineHttpClient.name);
  private guestJwt: string;
  private readonly apiToken: string;

  constructor(private readonly config: ConfigService) {
    this.guestJwt = this.config.get<string>('TXLINE_GUEST_JWT')!;
    this.apiToken = this.config.get<string>('TXLINE_API_TOKEN')!;
  }

  // Validates fixtureId (or any id interpolated into a TxLINE URL) as a
  // positive integer BEFORE interpolation (RESEARCH Security: query-string/
  // path tampering). Throws synchronously — never reaches the network.
  buildFixtureUrl(pathTemplate: string, fixtureId: number): string {
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      throw new Error(
        `TxlineHttpClient: fixtureId must be a positive integer, got: ${String(fixtureId)}`,
      );
    }
    const path = pathTemplate.replace('{fixtureId}', String(fixtureId));
    return path.startsWith('http') ? path : `${TXLINE_ORIGIN}${path}`;
  }

  // Authenticated request wrapper. Attaches Authorization: Bearer <jwt> and
  // X-Api-Token: <token> on every call. On a 401, refreshes the guest JWT
  // ONCE and retries the original request ONCE — a second consecutive 401
  // is never retried again (no loop against a dead JWT).
  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.doRequest<T>(path, init, false);
  }

  // Current in-memory credentials (INGST-01). Reused by the SSE stream
  // client (Plan 05), which needs the raw jwt/apiToken values to build its
  // own long-lived streaming fetch() call — request()/doRequest() cannot be
  // reused there because it always awaits response.json(), which would
  // buffer the SSE body forever instead of exposing a ReadableStream.
  // Never logs the returned values (INGST-01 security requirement).
  getCredentials(): { jwt: string; apiToken: string } {
    return { jwt: this.guestJwt, apiToken: this.apiToken };
  }

  // Public one-time re-auth entry point for long-lived stream consumers
  // (Plan 05's StreamManagerService) that observe an AUTH_EXPIRED signal
  // outside the request()/doRequest() 401 path. Delegates to the exact same
  // refresh logic doRequest() itself uses — a single source of truth for
  // the guest-JWT refresh call, never duplicated. Callers are responsible
  // for their own "never retry a second time" discipline (INGST-01 401
  // retry-storm guard) — this method itself performs no looping.
  async refreshAuth(): Promise<void> {
    await this.refreshGuestJwt();
  }

  private async doRequest<T>(path: string, init: RequestInit, isRetry: boolean): Promise<T> {
    const url = path.startsWith('http') ? path : `${TXLINE_ORIGIN}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${this.guestJwt}`,
        'X-Api-Token': this.apiToken,
      },
    });

    if (response.status === 401) {
      if (isRetry) {
        // Already refreshed once for this call chain — never loop.
        throw new TxlineAuthExpiredError();
      }
      this.logger.warn('TxLINE request 401 — refreshing guest JWT (one-time retry)');
      await this.refreshGuestJwt();
      return this.doRequest<T>(path, init, true);
    }

    if (!response.ok) {
      throw new Error(`TxLINE request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  // POST /auth/guest/start — captures the new JWT in memory only. Never
  // logs the token value; logs presence/outcome only.
  private async refreshGuestJwt(): Promise<void> {
    const response = await fetch(`${TXLINE_ORIGIN}${GUEST_JWT_REFRESH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new TxlineAuthExpiredError(
        `TxLINE guest JWT refresh failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as GuestJwtStartResponse;
    const nextJwt = body.token ?? body.jwt;
    if (!nextJwt) {
      throw new TxlineAuthExpiredError('TxLINE guest JWT refresh response missing token field');
    }

    this.guestJwt = nextJwt;
    this.logger.log('TxLINE guest JWT refreshed');
  }
}
