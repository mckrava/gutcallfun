import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export class VerifyRequestDto {
  @ApiProperty({ example: 'CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq' })
  @IsString()
  @Matches(SOLANA_ADDRESS, {
    message: 'wallet_address must be a base58 Solana address',
  })
  wallet_address: string;

  // The nonce is an opaque, server-issued handle (base64url), not base58 — it is
  // only ever looked up in the challenge store, so a non-empty string is the
  // right constraint; an unknown/malformed value simply fails the lookup (401).
  @ApiProperty({ description: 'The nonce returned by /auth/challenge.' })
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @ApiProperty({
    description: 'Base58 ed25519 signature over the challenge message.',
  })
  @IsString()
  @Matches(BASE58, { message: 'signature must be base58' })
  signature: string;
}
