import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_score_profile')
export class UserScoreProfileEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id: string;

  @Column({ name: 'total_points', type: 'bigint', default: 0 })
  totalPoints: string;

  @Column({ name: 'games_played', type: 'int', default: 0 })
  gamesPlayed: number;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
