import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Join a squad by its shareable invite code. The joining user is the session. */
export class JoinSquadDto {
  @ApiProperty({ example: 'GCSQ42' })
  @IsString()
  @IsNotEmpty()
  invite_code: string;
}
