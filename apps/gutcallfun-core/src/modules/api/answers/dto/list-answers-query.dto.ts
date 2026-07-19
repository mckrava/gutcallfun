import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

/**
 * Phase 3: results are scoped to the authenticated caller (AUTH-03), so there
 * is no `user_id` filter — a listing is always "my answers", optionally
 * narrowed to one game.
 */
export class ListAnswersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: 'integer', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  game_id?: number;
}
