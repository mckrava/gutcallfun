import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UsersService } from './users.service';

const KNOWN_USER_ID = '00000000-0000-4000-8000-000000000001';
const ABSENT_USER_ID = '00000000-0000-4000-8000-00000000ffff';
// squad 1002 in squads.fixtures.ts deliberately has zero participants.
const EMPTY_SQUAD_ID = 1002;

function baseQuery(overrides: Partial<ListUsersQueryDto> = {}): ListUsersQueryDto {
  const query = new ListUsersQueryDto();
  query.limit = 20;
  query.offset = 0;
  return Object.assign(query, overrides);
}

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('findOne on a known fixture id returns an object with wallet_address and share_code', () => {
    const user = service.findOne(KNOWN_USER_ID);
    expect(Object.keys(user)).toEqual(
      expect.arrayContaining(['wallet_address', 'share_code']),
    );
  });

  it('findOne on an absent uuid throws NotFoundException', () => {
    expect(() => service.findOne(ABSENT_USER_ID)).toThrow(NotFoundException);
  });

  it('two successive findAll({}) calls produce deeply-equal results (D-04 determinism)', () => {
    const first = service.findAll(baseQuery());
    const second = service.findAll(baseQuery());
    expect(first).toEqual(second);
  });

  it('a squad_id filter for the empty squad returns items as an empty array with total 0', () => {
    const result = service.findAll(baseQuery({ squad_id: EMPTY_SQUAD_ID }));
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('findScoreProfile throws NotFoundException for a user with a null score_profile', () => {
    // user 3 (...0003) in users.fixtures.ts deliberately has score_profile: null
    expect(() =>
      service.findScoreProfile('00000000-0000-4000-8000-000000000003'),
    ).toThrow(NotFoundException);
  });
});
