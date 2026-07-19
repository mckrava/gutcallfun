import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { PaginatedLeaderboardResponseDto } from './dto/leaderboard-entry.dto';
import { ListLeaderboardQueryDto } from './dto/list-leaderboard-query.dto';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: PaginatedLeaderboardResponseDto })
  /**
   * One endpoint, four boards. `game_id` and `squad_id` are independently
   * optional; omitting both is the global all-users board, which is what this
   * route returned before the filters existed — the response envelope is
   * unchanged, so existing callers keep working untouched.
   */
  findAll(
    @Query() query: ListLeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardResponseDto> {
    return this.leaderboardService.findAll(query);
  }
}
