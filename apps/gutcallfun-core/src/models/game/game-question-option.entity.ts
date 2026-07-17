import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('game_question_option')
@Index('uq_gqo_outcome', ['gameQuestionId', 'outcomeKey'], { unique: true })
@Index('uq_gqo_order', ['gameQuestionId', 'displayOrder'], { unique: true })
export class GameQuestionOptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_question_id', type: 'uuid' })
  gameQuestionId: string;

  @Column({ name: 'outcome_key', type: 'varchar' })
  outcomeKey: string;

  @Column({ name: 'base_gain', type: 'int' })
  baseGain: number;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;
}
