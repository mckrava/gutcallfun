import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * D-02: wallet sign-in is bypassed entirely for this placeholder surface —
 * the caller simply asserts a wallet address and no signature is verified.
 * This shape is provisional: Phase 3 replaces `wallet_address` here with a
 * verified-signature auth flow, and this endpoint's request contract WILL
 * change at that point.
 */
export class CreateUserDto {
  @ApiProperty({
    example: 'GCMOCKWALLET0000000000000000000000000099',
    description:
      'Caller-asserted wallet address. No signature is verified in this phase — the wallet ' +
      'is trusted as given, a deliberate, temporary bypass of real wallet sign-in.',
  })
  @IsString()
  @IsNotEmpty()
  wallet_address: string;

  @ApiProperty({ example: 'mock_new_player' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  handle: string;

  @ApiPropertyOptional({ example: 'seed:mock-avatar-new-player', nullable: true })
  @IsOptional()
  @IsString()
  image?: string;
}
