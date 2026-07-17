import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { QuestionState, QuestionType } from './enums';

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

  @Column({ name: 'trigger_event_id', type: 'uuid', nullable: true })
  triggerEventId: string | null;

  @Column({ name: 'resolution_event_id', type: 'uuid', nullable: true })
  resolutionEventId: string | null;

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

  @Column({ name: 'answer_window_ttl', type: 'int', default: 5 })
  answerWindowTtl: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
