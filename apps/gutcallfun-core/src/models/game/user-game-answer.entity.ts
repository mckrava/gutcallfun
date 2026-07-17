import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_game_answer')
@Index('uq_uga_user_question', ['userId', 'gameQuestionId'], { unique: true })
@Index('idx_uga_leaderboard', ['gameId', 'userId'])
export class UserGameAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'game_id', type: 'int' })
  gameId: number;

  @Column({ name: 'game_question_id', type: 'uuid' })
  gameQuestionId: string;

  @Column({ name: 'selected_option_id', type: 'uuid' })
  selectedOptionId: string;

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
