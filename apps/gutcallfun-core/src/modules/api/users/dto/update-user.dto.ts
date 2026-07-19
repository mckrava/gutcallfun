import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * T-02.1-07: exactly two mutable fields. Combined with the global
 * `ValidationPipe({ forbidNonWhitelisted: true })`, a body additionally
 * carrying `wallet_address`, `id`, `share_code`, or `score_profile` is
 * rejected with a 400 rather than silently applied. Do not add any other
 * property to this class.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'mock_striker_09_updated' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  handle?: string;

  @ApiPropertyOptional({
    example: 'seed:mock-avatar-striker-09-v2',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  image?: string;
}
