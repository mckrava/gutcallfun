import { ApiProperty } from '@nestjs/swagger';

export class ChallengeResponseDto {
  @ApiProperty({
    description:
      'The exact SIWS message the wallet must sign with signMessage. Sign these bytes verbatim.',
    example:
      'gutcall.fun wants you to sign in with your Solana account:\nCuieVDE…\n\nSign in to GutCall…',
  })
  message: string;

  @ApiProperty({
    description: 'Opaque single-use challenge id, echoed back on /auth/verify.',
    example: 'k3Jd9f2a_XyZ0b1c2d3e4F5g6H7i8J9k',
  })
  nonce: string;

  @ApiProperty({ example: '2026-07-18T00:05:00.000Z' })
  expires_at: string;
}
