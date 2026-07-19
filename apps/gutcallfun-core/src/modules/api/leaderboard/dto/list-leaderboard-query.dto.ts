import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

/**
 * Two optional filters produce all four leaderboards:
 *
 * |  game_id |  squad_id | board                                     |
 * |----------|-----------|-------------------------------------------|
 * |  absent  |  absent   | global, every user on the platform        |
 * |  absent  |  set      | global, members of one squad              |
 * |  set     |  absent   | one game, every participant               |
 * |  set     |  set      | one game, one squad's participants        |
 */
export class ListLeaderboardQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    example: 10,
    description:
      'Restrict to points awarded in this game. Omit for lifetime totals.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  game_id?: number;

  @ApiPropertyOptional({
    type: 'integer',
    example: 3,
    description:
      'Restrict to this squad. Only points earned while REPRESENTING this squad ' +
      '(user_game.squad_id) count — a user who joined the same game solo, or for a ' +
      'different squad, contributes nothing here and does not appear on the board.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  squad_id?: number;
}
