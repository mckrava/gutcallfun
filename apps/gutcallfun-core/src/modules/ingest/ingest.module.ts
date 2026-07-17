import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { IngestSharedModule } from './shared/ingest-shared.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { FixturesModule } from './fixtures/fixtures.module';
import { StreamModule } from './stream/stream.module';
import { ReplayModule } from './replay/replay.module';
import { RecoveryModule } from './recovery/recovery.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    IngestSharedModule,
    PipelineModule,
    FixturesModule,
    StreamModule,
    ReplayModule,
    RecoveryModule,
  ],
})
export class IngestModule {}
