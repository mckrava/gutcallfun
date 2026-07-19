import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// TypeORM 0.3.31's `Index(name, fields, options)` decorator overload does not
// expose `synchronize` in its TS type even though the runtime fully supports
// it (see typeorm/decorator/Index.js) — known typing gap, not a real type
// error. Mirrors game.entity.ts's uq_game_fixture_live escape hatch.
//
// This table IS the entire post-World-Cup control surface for the infinite
// replay loop: the operator cannot ship code or change env vars after
// submission, so every knob (enable, target fixture, delay, stall timeout,
// iteration cap) is tunable by a plain `UPDATE replay_loop SET ...` over
// psql. See AddReplayLoop1790200000000 for the full usage example. Ships
// with zero rows — nothing loops until an operator inserts one.
@Entity('replay_loop')
@Index('idx_replay_loop_enabled', ['id'], {
  unique: false,
  where: '"enabled"',
  synchronize: false, // raw-SQL migration owns this index; entity only documents it
} as { unique: boolean; where: string; synchronize: false })
export class ReplayLoopEntity {
  @PrimaryGeneratedColumn('identity')
  id: number;

  @Column({ name: 'enabled', type: 'boolean', default: false })
  enabled: boolean;

  @Column({ name: 'fixture_id', type: 'int' })
  fixtureId: number;

  // Deliberately no FK / relation — see AddReplayLoop1790200000000's header
  // for the rationale (operator control table, no ON DELETE CASCADE
  // anywhere in this schema, and declaring neither the constraint nor the
  // relation keeps migration:generate from proposing to drop it).
  @Column({ name: 'template_game_id', type: 'int', nullable: true })
  templateGameId: number | null;

  @Column({ name: 'restart_delay_seconds', type: 'int', default: 60 })
  restartDelaySeconds: number;

  @Column({ name: 'stall_timeout_seconds', type: 'int', default: 300 })
  stallTimeoutSeconds: number;

  @Column({ name: 'max_iterations', type: 'int', nullable: true })
  maxIterations: number | null;

  @Column({ name: 'iterations_run', type: 'int', default: 0 })
  iterationsRun: number;

  @Column({ name: 'current_game_id', type: 'int', nullable: true })
  currentGameId: number | null;

  @Column({ name: 'last_restart_at', type: 'timestamptz', nullable: true })
  lastRestartAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
