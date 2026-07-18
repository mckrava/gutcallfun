import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

/**
 * The single client-to-server `subscribe` payload. `game_id` is validated
 * as an integer so a malformed or object-valued payload is rejected before
 * it reaches room-name interpolation (T-02.1-23).
 */
export class SubscribeDto {
  @ApiProperty({
    type: 'integer',
    example: 3,
    description: 'The game to join the room for.',
  })
  @IsInt()
  game_id: number;
}
