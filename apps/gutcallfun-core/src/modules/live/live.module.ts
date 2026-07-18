import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameQuestionEntity } from '../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../models/game/game-question-option.entity';
import { UserGameAnswerEntity } from '../../models/game/user-game-answer.entity';
import { LiveEventsModule } from './events/live-events.module';
import { LiveEngineService } from './live-engine.service';
import { LiveStateService } from './live-state.service';
import { LiveWindowRegistry } from './live-window.registry';
import { OrphanedWindowSweeper } from './orphaned-window.sweeper';
import { QuestionResolutionService } from './question-resolution.service';
import { QuestionWindowService } from './question-window.service';

/**
 * The real live prediction loop: feed event -> window open -> WS push ->
 * resolution -> points -> WS push.
 *
 * `ScheduleModule` is deliberately NOT imported: `IngestModule` already calls
 * `ScheduleModule.forRoot()`, which registers a `global: true` dynamic module
 * exporting `SchedulerRegistry`. A second `forRoot()` here would create a
 * second global instance.
 *
 * `GameStateRegistry` (injected by LiveStateService) comes from the @Global
 * `IngestSharedModule`, so it needs no import either — and it is the SAME
 * singleton the ingest pipeline mutates, which is what makes snapshots
 * reflect real current state.
 *
 * Exports `LiveStateService` for `RealtimeGateway`'s subscribe handler. The
 * gateway receives pushes through the @Global `LiveBroadcastEmitter` instead
 * of a direct dependency, so this module never imports RealtimeModule.
 */
@Module({
  imports: [
    LiveEventsModule,
    TypeOrmModule.forFeature([
      GameQuestionEntity,
      GameQuestionOptionEntity,
      UserGameAnswerEntity,
    ]),
  ],
  providers: [
    LiveWindowRegistry,
    QuestionResolutionService,
    QuestionWindowService,
    LiveEngineService,
    LiveStateService,
    OrphanedWindowSweeper,
  ],
  exports: [LiveStateService],
})
export class LiveModule {}
