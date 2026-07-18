import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';

/**
 * Wire-facing response shape for the `squad` table. Property names are
 * declared literally in snake_case to match initial-db-structure.sql 1:1
 * (D-01).
 */
export class SquadResponseDto {
  @ApiProperty({ type: 'integer', example: 1001 })
  id: number;

  @ApiProperty({ example: 'Mock Squad Alpha' })
  name: string;

  @ApiProperty({ example: 'seed:mock-squad-alpha', nullable: true })
  image: string | null;

  @ApiProperty({ example: 'GCSQ-ALPHA1', nullable: true })
  invite_code: string | null;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({ example: '2026-07-05T10:00:00.000Z' })
  created_at: string;

  @ApiProperty({ example: '2026-07-11T10:00:00.000Z', nullable: true })
  updated_at: string | null;

  @ApiProperty({ example: null, nullable: true })
  deleted_at: string | null;
}

export class PaginatedSquadsResponseDto extends PaginatedResponseDto<SquadResponseDto> {
  @ApiProperty({ type: [SquadResponseDto] })
  items: SquadResponseDto[];
}
