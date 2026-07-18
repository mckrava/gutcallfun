import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'GCMOCKWALLET0000000000000000000000000001' })
  @IsOptional()
  @IsString()
  wallet_address?: string;

  @ApiPropertyOptional({ example: 'mock_striker_09' })
  @IsOptional()
  @IsString()
  handle?: string;

  @ApiPropertyOptional({
    type: 'integer',
    example: 1001,
    description: '"My teammates" filter — resolves through squad_participant.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  squad_id?: number;
}
