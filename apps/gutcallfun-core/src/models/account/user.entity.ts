import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserScoreProfileEntity } from './user-score-profile.entity';

// initial-db-structure.sql (authoritative) creates these as named UNIQUE
// table constraints (`ADD CONSTRAINT ... UNIQUE`), not bare unique indexes —
// use @Unique (not @Index({unique:true})) so migration:generate sees no diff
// against the migrated schema's pg_constraint rows.
@Entity('user')
@Unique('uq_user_wallet', ['walletAddress'])
@Unique('uq_user_share_code', ['shareCode'])
@Unique('uq_user_handle', ['handle'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_address', type: 'varchar' })
  walletAddress: string;

  @Column({ name: 'share_code', type: 'varchar', length: 12 })
  shareCode: string;

  @Column({ name: 'handle', type: 'varchar' })
  handle: string;

  @Column({ name: 'image', type: 'varchar', nullable: true })
  image: string | null;

  @Column({ name: 'score_profile', type: 'varchar', nullable: true })
  scoreProfile: string | null;

  // Relation object mirrors the raw `scoreProfile` FK column above (same
  // physical `score_profile` column, merged by TypeORM via matching
  // @JoinColumn name) so migration:generate sees the fk_user_score_profile
  // constraint that initial-db-structure.sql declares.
  @ManyToOne(() => UserScoreProfileEntity, { nullable: true })
  @JoinColumn({
    name: 'score_profile',
    foreignKeyConstraintName: 'fk_user_score_profile',
  })
  scoreProfileRef: UserScoreProfileEntity | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
