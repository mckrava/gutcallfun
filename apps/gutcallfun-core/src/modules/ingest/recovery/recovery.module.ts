import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { StreamModule } from '../stream/stream.module';
import { ReplayModule } from '../replay/replay.module';
import { SourceSchedulerService } from './source-scheduler.service';

// RCVR-01/02, D-02, D-06: source lifecycle orchestration. Imports
// StreamModule (StreamManagerService) + ReplayModule (ReplayStarterService)
// so SourceSchedulerService can dispatch either source via the single
// is_replay switch. GameMutexRegistry/GameStateRegistry/GameStreamGapEmitter
// come from the @Global() IngestSharedModule — no explicit import needed for
// those. (Task 2 of this plan adds GameStateRebuildService + its
// PipelineModule import, since GameStateMachine is exported by PipelineModule
// rather than the @Global scope.)
@Module({
  imports: [TypeOrmModule.forFeature([GameEntity, GameEventEntity]), StreamModule, ReplayModule],
  providers: [SourceSchedulerService],
})
export class RecoveryModule {}
