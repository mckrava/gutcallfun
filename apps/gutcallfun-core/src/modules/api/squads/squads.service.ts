import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  nextSquadId,
  SQUAD_PARTICIPANTS_FIXTURE,
  SQUAD_SCORE_PROFILES_FIXTURE,
  SQUADS_FIXTURE,
  SquadFixture,
  SquadParticipantFixture,
} from '../../../mocks/fixtures/squads.fixtures';
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

// Fixed, deterministic defaults for the mock `create()` path (D-04) — no
// persistence this phase, so a "new" squad is a fixture-style literal
// derived from the request body, not a randomly-generated row.
const MOCK_NEW_SQUAD_CREATED_AT = '2026-07-18T00:00:00.000Z';
const MOCK_NEW_PARTICIPANT_CREATED_AT = '2026-07-18T00:00:00.000Z';

@Injectable()
export class SquadsService {
  private readonly logger = new Logger(SquadsService.name);

  create(dto: CreateSquadDto): SquadResponseDto {
    const id = nextSquadId();
    this.logger.log(`Mock-creating squad ${id} (${dto.name})`);
    return {
      id,
      name: dto.name,
      image: dto.image ?? null,
      invite_code: dto.invite_code ?? null,
      active: true,
      created_at: MOCK_NEW_SQUAD_CREATED_AT,
      updated_at: null,
      deleted_at: null,
    };
  }

  findOne(squadId: number): SquadResponseDto {
    return this.toResponseDto(this.findSquadOrThrow(squadId));
  }

  findAll(query: ListSquadsQueryDto): PaginatedSquadsResponseDto {
    let filtered: readonly SquadFixture[] = SQUADS_FIXTURE;

    if (query.participant_id) {
      const squadIds = new Set(
        SQUAD_PARTICIPANTS_FIXTURE.filter(
          (p) => p.user_id === query.participant_id,
        ).map((p) => p.squad_id),
      );
      filtered = filtered.filter((s) => squadIds.has(s.id));
    }

    const total = filtered.length;
    const items = filtered.slice(query.offset, query.offset + query.limit);

    return {
      items: items.map((s) => this.toResponseDto(s)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  addParticipant(
    squadId: number,
    dto: CreateSquadParticipantDto,
  ): SquadParticipantResponseDto {
    this.findSquadOrThrow(squadId);
    this.logger.log(
      `Mock-adding participant ${dto.user_id} to squad ${squadId}`,
    );
    return {
      squad_id: squadId,
      user_id: dto.user_id,
      active: true,
      score_profile: null,
      created_at: MOCK_NEW_PARTICIPANT_CREATED_AT,
      deleted_at: null,
    };
  }

  findParticipants(
    squadId: number,
    query: PaginationQueryDto,
  ): PaginatedSquadParticipantsResponseDto {
    this.findSquadOrThrow(squadId);
    const filtered = SQUAD_PARTICIPANTS_FIXTURE.filter(
      (p) => p.squad_id === squadId,
    );

    const total = filtered.length;
    const items = filtered.slice(query.offset, query.offset + query.limit);

    return {
      items: items.map((p) => this.toParticipantResponseDto(p)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  findScoreProfile(squadId: number): SquadScoreProfileResponseDto {
    this.findSquadOrThrow(squadId);
    // The FK points from the participant AT the profile, not the other way
    // round — resolve via whichever of this squad's participants references
    // a score_profile, rather than looking up a profile keyed by squad id.
    const referencing = SQUAD_PARTICIPANTS_FIXTURE.find(
      (p) => p.squad_id === squadId && p.score_profile,
    );
    if (!referencing?.score_profile) {
      throw new NotFoundException(`Squad ${squadId} has no score profile`);
    }
    const profile = SQUAD_SCORE_PROFILES_FIXTURE.find(
      (p) => p.id === referencing.score_profile,
    );
    if (!profile) {
      throw new NotFoundException(
        `Score profile for squad ${squadId} not found`,
      );
    }
    return { ...profile };
  }

  private findSquadOrThrow(squadId: number): SquadFixture {
    const squad = SQUADS_FIXTURE.find((s) => s.id === squadId);
    if (!squad) {
      throw new NotFoundException(`Squad ${squadId} not found`);
    }
    return squad;
  }

  private toResponseDto(squad: SquadFixture): SquadResponseDto {
    return { ...squad };
  }

  private toParticipantResponseDto(
    participant: SquadParticipantFixture,
  ): SquadParticipantResponseDto {
    return { ...participant };
  }
}
