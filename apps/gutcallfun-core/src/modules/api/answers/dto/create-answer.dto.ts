import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Phase 3: the answering user comes from the session (AUTH-03), so `user_id`
 * was removed from the body — a request still carrying it is rejected with a
 * 400 by the global `forbidNonWhitelisted` ValidationPipe. snake_case body
 * shape per RESEARCH.md Pattern 1.
 */
export class CreateAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  game_question_id: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  selected_option_id: string;
}
