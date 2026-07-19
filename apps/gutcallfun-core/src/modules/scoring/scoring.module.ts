import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../../models/account/user.entity';
import { UserScoreProfileEntity } from '../../models/account/user-score-profile.entity';
import { SquadEntity } from '../../models/squad/squad.entity';
import { SquadParticipantEntity } from '../../models/squad/squad-participant.entity';
import { SquadScoreProfileEntity } from '../../models/squad/squad-score-profile.entity';
import { ScoreProfileService } from './score-profile.service';
import { ScoreAggregateService } from './score-aggregate.service';

/**
 * Score profiles are written from four unrelated places — user creation, squad
 * creation/join, game join, and question resolution — so this is @Global rather
 * than an import line in each of those modules. Same reasoning as the config
 * module: one owner, many callers, no import graph churn.
 *
 * Two services, split by direction: `ScoreProfileService` owns the row
 * lifecycle and the counters (write), `ScoreAggregateService` derives every
 * displayed total from `user_game_answer` (read).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserScoreProfileEntity,
      SquadEntity,
      SquadParticipantEntity,
      SquadScoreProfileEntity,
    ]),
  ],
  providers: [ScoreProfileService, ScoreAggregateService],
  exports: [ScoreProfileService, ScoreAggregateService],
})
export class ScoringModule {}
