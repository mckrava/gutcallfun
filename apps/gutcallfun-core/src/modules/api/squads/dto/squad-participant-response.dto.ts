import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';

/**
 * Wire-facing shape for `squad_participant`. There is no surrogate id — the
 * primary key is the composite `(squad_id, user_id)` per
 * initial-db-structure.sql, so this DTO does not invent an `id` property.
 */
export class SquadParticipantResponseDto {
  @ApiProperty({ type: 'integer', example: 1001 })
  squad_id: number;

  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000001',
    format: 'uuid',
  })
  user_id: string;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({
    example: 'ssp_mock_0001',
    nullable: true,
    description: 'FK pointing AT squad_score_profile.id.',
  })
  score_profile: string | null;

  @ApiProperty({ example: '2026-07-05T10:05:00.000Z' })
  created_at: string;

  @ApiProperty({ example: null, nullable: true })
  deleted_at: string | null;
}

export class PaginatedSquadParticipantsResponseDto extends PaginatedResponseDto<SquadParticipantResponseDto> {
  @ApiProperty({ type: [SquadParticipantResponseDto] })
  items: SquadParticipantResponseDto[];
}
