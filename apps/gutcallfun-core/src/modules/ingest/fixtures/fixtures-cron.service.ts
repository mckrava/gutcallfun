import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { DiscoveredFixture, TxlineFixturesClient } from './txline-fixtures.client';

// GAME-01: 1-minute discovery cron. Pulls the 7-day upcoming window and the
// last PAST_FIXTURES_COUNT past fixtures (D-09, forward-only endpoint
// worked around in TxlineFixturesClient), upserting by fixture_id with no
// competition filter (D-10) and no live cap (D-12). Vanished fixtures are
// left untouched — never deleted/reconciled (D-11).
@Injectable()
export class FixturesCronService {
  private readonly logger = new Logger(FixturesCronService.name);

  constructor(
    private readonly fixturesClient: TxlineFixturesClient,
    @InjectRepository(GameEntity) private readonly gameRepo: Repository<GameEntity>,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async discoverFixtures(): Promise<void> {
    const pastFixturesCount = this.config.get<number>('PAST_FIXTURES_COUNT') ?? 20;

    const [upcoming, past] = await Promise.all([
      this.safeFetch(() => this.fixturesClient.fetchUpcoming(7)),
      this.safeFetch(() => this.fixturesClient.fetchPast(pastFixturesCount)),
    ]);

    await this.upsertAll([...upcoming, ...past]);
  }

  // Never let a single TxLINE fetch failure crash the cron tick (GAME-01
  // empty/error edge) — log and treat as an empty batch for this tick; the
  // next tick retries.
  private async safeFetch(
    fetchFn: () => Promise<DiscoveredFixture[]>,
  ): Promise<DiscoveredFixture[]> {
    try {
      return await fetchFn();
    } catch (error) {
      this.logger.error(`Fixtures discovery fetch failed: ${(error as Error).message}`);
      return [];
    }
  }

  // Upsert-only by fixture_id (GAME-01/D-11): an existing row updates
  // starts_at/names/metadata in place; a new one inserts. Status is only
  // set on INSERT — later plans (stream/replay-arm cron) own live/finished
  // transitions on existing rows, so this cron never clobbers those on an
  // update (concurrency-safety deviation from a naive "always set status").
  private async upsertAll(fixtures: DiscoveredFixture[]): Promise<void> {
    for (const fixture of fixtures) {
      const existing = await this.gameRepo.findOne({ where: { fixtureId: fixture.FixtureId } });

      if (existing) {
        existing.startsAt = new Date(fixture.StartTime);
        existing.team1Name = fixture.Participant1;
        existing.team2Name = fixture.Participant2;
        existing.competition = fixture.Competition;
        existing.fixtureGroupId = fixture.FixtureGroupId;
        existing.participant1Id = fixture.Participant1Id;
        existing.participant2Id = fixture.Participant2Id;
        existing.participant1IsHome = fixture.Participant1IsHome;
        await this.gameRepo.save(existing);
        continue;
      }

      const row = this.gameRepo.create({
        fixtureId: fixture.FixtureId,
        status: fixture.status,
        startsAt: new Date(fixture.StartTime),
        team1Name: fixture.Participant1,
        team2Name: fixture.Participant2,
        competition: fixture.Competition,
        fixtureGroupId: fixture.FixtureGroupId,
        participant1Id: fixture.Participant1Id,
        participant2Id: fixture.Participant2Id,
        participant1IsHome: fixture.Participant1IsHome,
      });
      await this.gameRepo.save(row);
    }
  }
}
