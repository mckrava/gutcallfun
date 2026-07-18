import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { FakeCycleService } from './fake-cycle.service';

/**
 * Not registered anywhere yet — plan 02.1-05 owns all module registration
 * (app.module.ts/api.module.ts wiring).
 *
 * `ScheduleModule` is deliberately NOT imported here. `IngestModule`
 * already calls `ScheduleModule.forRoot()`, which registers a `global: true`
 * dynamic module exporting `SchedulerRegistry` (confirmed by direct
 * inspection of `node_modules/@nestjs/schedule/dist/schedule.module.js`).
 * By the time this module is ever imported into `AppModule` (which already
 * imports `IngestModule`), `SchedulerRegistry` is application-wide
 * available without this module doing anything — registering a second
 * `ScheduleModule.forRoot()` here would create a second global module
 * instance, which is exactly the "do not register a second root instance"
 * the plan warns against.
 */
@Module({
  providers: [RealtimeGateway, FakeCycleService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
