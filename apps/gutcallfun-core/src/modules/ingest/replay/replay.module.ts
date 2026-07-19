import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { PipelineModule } from '../pipeline/pipeline.module';
import { FixturesModule } from '../fixtures/fixtures.module';
import { HistoricalClient } from './historical.client';
import { ReplaySourceService } from './replay-source.service';
import { ReplayStarterService } from './replay-starter.service';

// RPLY-01..03: replay side of the source switch. Imports PipelineModule
// (EventIngestService — the same source-agnostic entry point live SSE
// calls) and FixturesModule (TxlineHttpClient, reused by HistoricalClient
// for the authenticated historical fetch). GameMutexRegistry/
// GameStateRegistry/GameStreamGapEmitter come from the @Global()
// IngestSharedModule — no re-import needed. Exports ReplayStarterService
// for the Plan-07 scheduler to invoke.
@Module({
  imports: [
    PipelineModule,
    FixturesModule,
    TypeOrmModule.forFeature([GameEntity, GameEventEntity]),
  ],
  providers: [HistoricalClient, ReplaySourceService, ReplayStarterService],
  exports: [ReplayStarterService],
})
export class ReplayModule {}
