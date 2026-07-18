import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../models/account/user.entity';
import { UserScoreProfileEntity } from '../../../models/account/user-score-profile.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginatedUsersResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserScoreProfileResponseDto } from './dto/user-score-profile-response.dto';

// Crockford base32: no I, L, O, U — unambiguous when read aloud or typed.
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SHARE_CODE_ATTEMPTS = 5;

/**
 * Narrows a thrown TypeORM error to the underlying pg error fields. TypeORM
 * wraps driver errors in QueryFailedError and exposes the original on
 * `driverError`, but also copies `code` onto itself on some paths — check both.
 */
function pgErrorOf(err: unknown): { code?: string; constraint?: string } {
  const e = err as
    | {
        code?: string;
        constraint?: string;
        driverError?: { code?: string; constraint?: string };
      }
    | null
    | undefined;
  return {
    code: e?.driverError?.code ?? e?.code,
    constraint: e?.driverError?.constraint ?? e?.constraint,
  };
}

const isUniqueViolation = (err: unknown, constraint?: string): boolean => {
  const { code, constraint: actual } = pgErrorOf(err);
  return code === '23505' && (constraint === undefined || actual === constraint);
};

/** timestamptz columns arrive as Date from pg; the wire contract is an ISO string. */
const toIso = (value: Date | string | null | undefined): string | null =>
  value == null ? null : new Date(value).toISOString();

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(UserScoreProfileEntity)
    private readonly scoreProfilesRepo: Repository<UserScoreProfileEntity>,
  ) {}

  async findAll(query: ListUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.usersRepo.createQueryBuilder('u');

    if (query.wallet_address) {
      qb.andWhere('u.walletAddress = :wallet', { wallet: query.wallet_address });
    }
    if (query.handle) {
      qb.andWhere('LOWER(u.handle) LIKE :handle', {
        handle: `%${query.handle.toLowerCase()}%`,
      });
    }
    if (query.squad_id !== undefined) {
      // squad_participant has no relation hanging off UserEntity, and
      // src/models is off-limits — an EXISTS subquery against the physical
      // table keeps this a single round trip without touching the entities.
      qb.andWhere(
        'EXISTS (SELECT 1 FROM squad_participant sp WHERE sp.user_id = u.id AND sp.squad_id = :squadId)',
        { squadId: query.squad_id },
      );
    }

    qb.orderBy('u.createdAt', 'ASC').addOrderBy('u.id', 'ASC').skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((row) => this.toResponseDto(row)),
      total,
      limit,
      offset,
    };
  }

  async findOne(userId: string): Promise<UserResponseDto> {
    return this.toResponseDto(await this.findUserOrThrow(userId));
  }

  /**
   * Wallet address is the identity key, so a repeat create for a wallet we
   * already know returns the existing row rather than 409-ing — the demo UI
   * can call this idempotently on every sign-in. A duplicate *handle* on a
   * different wallet is a genuine conflict and is surfaced as 409.
   *
   * No user_score_profile row is written here: `score_profile` stays NULL.
   * The leaderboard sums awarded_points off user_game_answer directly, so
   * nothing in the live loop depends on a profile row existing.
   */
  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepo.findOne({
      where: { walletAddress: dto.wallet_address },
    });
    if (existing) {
      this.logger.log(
        `Wallet ${dto.wallet_address} already registered — returning existing user`,
      );
      return this.toResponseDto(existing);
    }

    for (let attempt = 0; attempt < SHARE_CODE_ATTEMPTS; attempt++) {
      const user = this.usersRepo.create({
        walletAddress: dto.wallet_address,
        shareCode: this.generateShareCode(),
        handle: dto.handle,
        image: dto.image ?? null,
        scoreProfile: null,
      });

      try {
        const saved = await this.usersRepo.save(user);
        // Re-read so DB-side defaults (created_at) are authoritative rather
        // than whatever the INSERT happened to return.
        const row = await this.usersRepo.findOne({ where: { id: saved.id } });
        return this.toResponseDto(row ?? saved);
      } catch (err) {
        if (isUniqueViolation(err, 'uq_user_share_code')) {
          continue; // regenerate and retry
        }
        if (isUniqueViolation(err, 'uq_user_handle')) {
          throw new ConflictException(`Handle "${dto.handle}" is already taken`);
        }
        if (isUniqueViolation(err, 'uq_user_wallet')) {
          // Lost a race with a concurrent create for the same wallet.
          const raced = await this.usersRepo.findOne({
            where: { walletAddress: dto.wallet_address },
          });
          if (raced) return this.toResponseDto(raced);
        }
        throw err;
      }
    }

    throw new ConflictException(
      `Could not allocate a unique share code after ${SHARE_CODE_ATTEMPTS} attempts`,
    );
  }

  async update(userId: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.findUserOrThrow(userId);

    if (dto.handle !== undefined) user.handle = dto.handle;
    if (dto.image !== undefined) user.image = dto.image ?? null;
    user.updatedAt = new Date();

    try {
      await this.usersRepo.save(user);
    } catch (err) {
      if (isUniqueViolation(err, 'uq_user_handle')) {
        throw new ConflictException(`Handle "${dto.handle}" is already taken`);
      }
      throw err;
    }

    return this.toResponseDto(user);
  }

  async findScoreProfile(userId: string): Promise<UserScoreProfileResponseDto> {
    const user = await this.findUserOrThrow(userId);
    if (!user.scoreProfile) {
      throw new NotFoundException(`User ${userId} has no score profile`);
    }

    const profile = await this.scoreProfilesRepo.findOne({
      where: { id: user.scoreProfile },
    });
    if (!profile) {
      throw new NotFoundException(`Score profile for user ${userId} not found`);
    }

    return {
      id: profile.id,
      // total_points is bigint — the pg driver returns it as a string.
      // Coerce, or the wire type silently flips from number to string.
      total_points: Number(profile.totalPoints),
      games_played: profile.gamesPlayed,
      updated_at: toIso(profile.updatedAt),
    };
  }

  private generateShareCode(): string {
    const block = (): string =>
      Array.from(
        { length: 4 },
        () => CROCKFORD_ALPHABET[randomInt(CROCKFORD_ALPHABET.length)],
      ).join('');
    return `GC-${block()}-${block()}`;
  }

  private async findUserOrThrow(userId: string): Promise<UserEntity> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }

  private toResponseDto(user: UserEntity): UserResponseDto {
    return {
      id: user.id,
      wallet_address: user.walletAddress,
      share_code: user.shareCode,
      handle: user.handle,
      image: user.image ?? null,
      score_profile: user.scoreProfile ?? null,
      created_at: toIso(user.createdAt) as string,
      updated_at: toIso(user.updatedAt),
    };
  }
}
