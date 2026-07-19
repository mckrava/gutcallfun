import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './modules/core/database.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { ApiModule } from './modules/api/api.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { LiveModule } from './modules/live/live.module';
import { AuthModule } from './modules/auth/auth.module';
import { DevModule } from './modules/dev/dev.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    // @Global — score profiles are written from users, squads, games and the
    // live resolver, so it is registered once here rather than imported four
    // times. Must follow DatabaseModule; it injects DataSource.
    ScoringModule,
    // LiveModule is listed before IngestModule for readability only — it
    // exports its two emitters via a @Global module, so DI resolution does not
    // depend on this ordering.
    LiveModule,
    IngestModule,
    ApiModule,
    RealtimeModule,
    AuthModule,
    // Dev match simulator — FAIL-CLOSED. Mounted ONLY when ENABLE_DEV_SIM is
    // explicitly "true", so /dev/live/* routes don't exist anywhere the flag is
    // unset (incl. production, even if NODE_ENV is misconfigured). assertDev()
    // in the controller is a second layer if the flag is ever on in production.
    ...(process.env.ENABLE_DEV_SIM === 'true' ? [DevModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
