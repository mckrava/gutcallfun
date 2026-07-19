import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';

// Derived from user_game_answer at query time — no entity repositories needed,
// the service works off the DataSource directly. See leaderboard.service.ts
// for why nothing here ranks on the *_score_profile counters.
@Module({
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
