import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../api/users/dto/user-response.dto';

/** The token pair returned by /auth/refresh (and embedded in a full session). */
export class SessionTokensDto {
  @ApiProperty({
    description: 'Short-lived JWT to send as `Authorization: Bearer <token>`.',
  })
  access_token: string;

  @ApiProperty({
    description:
      'Opaque token used to obtain a new access token via /auth/refresh.',
  })
  refresh_token: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  token_type: 'Bearer';

  @ApiProperty({
    example: 900,
    description: 'Access-token lifetime in seconds.',
  })
  expires_in: number;
}

/** A completed sign-in: tokens plus the resolved user. */
export class AuthenticatedResponseDto extends SessionTokensDto {
  @ApiProperty({ enum: ['authenticated'], example: 'authenticated' })
  status: 'authenticated';

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}

/** A first-time wallet: no user yet, sign-in must finish via /auth/register. */
export class RegistrationRequiredResponseDto {
  @ApiProperty({
    enum: ['registration_required'],
    example: 'registration_required',
  })
  status: 'registration_required';

  @ApiProperty({
    description: 'Short-lived token proving the wallet was just verified.',
  })
  registration_token: string;

  @ApiProperty({ example: 'CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq' })
  wallet_address: string;
}

/** /auth/logout acknowledgement. */
export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}
