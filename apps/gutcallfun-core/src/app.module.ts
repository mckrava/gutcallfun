import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './modules/core/database.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { ApiModule } from './modules/api/api.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { LiveModule } from './modules/live/live.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    // LiveModule is listed before IngestModule for readability only — it
    // exports its two emitters via a @Global module, so DI resolution does not
    // depend on this ordering.
    LiveModule,
    IngestModule,
    ApiModule,
    RealtimeModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
