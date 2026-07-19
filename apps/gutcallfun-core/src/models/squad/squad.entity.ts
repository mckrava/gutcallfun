import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

// initial-db-structure.sql creates uq_squad_invite_code as a named UNIQUE
// table constraint (`ADD CONSTRAINT ... UNIQUE`) — use @Unique, not
// @Index({unique:true}), so migration:generate reports an empty diff.
@Entity('squad')
@Unique('uq_squad_invite_code', ['inviteCode'])
export class SquadEntity {
  @PrimaryColumn({ name: 'id', type: 'int' })
  id: number;

  @Column({ name: 'name', type: 'varchar' })
  name: string;

  @Column({ name: 'image', type: 'varchar', nullable: true })
  image: string | null;

  // Persisted crest emoji (AddAvatarEmoji migration).
  @Column({ name: 'emoji', type: 'varchar', nullable: true })
  emoji: string | null;

  @Column({ name: 'invite_code', type: 'varchar', nullable: true })
  inviteCode: string | null;

  @Column({ name: 'active', type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
