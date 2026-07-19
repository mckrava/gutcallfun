import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameQuestionEntity } from '../../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../../models/game/game-question-option.entity';
import { UserGameEntity } from '../../../models/game/user-game.entity';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { RecapService } from './recap.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameEntity,
      UserGameEntity,
      GameQuestionEntity,
      GameQuestionOptionEntity,
    ]),
    // Not @Global — must be imported explicitly to inject LeaderboardService
    // for RecapService's "my rank" reads (ScoringModule, by contrast, is).
    LeaderboardModule,
  ],
  controllers: [GamesController],
  providers: [GamesService, RecapService],
  exports: [GamesService],
})
export class GamesModule {}
