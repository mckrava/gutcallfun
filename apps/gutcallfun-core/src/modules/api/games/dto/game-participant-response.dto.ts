import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';

/** A user who has joined a game (from `user_game`, enriched with the profile). */
export class GameParticipantResponseDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  user_id: string;

  @ApiProperty({ example: 'goal_hunter_42', nullable: true })
  handle: string | null;

  @ApiProperty({ example: '🦊', nullable: true })
  emoji: string | null;

  @ApiProperty({ example: null, nullable: true })
  image: string | null;

  @ApiProperty({ example: '2026-07-19T00:47:28.000Z' })
  joined_at: string;
}

export class PaginatedGameParticipantsResponseDto extends PaginatedResponseDto<GameParticipantResponseDto> {
  @ApiProperty({ type: [GameParticipantResponseDto] })
  items: GameParticipantResponseDto[];
}
