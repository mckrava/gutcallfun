import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Mirrors `user_game`: composite primary key `(game_id, user_id)` — no
 * surrogate `id` property, matching the entity (`UserGameEntity` has no
 * `@PrimaryGeneratedColumn`).
 */
export class UserGameResponseDto {
  @ApiProperty({ type: 'integer', example: 3 })
  game_id: number;

  @ApiProperty({ format: 'uuid' })
  user_id: string;

  @ApiPropertyOptional({ type: 'integer', nullable: true, example: 10 })
  squad_id: number | null;

  @ApiProperty({ example: '2026-07-18T15:40:00.000Z' })
  joined_at: string;
}
