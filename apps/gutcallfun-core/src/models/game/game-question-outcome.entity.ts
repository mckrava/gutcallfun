import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('game_question_outcome')
export class GameQuestionOutcomeEntity {
  @PrimaryColumn({ name: 'key', type: 'varchar' })
  key: string;

  @Column({ name: 'content', type: 'varchar' })
  content: string;

  @Column({ name: 'ladder_position', type: 'smallint' })
  @Index('uq_gqoc_ladder', { unique: true })
  ladderPosition: number;
}
