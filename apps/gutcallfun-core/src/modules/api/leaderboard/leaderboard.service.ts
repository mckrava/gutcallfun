import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../models/account/user.entity';
import { UserScoreProfileEntity } from '../../../models/account/user-score-profile.entity';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginatedLeaderboardResponseDto } from './dto/leaderboard-entry.dto';

// DB-backed: ranks real users by their score-profile total, highest first.
@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  async findAll(query: PaginationQueryDto): Promise<PaginatedLeaderboardResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const total = await this.usersRepo.count();
    const rows = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoin(UserScoreProfileEntity, 'usp', 'usp.id = u.score_profile')
      .select([
        'u.id AS user_id',
        'u.handle AS handle',
        'u.image AS image',
        'u.emoji AS emoji',
        'COALESCE(usp.total_points, 0) AS total_points',
      ])
      .orderBy('total_points', 'DESC')
      .addOrderBy('u.created_at', 'ASC')
      .limit(limit)
      .offset(offset)
      .getRawMany<{
        user_id: string;
        handle: string;
        image: string | null;
        emoji: string | null;
        total_points: string | number;
      }>();

    const items = rows.map((r, i) => ({
      user_id: r.user_id,
      handle: r.handle,
      image: r.image,
      emoji: r.emoji,
      total_points: Number(r.total_points),
      rank: offset + i + 1,
    }));

    return { items, total, limit, offset };
  }
}
