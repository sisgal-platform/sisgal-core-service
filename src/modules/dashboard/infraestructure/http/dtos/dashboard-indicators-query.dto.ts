import { IsDateString, IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardIndicatorsQueryDto {
  @ApiPropertyOptional({
    description:
      'Inicio del período a consultar (YYYY-MM-DD). Si no se indica, se usa el primer día del mes actual.',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'El período inicial debe ser una fecha válida.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'El período inicial debe tener formato YYYY-MM-DD.',
  })
  periodoDesde?: string;

  @ApiPropertyOptional({
    description:
      'Fin del período a consultar (YYYY-MM-DD). Si no se indica, se usa el día actual.',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'El período final debe ser una fecha válida.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'El período final debe tener formato YYYY-MM-DD.',
  })
  periodoHasta?: string;
}
