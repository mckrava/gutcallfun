import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { PipelineModule } from '../pipeline/pipeline.module';
import { StreamModule } from '../stream/stream.module';
import { ReplayModule } from '../replay/replay.module';
import { SourceSchedulerService } from './source-scheduler.service';
import { GameStateRebuildService } from './game-state-rebuild.service';

// RCVR-01/02, D-02, D-06: source lifecycle orchestration. Imports
// StreamModule (StreamManagerService) + ReplayModule (ReplayStarterService)
// so SourceSchedulerService can dispatch either source via the single
// is_replay switch, and PipelineModule (GameStateMachine — NOT re-exported
// by IngestSharedModule's @Global scope, so it must be imported directly
// here) so GameStateRebuildService can replay persisted game_event rows
// through the SAME state-machine instance the live pipeline uses.
// GameMutexRegistry/GameStateRegistry/GameStreamGapEmitter come from the
// @Global() IngestSharedModule — no explicit import needed for those.
@Module({
  imports: [
    TypeOrmModule.forFeature([GameEntity, GameEventEntity]),
    PipelineModule,
    StreamModule,
    ReplayModule,
  ],
  providers: [SourceSchedulerService, GameStateRebuildService],
})
export class RecoveryModule {}
