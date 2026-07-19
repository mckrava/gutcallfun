import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

/**
 * Phase 3: the joining user is taken from the session (AUTH-03), never the
 * body — `user_id` was removed here, so a body still carrying it is rejected
 * with a 400 by the global `forbidNonWhitelisted` ValidationPipe.
 */
export class JoinGameDto {
  @ApiPropertyOptional({ type: 'integer', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  squad_id?: number;
}
