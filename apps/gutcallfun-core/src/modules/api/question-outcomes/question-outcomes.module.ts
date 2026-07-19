import { Module } from '@nestjs/common';
import { QuestionOutcomesController } from './question-outcomes.controller';
import { QuestionOutcomesService } from './question-outcomes.service';

// Not registered anywhere: plan 05 owns all module registration.
@Module({
  controllers: [QuestionOutcomesController],
  providers: [QuestionOutcomesService],
  exports: [QuestionOutcomesService],
})
export class QuestionOutcomesModule {}
