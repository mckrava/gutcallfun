import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('squad_participant')
export class SquadParticipantEntity {
  @PrimaryColumn({ name: 'squad_id', type: 'int' })
  squadId: number;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'active', type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'score_profile', type: 'varchar', nullable: true })
  scoreProfile: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
