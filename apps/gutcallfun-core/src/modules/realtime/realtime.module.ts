import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { LiveModule } from '../live/live.module';

/**
 * WebSocket transport. `FakeCycleService` (the synthetic `is_mock: true`
 * timer) is gone — every emission now originates from the real TxLINE-driven
 * live loop in `LiveModule`.
 *
 * Imports `LiveModule` for `LiveStateService` (real snapshots). Pushes arrive
 * via the @Global `LiveBroadcastEmitter` rather than a direct dependency, so
 * `LiveModule` never has to import this module back — there is no cycle.
 *
 * `ScheduleModule` is still deliberately NOT imported: `IngestModule` already
 * calls `ScheduleModule.forRoot()`, which registers a `global: true` dynamic
 * module exporting `SchedulerRegistry`.
 */
@Module({
  imports: [LiveModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
