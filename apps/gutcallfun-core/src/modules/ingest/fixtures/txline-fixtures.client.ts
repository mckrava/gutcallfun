import { Injectable } from '@nestjs/common';
import { GameStatus } from '../../../models/game/enums';
import { TxlineHttpClient } from './txline-http.client';

const DAY_MS = 24 * 60 * 60 * 1000;

// Wire shape of GET /api/fixtures/snapshot items (txline-openapi.yaml
// `Fixture` schema — verified fields, not the numeric-only stream schema).
export interface TxlineFixture {
  Ts: number;
  StartTime: number; // epoch ms
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
}

// A TxlineFixture the caller already knows how to persist — the intended
// `game.status` is decided here (fetchUpcoming → scheduled, fetchPast →
// finished) so FixturesCronService only has to upsert, never classify.
export interface DiscoveredFixture extends TxlineFixture {
  status: GameStatus;
}

// `startEpochDay` on the wire is a whole day number (days since Unix
// epoch), NOT a date string — see txline-openapi.yaml operation
// `getApiFixturesSnapshot` parameter description.
export function todayEpochDay(): number {
  return Math.floor(Date.now() / DAY_MS);
}

@Injectable()
export class TxlineFixturesClient {
  constructor(private readonly http: TxlineHttpClient) {}

  // GET /api/fixtures/snapshot?startEpochDay=<n> — forward-only: returns
  // fixtures starting at or within 30 days AFTER startEpochDay (RESEARCH
  // Pitfall 1). No competition filter applied here (D-10) — every fixture
  // TxLINE returns is kept.
  async snapshot(startEpochDay: number): Promise<TxlineFixture[]> {
    const fixtures = await this.http.request<TxlineFixture[]>(
      `/api/fixtures/snapshot?startEpochDay=${startEpochDay}`,
    );
    return fixtures ?? [];
  }

  // Upcoming window: `days` ahead of today, upsert-only, marked scheduled
  // (D-11). Excludes fixtures whose StartTime has already elapsed — those
  // belong to fetchPast.
  async fetchUpcoming(days = 7): Promise<DiscoveredFixture[]> {
    const now = Date.now();
    const cutoff = now + days * DAY_MS;
    const fixtures = await this.snapshot(todayEpochDay());
    return fixtures
      .filter((fixture) => fixture.StartTime >= now && fixture.StartTime <= cutoff)
      .map((fixture) => ({ ...fixture, status: GameStatus.SCHEDULED }));
  }

  // The snapshot endpoint is forward-only, so satisfying D-09 ("last N past
  // fixtures as browsable replay material") requires anchoring
  // startEpochDay `count` days in the PAST — its 30-day-forward window from
  // that anchor then includes already-started/finished fixtures (RESEARCH
  // Pitfall 1). Client-side: filter to already-started fixtures, sort by
  // StartTime desc, take the last `count`, mark finished.
  async fetchPast(count: number): Promise<DiscoveredFixture[]> {
    const now = Date.now();
    const anchorEpochDay = todayEpochDay() - count;
    const fixtures = await this.snapshot(anchorEpochDay);
    return fixtures
      .filter((fixture) => fixture.StartTime <= now)
      .sort((a, b) => b.StartTime - a.StartTime)
      .slice(0, count)
      .map((fixture) => ({ ...fixture, status: GameStatus.FINISHED }));
  }
}
