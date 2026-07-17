import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('game_event')
@Index('uq_game_event_seq', ['gameId', 'seq'], { unique: true })
@Index('idx_ge_action_id', ['gameId', 'actionId'])
@Index('idx_ge_type', ['gameId', 'type'])
export class GameEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id', type: 'int' })
  gameId: number;

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
