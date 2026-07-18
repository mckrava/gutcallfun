import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginatedUsersResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserScoreProfileResponseDto } from './dto/user-score-profile-response.dto';
import { UsersService } from './users.service';

// D-02: no auth anywhere on this controller — every route is unauthenticated
// unauthenticated surface, now backed by real Postgres rows. See T-02.1-11
// in the phase threat model for the accepted-risk rationale.
@Controller('users')
@ApiTags('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedUsersResponseDto })
  findAll(@Query() query: ListUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    return this.usersService.findAll(query);
  }

  @Get(':user_id')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'No user exists with the given id.' })
  findOne(@Param('user_id', ParseUUIDPipe) userId: string): Promise<UserResponseDto> {
    return this.usersService.findOne(userId);
  }

  @Post()
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Patch(':user_id')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'No user exists with the given id.' })
  update(
    @Param('user_id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(userId, dto);
  }

  @Get(':user_id/score-profile')
  @ApiOkResponse({ type: UserScoreProfileResponseDto })
  @ApiNotFoundResponse({
    description: 'No user exists with the given id, or the user has no score profile yet.',
  })
  findScoreProfile(
    @Param('user_id', ParseUUIDPipe) userId: string,
  ): Promise<UserScoreProfileResponseDto> {
    return this.usersService.findScoreProfile(userId);
  }
}
