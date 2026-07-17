import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

// uq_gqoc_ladder is a named UNIQUE table constraint in
// initial-db-structure.sql (`ADD CONSTRAINT ... UNIQUE`) — use @Unique, not
// @Index({unique:true}), so migration:generate reports an empty diff.
@Entity('game_question_outcome')
@Unique('uq_gqoc_ladder', ['ladderPosition'])
export class GameQuestionOutcomeEntity {
  @PrimaryColumn({ name: 'key', type: 'varchar' })
  key: string;

  @Column({ name: 'content', type: 'varchar' })
  content: string;

  @Column({ name: 'ladder_position', type: 'smallint' })
  ladderPosition: number;
}
