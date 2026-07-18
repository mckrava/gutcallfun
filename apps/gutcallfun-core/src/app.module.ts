import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './modules/core/database.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { ApiModule } from './modules/api/api.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    IngestModule,
    ApiModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
