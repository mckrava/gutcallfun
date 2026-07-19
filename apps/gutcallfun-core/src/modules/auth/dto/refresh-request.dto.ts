import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Shared by /auth/refresh and /auth/logout — both act on a refresh token. */
export class RefreshRequestDto {
  @ApiProperty({ description: 'An opaque refresh token from a prior sign-in.' })
  @IsString()
  refresh_token: string;
}
