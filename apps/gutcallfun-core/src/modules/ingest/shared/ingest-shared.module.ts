import { Global, Module } from '@nestjs/common';
import { GameMutexRegistry } from '../state/game-mutex.registry';
import { GameStateRegistry } from '../state/game-state.registry';
import { GameStreamGapEmitter } from '../events/game-stream-gap.emitter';
import { GameStreamGapLogListener } from '../events/game-stream-gap.listener';

// @Global — every ingest sub-module can inject these three shared
// singletons (GameMutexRegistry, GameStateRegistry, GameStreamGapEmitter)
// without re-importing this module. GameStreamGapLogListener is a provider
// only (not exported) — it subscribes itself to the emitter on init.
@Global()
@Module({
  providers: [GameMutexRegistry, GameStateRegistry, GameStreamGapEmitter, GameStreamGapLogListener],
  exports: [GameMutexRegistry, GameStateRegistry, GameStreamGapEmitter],
})
export class IngestSharedModule {}
