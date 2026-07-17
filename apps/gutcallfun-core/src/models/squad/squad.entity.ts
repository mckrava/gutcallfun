import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('squad')
export class SquadEntity {
  @PrimaryColumn({ name: 'id', type: 'int' })
  id: number;

  @Column({ name: 'name', type: 'varchar' })
  name: string;

  @Column({ name: 'image', type: 'varchar', nullable: true })
  image: string | null;

  @Column({ name: 'invite_code', type: 'varchar', nullable: true })
  @Index('uq_squad_invite_code', { unique: true })
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
