import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SQUADS_FIXTURE } from '../../../mocks/fixtures/squads.fixtures';
import { CreateSquadDto } from './dto/create-squad.dto';
import { ListSquadsQueryDto } from './dto/list-squads-query.dto';
import { SquadsService } from './squads.service';

const UNKNOWN_SQUAD_ID = 999999;
// squad 1002 in squads.fixtures.ts deliberately has zero participants.
const EMPTY_SQUAD_ID = 1002;

function baseListQuery(
  overrides: Partial<ListSquadsQueryDto> = {},
): ListSquadsQueryDto {
  const query = new ListSquadsQueryDto();
  query.limit = 20;
  query.offset = 0;
  return Object.assign(query, overrides);
}

function basePaginationQuery(): PaginationQueryDto {
  const query = new PaginationQueryDto();
  query.limit = 20;
  query.offset = 0;
  return query;
}

describe('SquadsService', () => {
  let service: SquadsService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [SquadsService],
    }).compile();

    service = moduleRef.get(SquadsService);
  });

  it('create returns an id strictly greater than the highest fixture id, never undefined/null', () => {
    const highestFixtureId = Math.max(...SQUADS_FIXTURE.map((s) => s.id));
    const dto: CreateSquadDto = { name: 'Mock Squad New' };
    const squad = service.create(dto);
    expect(squad.id).not.toBeUndefined();
    expect(squad.id).not.toBeNull();
    expect(squad.id).toBeGreaterThan(highestFixtureId);
  });

  it('findOne on an unknown id throws NotFoundException', () => {
    expect(() => service.findOne(UNKNOWN_SQUAD_ID)).toThrow(NotFoundException);
  });

  it('findParticipants on the empty fixture squad returns an empty items array with total 0', () => {
    const result = service.findParticipants(
      EMPTY_SQUAD_ID,
      basePaginationQuery(),
    );
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('two successive findAll({}) calls are deeply equal (D-04 determinism)', () => {
    const first = service.findAll(baseListQuery());
    const second = service.findAll(baseListQuery());
    expect(first).toEqual(second);
  });
});
