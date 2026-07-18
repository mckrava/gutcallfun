import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListSquadsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000001',
    format: 'uuid',
    description: 'Squads this user belongs to.',
  })
  @IsOptional()
  @IsUUID()
  participant_id?: string;
}
