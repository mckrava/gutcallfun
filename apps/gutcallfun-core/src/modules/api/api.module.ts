import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { SquadsModule } from './squads/squads.module';
import { GamesModule } from './games/games.module';
import { QuestionOutcomesModule } from './question-outcomes/question-outcomes.module';
import { AnswersModule } from './answers/answers.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { WsSchemasController } from './docs/ws-schemas.controller';

/**
 * Aggregator for the six REST resource modules built in plans 02.1-02 and
 * 02.1-03, plus the WS-contract-documentation controller this plan adds
 * (Task 1). Imports-only, mirroring `src/modules/ingest/ingest.module.ts`'s
 * shape — no providers or controllers of its own beyond the WS schema
 * controller, which lives here rather than in a seventh resource module
 * because it documents a cross-cutting concern (the WebSocket contract), not
 * a REST resource.
 */
@Module({
  imports: [
    UsersModule,
    SquadsModule,
    GamesModule,
    QuestionOutcomesModule,
    AnswersModule,
    LeaderboardModule,
  ],
  controllers: [WsSchemasController],
})
export class ApiModule {}
