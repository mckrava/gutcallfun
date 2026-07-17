import { Global, Module } from '@nestjs/common';

// Providers/exports filled in by Task 3: GameMutexRegistry, GameStateRegistry,
// GameStreamGapEmitter (exported) + GameStreamGapLogListener (provider only).
@Global()
@Module({})
export class IngestSharedModule {}
