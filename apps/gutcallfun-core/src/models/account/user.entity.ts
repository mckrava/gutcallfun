import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_address', type: 'varchar' })
  @Index('uq_user_wallet', { unique: true })
  walletAddress: string;

  @Column({ name: 'share_code', type: 'varchar', length: 12 })
  @Index('uq_user_share_code', { unique: true })
  shareCode: string;

  @Column({ name: 'handle', type: 'varchar' })
  @Index('uq_user_handle', { unique: true })
  handle: string;

  @Column({ name: 'image', type: 'varchar', nullable: true })
  image: string | null;

  @Column({ name: 'score_profile', type: 'varchar', nullable: true })
  scoreProfile: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
