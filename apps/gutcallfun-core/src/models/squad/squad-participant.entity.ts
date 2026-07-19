import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserEntity } from '../account/user.entity';
import { SquadEntity } from './squad.entity';
import { SquadScoreProfileEntity } from './squad-score-profile.entity';

@Entity('squad_participant')
export class SquadParticipantEntity {
  @PrimaryColumn({ name: 'squad_id', type: 'int' })
  squadId: number;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  // Relation objects mirror the raw FK columns above (same physical
  // squad_id/user_id/score_profile columns, merged by TypeORM via matching
  // @JoinColumn names) so migration:generate sees the fk_sp_* constraints
  // that initial-db-structure.sql declares.
  @ManyToOne(() => SquadEntity)
  @JoinColumn({ name: 'squad_id', foreignKeyConstraintName: 'fk_sp_squad' })
  squadRef: SquadEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_sp_user' })
  userRef: UserEntity;

  @Column({ name: 'active', type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'score_profile', type: 'varchar', nullable: true })
  scoreProfile: string | null;

  @ManyToOne(() => SquadScoreProfileEntity, { nullable: true })
  @JoinColumn({
    name: 'score_profile',
    foreignKeyConstraintName: 'fk_sp_score_profile',
  })
  scoreProfileRef: SquadScoreProfileEntity | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
