import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GameEventPageDto } from './dto/game-event-page.dto';
import {
  GameResponseDto,
  PaginatedGamesResponseDto,
} from './dto/game-response.dto';
import { JoinGameDto } from './dto/join-game.dto';
import { ListGameEventsQueryDto } from './dto/list-game-events-query.dto';
import { ListGamesQueryDto } from './dto/list-games-query.dto';
import { ListQuestionsQueryDto } from './dto/list-questions-query.dto';
import { QuestionResponseDto } from './dto/question-response.dto';
import { UserGameResponseDto } from './dto/user-game-response.dto';
import { GamesService } from './games.service';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedGamesResponseDto })
  findAll(@Query() query: ListGamesQueryDto): PaginatedGamesResponseDto {
    return this.gamesService.findAll(query);
  }

  @Get(':game_id')
  @ApiOkResponse({ type: GameResponseDto })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  findOne(@Param('game_id', ParseIntPipe) gameId: number): GameResponseDto {
    return this.gamesService.findOne(gameId);
  }

  @Get(':game_id/events')
  @ApiOkResponse({ type: GameEventPageDto })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  findEvents(
    @Param('game_id', ParseIntPipe) gameId: number,
    @Query() query: ListGameEventsQueryDto,
  ): GameEventPageDto {
    return this.gamesService.findEvents(gameId, query);
  }

  @Get(':game_id/questions')
  @ApiOkResponse({ type: QuestionResponseDto, isArray: true })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  findQuestions(
    @Param('game_id', ParseIntPipe) gameId: number,
    @Query() query: ListQuestionsQueryDto,
  ): QuestionResponseDto[] {
    return this.gamesService.findQuestions(gameId, query);
  }

  @Post(':game_id/join')
  @ApiCreatedResponse({ type: UserGameResponseDto })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  join(
    @Param('game_id', ParseIntPipe) gameId: number,
    @Body() dto: JoinGameDto,
  ): UserGameResponseDto {
    return this.gamesService.join(gameId, dto);
  }
}
