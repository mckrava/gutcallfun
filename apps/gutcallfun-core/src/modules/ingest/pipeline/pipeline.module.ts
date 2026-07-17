import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { MessageNormalizer } from '../persistence/message-normalizer';
import { EventIngestService } from '../persistence/event-ingest.service';
import { GameStateMachine } from '../state/game-state.machine';

// Source-agnostic persistence + state-machine pipeline (INGST-03/04/05,
// STAT-01/02/03). GameMutexRegistry/GameStateRegistry/GameStreamGapEmitter
// come from the @Global() IngestSharedModule (Plan 01) — no re-import
// needed. Exports EventIngestService: the single entry point Plan 05 (SSE)
// and Plan 06 (replay) both call.
//
// GameStateMachine is ALSO exported (Plan 06 addition): ReplayStarterService
// (replay/replay-starter.service.ts) needs the SAME GameStateMachine
// singleton EventIngestService uses, so its D-07 auto-wipe can reset the
// state machine's own per-game AttackStore/GoalStore closures (not just
// GameStateRegistry) before a replay take starts — otherwise take #2 would
// reconcile goals against take #1's stale Id-anchored dedup state.
@Module({
  imports: [TypeOrmModule.forFeature([GameEntity, GameEventEntity])],
  providers: [MessageNormalizer, GameStateMachine, EventIngestService],
  exports: [EventIngestService, GameStateMachine],
})
export class PipelineModule {}
