import { ApiProperty } from '@nestjs/swagger';
import { GameEventResponseDto } from './game-event-response.dto';

/**
 * Seq-cursor response envelope for `GET /games/:game_id/events`. `next_seq`
 * is the seq of the last item in this page, or null when the page reached
 * the end of the log — an `after_seq` beyond the highest seq in the log is
 * the normal "caught up" state a polling client hits constantly, so this
 * case is an HTTP 200 with an empty `items` array and `next_seq: null`,
 * never a 404.
 */
export class GameEventPageDto {
  @ApiProperty({ type: () => GameEventResponseDto, isArray: true })
  items: GameEventResponseDto[];

  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: 12,
    description:
      'The seq of the last event in this page, or null when the log has no further events past this page.',
  })
  next_seq: number | null;
}
