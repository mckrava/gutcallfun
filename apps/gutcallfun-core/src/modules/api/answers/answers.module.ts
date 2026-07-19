import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameQuestionEntity } from '../../../models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../../../models/game/game-question-option.entity';
import { UserGameAnswerEntity } from '../../../models/game/user-game-answer.entity';
import { AnswersController } from './answers.controller';
import { AnswersService } from './answers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserGameAnswerEntity,
      GameQuestionEntity,
      GameQuestionOptionEntity,
    ]),
  ],
  controllers: [AnswersController],
  providers: [AnswersService],
  exports: [AnswersService],
})
export class AnswersModule {}
