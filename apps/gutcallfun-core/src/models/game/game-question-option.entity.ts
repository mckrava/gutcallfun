import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { GameQuestionEntity } from './game-question.entity';
import { GameQuestionOutcomeEntity } from './game-question-outcome.entity';

// Both are named UNIQUE table constraints in initial-db-structure.sql
// (`ADD CONSTRAINT ... UNIQUE`) — use @Unique so migration:generate matches
// the migrated schema's pg_constraint rows.
@Entity('game_question_option')
@Unique('uq_gqo_outcome', ['gameQuestionId', 'outcomeKey'])
@Unique('uq_gqo_order', ['gameQuestionId', 'displayOrder'])
export class GameQuestionOptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_question_id', type: 'uuid' })
  gameQuestionId: string;

  // Relation objects mirror the raw FK columns above (same physical column,
  // merged by TypeORM via matching @JoinColumn name) so migration:generate
  // sees the fk_gqo_* constraints that initial-db-structure.sql declares.
  // gameQuestionRef is a circular FK with game_question (see the comment on
  // GameQuestionEntity.resolvedOptionRef).
  @ManyToOne(() => GameQuestionEntity)
  @JoinColumn({
    name: 'game_question_id',
    foreignKeyConstraintName: 'fk_gqo_question',
  })
  gameQuestionRef: GameQuestionEntity;

  @Column({ name: 'outcome_key', type: 'varchar' })
  outcomeKey: string;

  @ManyToOne(() => GameQuestionOutcomeEntity)
  @JoinColumn({
    name: 'outcome_key',
    foreignKeyConstraintName: 'fk_gqo_outcome',
  })
  outcomeRef: GameQuestionOutcomeEntity;

  @Column({ name: 'base_gain', type: 'int' })
  baseGain: number;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;
}
