import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SquadEntity } from '../../../models/squad/squad.entity';
import { SquadParticipantEntity } from '../../../models/squad/squad-participant.entity';
import { UserScoreProfileEntity } from '../../../models/account/user-score-profile.entity';
import { SquadScoreProfileEntity } from '../../../models/squad/squad-score-profile.entity';
import { SquadsController } from './squads.controller';
import { SquadsService } from './squads.service';

// Now DB-backed: create/join persist to `squad` / `squad_participant`, and
// member rows are enriched from `user` / `user_score_profile`.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SquadEntity,
      SquadParticipantEntity,
      UserScoreProfileEntity,
      SquadScoreProfileEntity,
    ]),
  ],
  controllers: [SquadsController],
  providers: [SquadsService],
  exports: [SquadsService],
})
export class SquadsModule {}
