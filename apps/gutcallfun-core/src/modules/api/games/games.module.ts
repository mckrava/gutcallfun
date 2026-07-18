import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

// Fixture-backed this phase (D-01/D-05) — no TypeOrmModule.forFeature, no
// repository injection. Not registered anywhere: plan 05 owns all module
// registration (app.module.ts / api.module.ts) so parallel plans in this
// wave never contend for the same file.
@Module({
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
