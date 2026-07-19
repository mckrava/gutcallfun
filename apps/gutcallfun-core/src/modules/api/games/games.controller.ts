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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import type { AuthPrincipal } from '../../auth/auth.types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { GameEventPageDto } from './dto/game-event-page.dto';
import { PaginatedGameParticipantsResponseDto } from './dto/game-participant-response.dto';
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
import { MyGameParticipationResponseDto } from './dto/my-game-participation-response.dto';
import { RecapResponseDto } from './dto/recap-response.dto';
import { GamesService } from './games.service';
import { RecapService } from './recap.service';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly recapService: RecapService,
  ) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: PaginatedGamesResponseDto })
  findAll(
    @Query() query: ListGamesQueryDto,
  ): Promise<PaginatedGamesResponseDto> {
    return this.gamesService.findAll(query);
  }

  @Public()
  @Get(':game_id')
  @ApiOkResponse({ type: GameResponseDto })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  findOne(
    @Param('game_id', ParseIntPipe) gameId: number,
  ): Promise<GameResponseDto> {
    return this.gamesService.findOne(gameId);
  }

  @Public()
  @Get(':game_id/events')
  @ApiOkResponse({ type: GameEventPageDto })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  findEvents(
    @Param('game_id', ParseIntPipe) gameId: number,
    @Query() query: ListGameEventsQueryDto,
  ): Promise<GameEventPageDto> {
    return this.gamesService.findEvents(gameId, query);
  }

  @Public()
  @Get(':game_id/questions')
  @ApiOkResponse({ type: QuestionResponseDto, isArray: true })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  findQuestions(
    @Param('game_id', ParseIntPipe) gameId: number,
    @Query() query: ListQuestionsQueryDto,
  ): Promise<QuestionResponseDto[]> {
    return this.gamesService.findQuestions(gameId, query);
  }

  @Public()
  @Get(':game_id/participants')
  @ApiOkResponse({ type: PaginatedGameParticipantsResponseDto })
  @ApiNotFoundResponse({ description: 'No game exists with the given game_id.' })
  findParticipants(
    @Param('game_id', ParseIntPipe) gameId: number,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedGameParticipantsResponseDto> {
    return this.gamesService.findParticipants(gameId, query);
  }

  @Get(':game_id/me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MyGameParticipationResponseDto })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  findMyParticipation(
    @Param('game_id', ParseIntPipe) gameId: number,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<MyGameParticipationResponseDto> {
    return this.gamesService.findMyParticipation(gameId, user.userId);
  }

  // Deliberately NOT @Public() — the response is caller-scoped (`me`, `ranks`)
  // and userId comes only from the session, never from the path/query.
  @Get(':game_id/recap')
  @ApiBearerAuth()
  @ApiOkResponse({ type: RecapResponseDto })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  findRecap(
    @Param('game_id', ParseIntPipe) gameId: number,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<RecapResponseDto> {
    return this.recapService.getRecap(gameId, user.userId);
  }

  @Post(':game_id/join')
  @ApiBearerAuth()
  @ApiCreatedResponse({ type: UserGameResponseDto })
  @ApiNotFoundResponse({
    description: 'No game exists with the given game_id.',
  })
  join(
    @Param('game_id', ParseIntPipe) gameId: number,
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: JoinGameDto,
  ): Promise<UserGameResponseDto> {
    return this.gamesService.join(gameId, user.userId, dto.squad_id ?? null);
  }
}
