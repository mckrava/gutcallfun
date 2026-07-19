import { ApiProperty } from '@nestjs/swagger';

/**
 * Wire-facing shape for `user_score_profile`. `user.score_profile` points AT
 * this row's `id` — the reversed FK direction noted throughout this phase.
 */
export class UserScoreProfileResponseDto {
  @ApiProperty({ example: 'usp_mock_0001' })
  id: string;

  @ApiProperty({
    type: 'integer',
    example: 245,
    description:
      'Postgres bigint column. The mock returns a JSON integer; Phase 5 must coerce the pg ' +
      "driver's string bigint return into a number so this wire type does not change.",
  })
  total_points: number;

  @ApiProperty({ type: 'integer', example: 5 })
  games_played: number;

  @ApiProperty({ example: '2026-07-10T12:30:00.000Z', nullable: true })
  updated_at: string | null;
}
