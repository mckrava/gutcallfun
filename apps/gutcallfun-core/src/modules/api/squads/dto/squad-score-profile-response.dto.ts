import { ApiProperty } from '@nestjs/swagger';

/**
 * Wire-facing shape for `squad_score_profile`. `squad_participant.score_profile`
 * points AT this row's `id` — the reversed FK direction noted throughout
 * this phase.
 */
export class SquadScoreProfileResponseDto {
  @ApiProperty({ example: 'ssp_mock_0001' })
  id: string;

  @ApiProperty({
    type: 'integer',
    example: 400,
    description:
      'SUM of points earned by members while representing this squad. Derived ' +
      'from user_game_answer joined through user_game.squad_id — NOT the sum of ' +
      "members' lifetime totals, since a user can play for several squads.",
  })
  total_points: number;

  @ApiProperty({
    type: 'integer',
    example: 80,
    description:
      "The squad's standing: total_points averaged over members who have played " +
      'at least one game FOR this squad (players-only denominator, so roster size ' +
      'cannot dilute the score). Rounded to an integer.',
  })
  avg_points: number;

  @ApiProperty({
    type: 'integer',
    example: 5,
    description:
      'Denominator behind avg_points — members who have played at least one game ' +
      'for this squad. Not the roster size.',
  })
  players_count: number;

  @ApiProperty({ type: 'integer', example: 6 })
  games_played: number;

  @ApiProperty({ example: '2026-07-11T10:00:00.000Z', nullable: true })
  updated_at: string | null;
}
