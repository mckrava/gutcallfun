import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuestionState, QuestionType } from './enums';
import { GameEntity } from './game.entity';
import { GameEventEntity } from './game-event.entity';
import { GameQuestionOptionEntity } from './game-question-option.entity';

// TypeORM 0.3.31's `Index(name, fields, options)` decorator overload does not
// expose `synchronize` in its TS type even though the runtime fully supports it
// (see typeorm/decorator/Index.js) — known typing gap, not a real type error.
@Entity('game_question')
@Index('uq_gq_one_open_per_game', ['gameId'], {
  unique: true,
  where: `"state" = 'open'`,
  synchronize: false, // raw-SQL migration owns this index; entity only documents it
} as { unique: boolean; where: string; synchronize: false })
export class GameQuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id', type: 'int' })
  gameId: number;

  // Relation objects below mirror the raw FK columns above (same physical
  // column, merged by TypeORM via matching @JoinColumn name) so
  // migration:generate sees the fk_gq_* constraints that
  // initial-db-structure.sql declares. resolvedOptionRef is a circular FK
  // with game_question_option (nullable, set post-insert per SQL comment).
  @ManyToOne(() => GameEntity)
  @JoinColumn({ name: 'game_id', foreignKeyConstraintName: 'fk_gq_game' })
  gameRef: GameEntity;

  @Column({ name: 'trigger_event_id', type: 'uuid', nullable: true })
  triggerEventId: string | null;

  @ManyToOne(() => GameEventEntity, { nullable: true })
  @JoinColumn({
    name: 'trigger_event_id',
    foreignKeyConstraintName: 'fk_gq_trigger_event',
  })
  triggerEventRef: GameEventEntity | null;

  @Column({ name: 'resolution_event_id', type: 'uuid', nullable: true })
  resolutionEventId: string | null;

  @ManyToOne(() => GameEventEntity, { nullable: true })
  @JoinColumn({
    name: 'resolution_event_id',
    foreignKeyConstraintName: 'fk_gq_resolution_event',
  })
  resolutionEventRef: GameEventEntity | null;

  @Column({
    name: 'question_type',
    type: 'enum',
    enum: QuestionType,
    enumName: 'question_type',
    default: QuestionType.ATTACK_OUTCOME,
  })
  questionType: QuestionType;

  @Column({ name: 'content', type: 'varchar' })
  content: string;

  @Column({ name: 'participant', type: 'smallint', nullable: true })
  participant: number | null;

  @Column({
    name: 'state',
    type: 'enum',
    enum: QuestionState,
    enumName: 'question_state',
    default: QuestionState.OPEN,
  })
  state: QuestionState;

  @Column({ name: 'resolved_option_id', type: 'uuid', nullable: true })
  resolvedOptionId: string | null;

  @ManyToOne(() => GameQuestionOptionEntity, { nullable: true })
  @JoinColumn({
    name: 'resolved_option_id',
    foreignKeyConstraintName: 'fk_gq_resolved_option',
  })
  resolvedOptionRef: GameQuestionOptionEntity | null;

  @Column({ name: 'answer_window_ttl', type: 'int', default: 5 })
  answerWindowTtl: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
