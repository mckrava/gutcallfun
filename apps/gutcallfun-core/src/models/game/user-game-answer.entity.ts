import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from '../account/user.entity';
import { GameEntity } from './game.entity';
import { GameQuestionEntity } from './game-question.entity';
import { GameQuestionOptionEntity } from './game-question-option.entity';

// uq_uga_user_question is a named UNIQUE table constraint in
// initial-db-structure.sql (`ADD CONSTRAINT ... UNIQUE`) — use @Unique so
// migration:generate matches the migrated schema's pg_constraint row.
// idx_uga_leaderboard is a plain `CREATE INDEX` (non-unique) and stays @Index.
@Entity('user_game_answer')
@Unique('uq_uga_user_question', ['userId', 'gameQuestionId'])
@Index('idx_uga_leaderboard', ['gameId', 'userId'])
export class UserGameAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // Relation objects mirror the raw FK columns above/below (same physical
  // column, merged by TypeORM via matching @JoinColumn name) so
  // migration:generate sees the fk_uga_* constraints that
  // initial-db-structure.sql declares.
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_uga_user' })
  userRef: UserEntity;

  @Column({ name: 'game_id', type: 'int' })
  gameId: number;

  @ManyToOne(() => GameEntity)
  @JoinColumn({ name: 'game_id', foreignKeyConstraintName: 'fk_uga_game' })
  gameRef: GameEntity;

  @Column({ name: 'game_question_id', type: 'uuid' })
  gameQuestionId: string;

  @ManyToOne(() => GameQuestionEntity)
  @JoinColumn({
    name: 'game_question_id',
    foreignKeyConstraintName: 'fk_uga_question',
  })
  gameQuestionRef: GameQuestionEntity;

  @Column({ name: 'selected_option_id', type: 'uuid' })
  selectedOptionId: string;

  @ManyToOne(() => GameQuestionOptionEntity)
  @JoinColumn({
    name: 'selected_option_id',
    foreignKeyConstraintName: 'fk_uga_option',
  })
  selectedOptionRef: GameQuestionOptionEntity;

  @Column({
    name: 'reward_multiplier',
    type: 'numeric',
    precision: 6,
    scale: 3,
    default: 1,
  })
  rewardMultiplier: string;

  @Column({ name: 'awarded_points', type: 'int', nullable: true })
  awardedPoints: number | null;

  @Column({ name: 'successful_outcome', type: 'boolean', nullable: true })
  successfulOutcome: boolean | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
