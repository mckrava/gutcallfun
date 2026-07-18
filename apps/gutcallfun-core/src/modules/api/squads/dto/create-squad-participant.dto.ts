import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** `squad_id` comes from the path, not the body. */
export class CreateSquadParticipantDto {
  @ApiProperty({ example: '00000000-0000-4000-8000-000000000003', format: 'uuid' })
  @IsUUID()
  user_id: string;
}
