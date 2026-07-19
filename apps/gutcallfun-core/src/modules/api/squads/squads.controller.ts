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
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CreateSquadParticipantDto } from './dto/create-squad-participant.dto';
import { CreateSquadDto } from './dto/create-squad.dto';
import { ListSquadsQueryDto } from './dto/list-squads-query.dto';
import {
  PaginatedSquadParticipantsResponseDto,
  SquadParticipantResponseDto,
} from './dto/squad-participant-response.dto';
import {
  PaginatedSquadsResponseDto,
  SquadResponseDto,
} from './dto/squad-response.dto';
import { SquadScoreProfileResponseDto } from './dto/squad-score-profile-response.dto';
import { SquadsService } from './squads.service';

// D-02: no auth anywhere on this controller. Update/delete routes are
// deliberately absent — see COVERAGE.md's OPT-OUT register (squad
// update/delete is roadmap/NICE scope, not v1).
@Controller('squads')
@ApiTags('squads')
export class SquadsController {
  constructor(private readonly squadsService: SquadsService) {}

  @Post()
  @ApiCreatedResponse({ type: SquadResponseDto })
  create(@Body() dto: CreateSquadDto): SquadResponseDto {
    return this.squadsService.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedSquadsResponseDto })
  findAll(@Query() query: ListSquadsQueryDto): PaginatedSquadsResponseDto {
    return this.squadsService.findAll(query);
  }

  @Get(':squad_id')
  @ApiOkResponse({ type: SquadResponseDto })
  @ApiNotFoundResponse({ description: 'No squad exists with the given id.' })
  findOne(@Param('squad_id', ParseIntPipe) squadId: number): SquadResponseDto {
    return this.squadsService.findOne(squadId);
  }

  @Post(':squad_id/participants')
  @ApiCreatedResponse({ type: SquadParticipantResponseDto })
  @ApiNotFoundResponse({ description: 'No squad exists with the given id.' })
  addParticipant(
    @Param('squad_id', ParseIntPipe) squadId: number,
    @Body() dto: CreateSquadParticipantDto,
  ): SquadParticipantResponseDto {
    return this.squadsService.addParticipant(squadId, dto);
  }

  @Get(':squad_id/participants')
  @ApiOkResponse({ type: PaginatedSquadParticipantsResponseDto })
  @ApiNotFoundResponse({ description: 'No squad exists with the given id.' })
  findParticipants(
    @Param('squad_id', ParseIntPipe) squadId: number,
    @Query() query: PaginationQueryDto,
  ): PaginatedSquadParticipantsResponseDto {
    return this.squadsService.findParticipants(squadId, query);
  }

  @Get(':squad_id/score-profile')
  @ApiOkResponse({ type: SquadScoreProfileResponseDto })
  @ApiNotFoundResponse({
    description:
      'No squad exists with the given id, or the squad has no score profile yet.',
  })
  findScoreProfile(
    @Param('squad_id', ParseIntPipe) squadId: number,
  ): SquadScoreProfileResponseDto {
    return this.squadsService.findScoreProfile(squadId);
  }
}
