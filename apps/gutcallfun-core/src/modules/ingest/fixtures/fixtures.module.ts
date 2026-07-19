import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { IngestSharedModule } from '../shared/ingest-shared.module';
import { FixturesCronService } from './fixtures-cron.service';
import { TxlineFixturesClient } from './txline-fixtures.client';
import { TxlineHttpClient } from './txline-http.client';

// GAME-01 fixtures discovery + INGST-01 shared TxLINE auth client.
// TxlineHttpClient is exported so Plans 05 (SSE) and 06 (historical
// replay) reuse the same authenticated client instead of re-implementing
// the Bearer/X-Api-Token/401-refresh logic.
@Module({
  imports: [TypeOrmModule.forFeature([GameEntity]), IngestSharedModule],
  providers: [TxlineHttpClient, TxlineFixturesClient, FixturesCronService],
  exports: [TxlineHttpClient],
})
export class FixturesModule {}
