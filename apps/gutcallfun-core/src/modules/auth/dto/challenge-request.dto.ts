import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

// Base58 (no 0, O, I, l), 32–44 chars — the shape of a Solana public key.
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export class ChallengeRequestDto {
  @ApiProperty({
    example: 'CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq',
    description: 'Base58 Solana wallet address requesting a sign-in challenge.',
  })
  @IsString()
  @Matches(SOLANA_ADDRESS, {
    message: 'wallet_address must be a base58 Solana address',
  })
  wallet_address: string;
}
