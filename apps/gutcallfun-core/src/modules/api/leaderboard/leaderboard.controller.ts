import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginatedLeaderboardResponseDto } from './dto/leaderboard-entry.dto';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedLeaderboardResponseDto })
  findAll(@Query() query: PaginationQueryDto): PaginatedLeaderboardResponseDto {
    return this.leaderboardService.findAll(query);
  }
}
