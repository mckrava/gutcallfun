import { randomInt } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SquadEntity } from '../../../models/squad/squad.entity';
import { SquadParticipantEntity } from '../../../models/squad/squad-participant.entity';
import { UserEntity } from '../../../models/account/user.entity';
import { UserScoreProfileEntity } from '../../../models/account/user-score-profile.entity';
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

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const iso = (d: Date | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

@Injectable()
export class SquadsService {
  private readonly logger = new Logger(SquadsService.name);

  constructor(
    @InjectRepository(SquadEntity)
    private readonly squadsRepo: Repository<SquadEntity>,
    @InjectRepository(SquadParticipantEntity)
    private readonly participantsRepo: Repository<SquadParticipantEntity>,
    @InjectRepository(UserScoreProfileEntity)
    private readonly userProfilesRepo: Repository<UserScoreProfileEntity>,
  ) {}

  // `squad.id` has no DB default — allocate max+1 and retry on the rare PK race.
  async create(dto: CreateSquadDto, creatorUserId?: string): Promise<SquadResponseDto> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const max = await this.squadsRepo
        .createQueryBuilder('s')
        .select('COALESCE(MAX(s.id), 0)', 'max')
        .getRawOne<{ max: string }>();
      const id = Number(max?.max ?? 0) + 1;
      const squad = this.squadsRepo.create({
        id,
        name: dto.name,
        image: dto.image ?? null,
        emoji: dto.emoji ?? null,
        inviteCode: dto.invite_code ?? this.generateInviteCode(),
        active: true,
      });
      try {
        const saved = await this.squadsRepo.save(squad);
        if (creatorUserId) {
          await this.insertParticipant(saved.id, creatorUserId);
        }
        const row = await this.squadsRepo.findOne({ where: { id: saved.id } });
        return this.toResponseDto(row ?? saved, await this.countMembers(saved.id));
      } catch (err) {
        // Duplicate PK from a concurrent create — recompute max and retry.
        if (isUniqueViolation(err)) continue;
        throw err;
      }
    }
    throw new Error('Could not allocate a unique squad id');
  }

  async findOne(squadId: number): Promise<SquadResponseDto> {
    const squad = await this.findSquadOrThrow(squadId);
    return this.toResponseDto(squad, await this.countMembers(squadId));
  }

  // Join a squad by its shareable invite code — adds the caller as a participant.
  async joinByCode(inviteCode: string, userId: string): Promise<SquadResponseDto> {
    const squad = await this.squadsRepo.findOne({
      where: { inviteCode: inviteCode.trim() },
    });
    if (!squad) {
      throw new NotFoundException(`No squad with invite code "${inviteCode}"`);
    }
    await this.insertParticipant(squad.id, userId);
    return this.toResponseDto(squad, await this.countMembers(squad.id));
  }

  async findAll(query: ListSquadsQueryDto): Promise<PaginatedSquadsResponseDto> {
    const qb = this.squadsRepo
      .createQueryBuilder('s')
      .where('s.deletedAt IS NULL');
    if (query.participant_id) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM squad_participant sp WHERE sp.squad_id = s.id AND sp.user_id = :uid AND sp.active)',
        { uid: query.participant_id },
      );
    }
    qb.orderBy('s.id', 'ASC').skip(query.offset).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(
      rows.map(async (s) => this.toResponseDto(s, await this.countMembers(s.id))),
    );
    return { items, total, limit: query.limit, offset: query.offset };
  }

  private countMembers(squadId: number): Promise<number> {
    return this.participantsRepo.count({ where: { squadId, active: true } });
  }

  async addParticipant(
    squadId: number,
    dto: CreateSquadParticipantDto,
  ): Promise<SquadParticipantResponseDto> {
    await this.findSquadOrThrow(squadId);
    await this.insertParticipant(squadId, dto.user_id);
    const enriched = await this.enrichedParticipants(squadId, dto.user_id);
    return (
      enriched[0] ?? {
        squad_id: squadId,
        user_id: dto.user_id,
        active: true,
        handle: null,
        emoji: null,
        image: null,
        total_points: 0,
        score_profile: null,
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
    );
  }

  async findParticipants(
    squadId: number,
    query: PaginationQueryDto,
  ): Promise<PaginatedSquadParticipantsResponseDto> {
    await this.findSquadOrThrow(squadId);
    const total = await this.participantsRepo.count({ where: { squadId } });
    const items = await this.enrichedParticipants(
      squadId,
      undefined,
      query.limit,
      query.offset,
    );
    return { items, total, limit: query.limit, offset: query.offset };
  }

  // No squad_score_profile pipeline yet, so report a live aggregate of the
  // members' points — real, and more useful than a 404 for a fresh squad.
  async findScoreProfile(squadId: number): Promise<SquadScoreProfileResponseDto> {
    await this.findSquadOrThrow(squadId);
    const members = await this.enrichedParticipants(squadId);
    const total = members.reduce((sum, m) => sum + (m.total_points || 0), 0);
    return {
      id: `squad:${squadId}`,
      total_points: total,
      games_played: 0,
      updated_at: new Date().toISOString(),
    };
  }

  // --- helpers ---------------------------------------------------------------

  private async insertParticipant(squadId: number, userId: string): Promise<void> {
    // Composite PK (squad_id, user_id) makes re-adds idempotent.
    await this.participantsRepo
      .createQueryBuilder()
      .insert()
      .into(SquadParticipantEntity)
      .values({ squadId, userId, active: true, scoreProfile: null })
      .orIgnore()
      .execute();
  }

  // Join participant → user → user_score_profile so each member row carries its
  // handle / emoji / image / points. Ordered by points desc for the standings.
  private async enrichedParticipants(
    squadId: number,
    userId?: string,
    limit?: number,
    offset?: number,
  ): Promise<SquadParticipantResponseDto[]> {
    const qb = this.participantsRepo
      .createQueryBuilder('sp')
      .leftJoin(UserEntity, 'u', 'u.id = sp.user_id')
      .leftJoin(UserScoreProfileEntity, 'usp', 'usp.id = u.score_profile')
      .select([
        'sp.squad_id AS squad_id',
        'sp.user_id AS user_id',
        'sp.active AS active',
        'sp.score_profile AS score_profile',
        'sp.created_at AS created_at',
        'sp.deleted_at AS deleted_at',
        'u.handle AS handle',
        'u.emoji AS emoji',
        'u.image AS image',
        'COALESCE(usp.total_points, 0) AS total_points',
      ])
      .where('sp.squad_id = :squadId', { squadId });
    if (userId) qb.andWhere('sp.user_id = :userId', { userId });
    qb.orderBy('total_points', 'DESC').addOrderBy('sp.created_at', 'ASC');
    if (limit != null) qb.limit(limit);
    if (offset != null) qb.offset(offset);

    const rows = await qb.getRawMany<{
      squad_id: number;
      user_id: string;
      active: boolean;
      score_profile: string | null;
      created_at: Date;
      deleted_at: Date | null;
      handle: string | null;
      emoji: string | null;
      image: string | null;
      total_points: string | number;
    }>();

    return rows.map((r) => ({
      squad_id: Number(r.squad_id),
      user_id: r.user_id,
      active: r.active,
      handle: r.handle,
      emoji: r.emoji,
      image: r.image,
      total_points: Number(r.total_points),
      score_profile: r.score_profile,
      created_at: iso(r.created_at) as string,
      deleted_at: iso(r.deleted_at),
    }));
  }

  private generateInviteCode(): string {
    return Array.from(
      { length: 6 },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join('');
  }

  private async findSquadOrThrow(squadId: number): Promise<SquadEntity> {
    const squad = await this.squadsRepo.findOne({ where: { id: squadId } });
    if (!squad) throw new NotFoundException(`Squad ${squadId} not found`);
    return squad;
  }

  private toResponseDto(squad: SquadEntity, memberCount = 0): SquadResponseDto {
    return {
      id: squad.id,
      name: squad.name,
      image: squad.image ?? null,
      emoji: squad.emoji ?? null,
      member_count: memberCount,
      invite_code: squad.inviteCode ?? null,
      active: squad.active,
      created_at: iso(squad.createdAt) as string,
      updated_at: iso(squad.updatedAt),
      deleted_at: iso(squad.deletedAt),
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } } | null;
  return (e?.driverError?.code ?? e?.code) === '23505';
}
