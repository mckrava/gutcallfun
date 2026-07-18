import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameQuestionEntity } from '../../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../../models/game/game-question-option.entity';
import { UserGameEntity } from '../../../models/game/user-game.entity';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameEntity,
      UserGameEntity,
      GameQuestionEntity,
      GameQuestionOptionEntity,
    ]),
  ],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
