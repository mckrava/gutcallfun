import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { LEADERBOARD_FIXTURE } from '../../../mocks/fixtures/leaderboard.fixtures';
import {
  LeaderboardEntryDto,
  PaginatedLeaderboardResponseDto,
} from './dto/leaderboard-entry.dto';

// Fixture-backed this phase (D-01/D-05) — no repository injection, no
// TypeORM import. The fixture is already ordered by total_points
// descending; this service holds no mutable per-request state, so
// concurrent calls cannot interleave into divergent results.
@Injectable()
export class LeaderboardService {
  findAll(query: PaginationQueryDto): PaginatedLeaderboardResponseDto {
    // Fresh derivation from the immutable fixture on every call — nothing
    // shared or mutated between concurrent invocations.
    const ranked: LeaderboardEntryDto[] = LEADERBOARD_FIXTURE.map(
      (entry, index) => ({
        ...entry,
        rank: index + 1,
      }),
    );

    const total = ranked.length;
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const items = ranked.slice(offset, offset + limit);

    return { items, total, limit, offset };
  }
}
