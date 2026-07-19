import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * `GET /games/:game_id/recap` — the post-match EKG page, assembled entirely
 * from Postgres for a FINISHED game. Field names/nesting mirror the wire
 * contract the UI's `useRecapData` hook consumes verbatim; see
 * `recap.service.ts` for the read-side design (minute derivation, pressure
 * downsampling, rank sharing with LeaderboardService).
 */
export class RecapGameDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiPropertyOptional({ example: 'Brazil', nullable: true })
  team1_name: string | null;

  @ApiPropertyOptional({ example: 'Argentina', nullable: true })
  team2_name: string | null;

  @ApiProperty({ type: 'integer', example: 1 })
  score_p1: number;

  @ApiProperty({ type: 'integer', example: 1 })
  score_p2: number;

  @ApiProperty({
    example: 'finished',
    enum: ['scheduled', 'live', 'finished', 'cancelled'],
  })
  status: string;

  @ApiPropertyOptional({ example: '#FFD700', nullable: true })
  team1_jersey_color: string | null;

  @ApiPropertyOptional({ example: '#FFFFFF', nullable: true })
  team2_jersey_color: string | null;

  @ApiProperty({
    example: true,
    description: 'Tug-of-war direction: whether participant1 is the home side.',
  })
  participant1_is_home: boolean;

  @ApiPropertyOptional({ example: 'World Cup 2026', nullable: true })
  competition: string | null;
}

export class RecapBestCallDto {
  @ApiProperty({
    type: 'number',
    nullable: true,
    example: 34.5,
    description:
      'Match minute the call was triggered at, or null when its trigger event carries no derivable minute.',
  })
  minute: number | null;

  @ApiProperty({ type: 'integer', example: 15 })
  points: number;

  @ApiProperty({ example: 'Will this attack end in a shot?' })
  content: string;
}

export class RecapMeDto {
  @ApiProperty({ type: 'integer', example: 45 })
  total_points: number;

  @ApiProperty({ type: 'integer', example: 12 })
  answered: number;

  @ApiProperty({ type: 'integer', example: 9 })
  resolved: number;

  @ApiProperty({
    type: 'integer',
    example: 3,
    description:
      'Answers whose picked outcome exactly matched the resolved outcome.',
  })
  exact: number;

  @ApiProperty({ type: 'integer', example: 1 })
  voided: number;

  @ApiProperty({
    type: 'number',
    example: 0.67,
    description: '0 (not NaN) when nothing has resolved yet.',
  })
  hit_rate: number;

  @ApiProperty({ type: () => RecapBestCallDto, nullable: true })
  best_call: RecapBestCallDto | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 3 })
  squad_id: number | null;

  @ApiProperty({ nullable: true, example: 'The Ultras' })
  squad_name: string | null;
}

export class RecapRankDto {
  @ApiProperty({ type: 'integer', example: 4 })
  rank: number;

  @ApiProperty({ type: 'integer', example: 87 })
  of: number;
}

export class RecapRanksDto {
  @ApiProperty({
    type: () => RecapRankDto,
    nullable: true,
    description: 'Always present for any registered caller.',
  })
  global: RecapRankDto | null;

  @ApiProperty({
    type: () => RecapRankDto,
    nullable: true,
    description: 'Null when the caller never joined this game.',
  })
  game: RecapRankDto | null;

  @ApiProperty({
    type: () => RecapRankDto,
    nullable: true,
    description:
      'Null when the caller joined this game solo (user_game.squad_id IS NULL).',
  })
  squad: RecapRankDto | null;
}

export class RecapGoalDto {
  @ApiProperty({ type: 'number', nullable: true, example: 23.4 })
  minute: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true, example: 1 })
  participant: number | null;

  @ApiProperty({ type: 'integer', example: 1 })
  score_p1: number;

  @ApiProperty({ type: 'integer', example: 0 })
  score_p2: number;
}

export class RecapCallDto {
  @ApiProperty({ type: 'number', nullable: true, example: 34.5 })
  minute: number | null;

  @ApiProperty({ example: 'Will this attack end in a shot?' })
  question_content: string;

  @ApiPropertyOptional({ type: 'integer', nullable: true, example: 1 })
  participant: number | null;

  @ApiProperty({ example: 'shot' })
  picked_outcome: string;

  @ApiProperty({ nullable: true, example: 'danger' })
  actual_outcome: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 15 })
  awarded_points: number | null;

  @ApiProperty({ nullable: true, example: false })
  successful_outcome: boolean | null;

  @ApiProperty({
    example: 'resolved',
    enum: ['open', 'pending_confirmation', 'resolved', 'voided'],
  })
  state: string;
}

export class RecapPressurePointDto {
  @ApiProperty({ type: 'number', example: 12.5 })
  minute: number;

  @ApiProperty({
    type: 'number',
    example: 0.67,
    description:
      'Positive for participant1 pressure, negative for participant2, in the -1..1 range the chart plots directly.',
  })
  value: number;
}

export class RecapResponseDto {
  @ApiProperty({ type: () => RecapGameDto })
  game: RecapGameDto;

  @ApiProperty({ type: () => RecapMeDto })
  me: RecapMeDto;

  @ApiProperty({ type: () => RecapRanksDto })
  ranks: RecapRanksDto;

  @ApiProperty({ type: () => RecapGoalDto, isArray: true })
  goals: RecapGoalDto[];

  @ApiProperty({ type: () => RecapCallDto, isArray: true })
  calls: RecapCallDto[];

  @ApiProperty({ type: () => RecapPressurePointDto, isArray: true })
  pressure: RecapPressurePointDto[];
}
