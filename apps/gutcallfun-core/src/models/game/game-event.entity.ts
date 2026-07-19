import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { GameEntity } from './game.entity';

// uq_game_event_seq is a named UNIQUE table constraint in
// initial-db-structure.sql (`ADD CONSTRAINT ... UNIQUE`) — use @Unique so
// migration:generate matches the migrated schema's pg_constraint row. The
// two idx_ge_* entries are plain `CREATE INDEX` (non-unique) and stay @Index.
@Entity('game_event')
@Unique('uq_game_event_seq', ['gameId', 'seq'])
@Index('idx_ge_action_id', ['gameId', 'actionId'])
@Index('idx_ge_type', ['gameId', 'type'])
export class GameEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id', type: 'int' })
  gameId: number;

  // Relation object mirrors the raw `gameId` FK column above (same
  // physical `game_id` column) so migration:generate sees the fk_ge_game
  // constraint that initial-db-structure.sql declares.
  @ManyToOne(() => GameEntity)
  @JoinColumn({ name: 'game_id', foreignKeyConstraintName: 'fk_ge_game' })
  gameRef: GameEntity;

  @Column({ name: 'type', type: 'varchar' })
  type: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'action_id', type: 'int', nullable: true })
  actionId: number | null;

  @Column({ name: 'seq', type: 'int' })
  seq: number;

  @Column({ name: 'confirmed', type: 'boolean', nullable: true })
  confirmed: boolean | null;

  @Column({ name: 'participant', type: 'smallint', nullable: true })
  participant: number | null;

  @Column({ name: 'status_id', type: 'smallint', nullable: true })
  statusId: number | null;

  @Column({ name: 'feed_ts', type: 'timestamptz' })
  feedTs: Date;

  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;
}
