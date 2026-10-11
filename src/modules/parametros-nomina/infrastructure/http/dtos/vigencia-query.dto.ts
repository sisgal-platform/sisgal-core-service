import { IsDateString, IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class VigenciaQueryDto {
  @ApiPropertyOptional({
    description:
      'Fecha para la que se consulta la versión vigente (YYYY-MM-DD). Si no se proporciona, se usa la fecha actual.',
    example: '2026-10-11',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'La fecha debe ser una fecha válida.' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener formato YYYY-MM-DD.',
  })
  fecha?: string;
}
