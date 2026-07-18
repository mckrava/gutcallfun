import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * `game_event` is an append-only log ordered by its own monotonic `seq`
 * column (`UNIQUE(game_id, seq)`), not by insertion offset — offset paging
 * can skip or duplicate rows once a live game keeps writing. `after_seq`
 * uses a seq cursor instead of `offset` for exactly that reason.
 */
export class ListGameEventsQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    description:
      'Return only events whose seq is strictly greater than this value. Omit to start from the beginning of the log.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after_seq?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Maximum number of events to return (1-100, default 20).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
