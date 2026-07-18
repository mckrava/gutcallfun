import { Module } from '@nestjs/common';
import { SquadsController } from './squads.controller';
import { SquadsService } from './squads.service';

// Mock-backed this phase (D-01/D-05) — no TypeOrmModule.forFeature, no
// repository injection. Not registered anywhere yet: plan 05 owns all
// module registration so parallel plans never contend for app.module.ts.
@Module({
  controllers: [SquadsController],
  providers: [SquadsService],
  exports: [SquadsService],
})
export class SquadsModule {}
