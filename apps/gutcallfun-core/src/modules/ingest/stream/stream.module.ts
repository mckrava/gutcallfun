import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { PipelineModule } from '../pipeline/pipeline.module';
import { FixturesModule } from '../fixtures/fixtures.module';
import { StreamManagerService } from './stream-manager.service';

// INGST-02 live SSE ingest. Imports PipelineModule (EventIngestService, the
// source-agnostic pipeline entry point — Plan 03) and FixturesModule
// (TxlineHttpClient, the shared TxLINE auth client — Plan 04, INGST-01) so
// StreamManagerService reuses both instead of re-implementing persistence
// or auth. Exports StreamManagerService so the Plan-07 is_replay
// source-switch scheduler can inject start(gameId)/stop(gameId) — this
// module never self-schedules anything (D-02 one-scheduler rule).
@Module({
  imports: [TypeOrmModule.forFeature([GameEntity]), PipelineModule, FixturesModule],
  providers: [StreamManagerService],
  exports: [StreamManagerService],
})
export class StreamModule {}
