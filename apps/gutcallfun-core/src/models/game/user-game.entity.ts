import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_game')
export class UserGameEntity {
  @PrimaryColumn({ name: 'game_id', type: 'int' })
  gameId: number;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'squad_id', type: 'int', nullable: true })
  squadId: number | null;

  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'now()' })
  joinedAt: Date;
}
