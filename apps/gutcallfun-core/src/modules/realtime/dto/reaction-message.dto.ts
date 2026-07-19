import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length } from 'class-validator';

/**
 * Client -> server `reaction` payload: an ephemeral squad emoji reaction.
 *
 * RELAY-ONLY — nothing here is persisted. The gateway stamps the authenticated
 * `user_id` (never trusted from the client) and fans the reaction out to the
 * game room; each client shows it only when `squad_id` matches its own picked
 * squad. `handle` / `avatar` are display-only fields carried for the receivers'
 * floating bubble, so no per-reaction DB lookup is needed.
 */
export class ReactionMessageDto {
  @ApiProperty({ type: 'integer', example: 22, description: 'The live game.' })
  @IsInt()
  game_id: number;

  @ApiProperty({
    type: 'integer',
    example: 1,
    description: 'The sender squad — receivers render only their own squad.',
  })
  @IsInt()
  squad_id: number;

  @ApiProperty({ example: '🔥', description: 'The reaction emoji.' })
  @IsString()
  @Length(1, 16)
  emoji: string;

  @ApiProperty({ example: 'gutcaller', description: 'Sender handle (display only).' })
  @IsString()
  @Length(1, 40)
  handle: string;

  @ApiProperty({ example: '🦊', description: 'Sender avatar emoji (display only).' })
  @IsString()
  @Length(1, 16)
  avatar: string;
}
