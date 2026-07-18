import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  USER_SCORE_PROFILES_FIXTURE,
  USERS_FIXTURE,
  UserFixture,
} from '../../../mocks/fixtures/users.fixtures';
import { SQUAD_PARTICIPANTS_FIXTURE } from '../../../mocks/fixtures/squads.fixtures';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginatedUsersResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserScoreProfileResponseDto } from './dto/user-score-profile-response.dto';

// Fixed, deterministic defaults for the mock `create()` path (D-04) — this
// phase has no persistence, so a "new" user is a fixture-style literal
// derived from the request body, not a randomly-generated row.
const MOCK_NEW_USER_ID = '00000000-0000-4000-8000-000000000099';
const MOCK_NEW_USER_SHARE_CODE = 'GC-Z9Y8-X7W6';
const MOCK_NEW_USER_CREATED_AT = '2026-07-18T00:00:00.000Z';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  findAll(query: ListUsersQueryDto): PaginatedUsersResponseDto {
    let filtered: readonly UserFixture[] = USERS_FIXTURE;

    if (query.wallet_address) {
      filtered = filtered.filter((u) => u.wallet_address === query.wallet_address);
    }
    if (query.handle) {
      const needle = query.handle.toLowerCase();
      filtered = filtered.filter((u) => u.handle.toLowerCase().includes(needle));
    }
    if (query.squad_id !== undefined) {
      const memberIds = new Set(
        SQUAD_PARTICIPANTS_FIXTURE.filter((p) => p.squad_id === query.squad_id).map(
          (p) => p.user_id,
        ),
      );
      filtered = filtered.filter((u) => memberIds.has(u.id));
    }

    const total = filtered.length;
    const items = filtered.slice(query.offset, query.offset + query.limit);

    return {
      items: items.map((u) => this.toResponseDto(u)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  findOne(userId: string): UserResponseDto {
    const user = this.findUserOrThrow(userId);
    return this.toResponseDto(user);
  }

  create(dto: CreateUserDto): UserResponseDto {
    this.logger.log(`Mock-creating user for wallet ${dto.wallet_address}`);
    return {
      id: MOCK_NEW_USER_ID,
      wallet_address: dto.wallet_address,
      share_code: MOCK_NEW_USER_SHARE_CODE,
      handle: dto.handle,
      image: dto.image ?? null,
      score_profile: null,
      created_at: MOCK_NEW_USER_CREATED_AT,
      updated_at: null,
    };
  }

  update(userId: string, dto: UpdateUserDto): UserResponseDto {
    const user = this.findUserOrThrow(userId);
    return this.toResponseDto({
      ...user,
      handle: dto.handle ?? user.handle,
      image: dto.image !== undefined ? dto.image : user.image,
    });
  }

  findScoreProfile(userId: string): UserScoreProfileResponseDto {
    const user = this.findUserOrThrow(userId);
    if (!user.score_profile) {
      throw new NotFoundException(`User ${userId} has no score profile`);
    }
    const profile = USER_SCORE_PROFILES_FIXTURE.find((p) => p.id === user.score_profile);
    if (!profile) {
      throw new NotFoundException(`Score profile for user ${userId} not found`);
    }
    return { ...profile };
  }

  private findUserOrThrow(userId: string): UserFixture {
    const user = USERS_FIXTURE.find((u) => u.id === userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }

  private toResponseDto(user: UserFixture): UserResponseDto {
    return { ...user };
  }
}
