import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterRequestDto {
  @ApiProperty({
    description:
      'The registration_token returned by /auth/verify for a first-time wallet.',
  })
  @IsString()
  registration_token: string;

  @ApiProperty({ example: 'gutcaller', description: 'Chosen unique handle.' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  handle: string;

  @ApiPropertyOptional({
    example: 'seed:mock-avatar-new-player',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  image?: string;
}
