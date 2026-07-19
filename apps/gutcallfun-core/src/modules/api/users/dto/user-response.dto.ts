import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';

/**
 * Wire-facing response shape for the `user` table. Property names are
 * declared literally in snake_case to match initial-db-structure.sql 1:1
 * (D-01) — this is a deliberate divergence from `UserEntity`'s camelCase
 * TypeScript properties, not an oversight (see 02.1-RESEARCH.md Pattern 1).
 */
export class UserResponseDto {
  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000001',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ example: 'GCMOCKWALLET0000000000000000000000000001' })
  wallet_address: string;

  @ApiProperty({
    example: 'GC-A1B2-C3D4',
    description: 'Crockford base32 share code, GC-XXXX-XXXX form.',
  })
  share_code: string;

  @ApiProperty({ example: 'mock_striker_09' })
  handle: string;

  @ApiProperty({ example: 'seed:mock-avatar-striker-09', nullable: true })
  image: string | null;

  @ApiProperty({
    example: 'usp_mock_0001',
    nullable: true,
    description:
      'FK pointing AT user_score_profile.id — null until the user has played a game.',
  })
  score_profile: string | null;

  @ApiProperty({ example: '2026-07-01T09:00:00.000Z' })
  created_at: string;

  @ApiProperty({ example: '2026-07-10T12:30:00.000Z', nullable: true })
  updated_at: string | null;
}

export class PaginatedUsersResponseDto extends PaginatedResponseDto<UserResponseDto> {
  @ApiProperty({ type: [UserResponseDto] })
  items: UserResponseDto[];
}
