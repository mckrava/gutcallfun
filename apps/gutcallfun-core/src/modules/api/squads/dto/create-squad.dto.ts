import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The client does NOT supply `id` — `squad.id` has no database default (see
 * squads.fixtures.ts file-head note), so the service assigns it explicitly
 * via `nextSquadId()`.
 */
export class CreateSquadDto {
  @ApiProperty({ example: 'Mock Squad Gamma' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'seed:mock-squad-gamma', nullable: true })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: '🔥', description: 'Crest emoji.' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;

  @ApiPropertyOptional({ example: 'GCSQ-GAMMA3', nullable: true })
  @IsOptional()
  @IsString()
  invite_code?: string;
}
