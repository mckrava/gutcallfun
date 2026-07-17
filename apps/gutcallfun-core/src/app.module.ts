import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './modules/core/database.module';
import { IngestModule } from './modules/ingest/ingest.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, IngestModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
