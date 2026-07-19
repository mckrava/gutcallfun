import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserEntity } from '../account/user.entity';
import { SquadEntity } from '../squad/squad.entity';
import { GameEntity } from './game.entity';

@Entity('user_game')
export class UserGameEntity {
  @PrimaryColumn({ name: 'game_id', type: 'int' })
  gameId: number;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  // Relation objects mirror the raw FK columns above/below (same physical
  // column, merged by TypeORM via matching @JoinColumn name) so
  // migration:generate sees the fk_ug_* constraints that
  // initial-db-structure.sql declares.
  @ManyToOne(() => GameEntity)
  @JoinColumn({ name: 'game_id', foreignKeyConstraintName: 'fk_ug_game' })
  gameRef: GameEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_ug_user' })
  userRef: UserEntity;

  @Column({ name: 'squad_id', type: 'int', nullable: true })
  squadId: number | null;

  @ManyToOne(() => SquadEntity, { nullable: true })
  @JoinColumn({ name: 'squad_id', foreignKeyConstraintName: 'fk_ug_squad' })
  squadRef: SquadEntity | null;

  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'now()' })
  joinedAt: Date;
}
