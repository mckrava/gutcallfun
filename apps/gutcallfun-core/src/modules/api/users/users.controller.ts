import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import {
  PaginatedUsersResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserScoreProfileResponseDto } from './dto/user-score-profile-response.dto';
import { UsersService } from './users.service';

// AUTH-03: every route requires a session. User creation lives only in the
// auth module (/auth/register, verified wallet) — there is no unauthenticated
// POST /users. Mutating another user by id is not possible: self-edits go
// through /users/me. `:user_id` GETs remain for looking up other players.
// The /me routes are declared before the `:user_id` routes so "me" is never
// parsed as a UUID.
@Controller('users')
@ApiTags('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedUsersResponseDto })
  findAll(
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.usersService.findAll(query);
  }

  @Get('me')
  @ApiOperation({ summary: 'The authenticated user.' })
  @ApiOkResponse({ type: UserResponseDto })
  findMe(@CurrentUser() user: AuthPrincipal): Promise<UserResponseDto> {
    return this.usersService.findOne(user.userId);
  }

  @Get('me/score-profile')
  @ApiOkResponse({ type: UserScoreProfileResponseDto })
  @ApiNotFoundResponse({ description: 'The user has no score profile yet.' })
  findMyScoreProfile(
    @CurrentUser() user: AuthPrincipal,
  ): Promise<UserScoreProfileResponseDto> {
    return this.usersService.findScoreProfile(user.userId);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update the authenticated user (handle / avatar only).',
  })
  @ApiOkResponse({ type: UserResponseDto })
  updateMe(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(user.userId, dto);
  }

  @Get(':user_id')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'No user exists with the given id.' })
  findOne(
    @Param('user_id', ParseUUIDPipe) userId: string,
  ): Promise<UserResponseDto> {
    return this.usersService.findOne(userId);
  }

  @Get(':user_id/score-profile')
  @ApiOkResponse({ type: UserScoreProfileResponseDto })
  @ApiNotFoundResponse({
    description:
      'No user exists with the given id, or the user has no score profile yet.',
  })
  findScoreProfile(
    @Param('user_id', ParseUUIDPipe) userId: string,
  ): Promise<UserScoreProfileResponseDto> {
    return this.usersService.findScoreProfile(userId);
  }
}
