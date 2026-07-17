import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { GameStatus } from './enums';

// TypeORM 0.3.31's `Index(name, fields, options)` decorator overload does not
// expose `synchronize` in its TS type even though the runtime fully supports it
// (see typeorm/decorator/Index.js) — known typing gap, not a real type error.
@Entity('game')
@Index('uq_game_fixture_live', ['fixtureId'], {
  unique: true,
  where: 'NOT "is_replay"',
  synchronize: false, // raw-SQL migration owns this index; entity only documents it
} as { unique: boolean; where: string; synchronize: false })
export class GameEntity {
  @PrimaryGeneratedColumn('identity')
  id: number;

  @Column({ name: 'fixture_id', type: 'int' })
  fixtureId: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: GameStatus,
    enumName: 'game_status',
    default: GameStatus.SCHEDULED,
  })
  status: GameStatus;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'participant1_id', type: 'int', nullable: true })
  participant1Id: number | null;

  @Column({ name: 'participant2_id', type: 'int', nullable: true })
  participant2Id: number | null;

  @Column({ name: 'participant1_is_home', type: 'boolean', default: true })
  participant1IsHome: boolean;

  @Column({ name: 'team1_name', type: 'varchar', nullable: true })
  team1Name: string | null;

  @Column({ name: 'team2_name', type: 'varchar', nullable: true })
  team2Name: string | null;

  @Column({ name: 'competition', type: 'varchar', nullable: true })
  competition: string | null;

  @Column({ name: 'fixture_group_id', type: 'int', nullable: true })
  fixtureGroupId: number | null;

  @Column({ name: 'team1_jersey_color', type: 'varchar', nullable: true })
  team1JerseyColor: string | null;

  @Column({ name: 'team2_jersey_color', type: 'varchar', nullable: true })
  team2JerseyColor: string | null;

  @Column({ name: 'current_status_id', type: 'smallint', nullable: true })
  currentStatusId: number | null;

  @Column({ name: 'score_p1', type: 'smallint', default: 0 })
  scoreP1: number;

  @Column({ name: 'score_p2', type: 'smallint', default: 0 })
  scoreP2: number;

  @Column({ name: 'is_replay', type: 'boolean', default: false })
  isReplay: boolean;

  @Column({ name: 'stream_cursor', type: 'varchar', nullable: true })
  streamCursor: string | null;

  @Column({ name: 'stream_cursor_at', type: 'timestamptz', nullable: true })
  streamCursorAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
