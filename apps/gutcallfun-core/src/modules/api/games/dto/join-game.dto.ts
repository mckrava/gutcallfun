import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID } from 'class-validator';

/**
 * D-02: no session exists this phase, so `user_id` arrives explicitly in the
 * body. This is a deliberately provisional shape — Phase 3 replaces this
 * parameter with the authenticated session, which will change this route's
 * signature and force a UI re-integration pass at that point (accepted cost,
 * recorded in 02.1-CONTEXT.md).
 */
export class JoinGameDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'PROVISIONAL: caller-supplied and unverified this phase (D-02). Phase 3 replaces this with the authenticated session.',
  })
  @IsUUID()
  user_id: string;

  @ApiPropertyOptional({ type: 'integer', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  squad_id?: number;
}
