import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListPayrollPeriodQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra por el identificador del empleado',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @ApiPropertyOptional({
    description: 'Filtra liquidaciones cuyo período inicie en esta fecha o después',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({
    description: 'Filtra liquidaciones cuyo período inicie en esta fecha o antes',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}
