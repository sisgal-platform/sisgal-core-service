import { Type } from 'class-transformer';
import { IsDateString, IsInt, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RegistrarJornadaLaboralCommand } from '../../../application/commands/workday-config.commands';

/** Hora del día en formato de 24 horas HH:mm. */
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const HORAS_POR_DIA = 24;
const HORAS_POR_SEMANA = 168;

export class RegisterWorkdayConfigDto implements RegistrarJornadaLaboralCommand {
  @ApiProperty({
    description: 'Máximo de horas ordinarias por semana',
    example: 44,
    minimum: 1,
    maximum: HORAS_POR_SEMANA,
  })
  @Type(() => Number)
  @IsInt({
    message:
      'La jornada máxima semanal es obligatoria y debe ser un número entero de horas.',
  })
  @Min(1, { message: 'La jornada máxima semanal debe ser de al menos 1 hora.' })
  @Max(HORAS_POR_SEMANA, {
    message: `La jornada máxima semanal no puede superar las ${HORAS_POR_SEMANA} horas.`,
  })
  maxWeekHours!: number;

  @ApiProperty({
    description: 'Máximo de horas ordinarias por día',
    example: 8,
    minimum: 1,
    maximum: HORAS_POR_DIA,
  })
  @Type(() => Number)
  @IsInt({
    message:
      'La jornada máxima diaria es obligatoria y debe ser un número entero de horas.',
  })
  @Min(1, { message: 'La jornada máxima diaria debe ser de al menos 1 hora.' })
  @Max(HORAS_POR_DIA, {
    message: `La jornada máxima diaria no puede superar las ${HORAS_POR_DIA} horas.`,
  })
  maxDayHours!: number;

  @ApiProperty({
    description: 'Hora en que inicia la jornada diurna (HH:mm)',
    example: '06:00',
  })
  @Matches(HORA_REGEX, {
    message:
      'El inicio de la jornada diurna es obligatorio y debe tener formato HH:mm.',
  })
  dayStart!: string;

  @ApiProperty({
    description: 'Hora en que termina la jornada diurna (HH:mm)',
    example: '21:00',
  })
  @Matches(HORA_REGEX, {
    message:
      'El fin de la jornada diurna es obligatorio y debe tener formato HH:mm.',
  })
  dayEnd!: string;

  @ApiProperty({
    description: 'Hora en que inicia la jornada nocturna (HH:mm)',
    example: '21:00',
  })
  @Matches(HORA_REGEX, {
    message:
      'El inicio de la jornada nocturna es obligatorio y debe tener formato HH:mm.',
  })
  nightStart!: string;

  @ApiProperty({
    description: 'Hora en que termina la jornada nocturna (HH:mm)',
    example: '06:00',
  })
  @Matches(HORA_REGEX, {
    message:
      'El fin de la jornada nocturna es obligatorio y debe tener formato HH:mm.',
  })
  nightEnd!: string;

  @ApiProperty({
    description:
      'Fecha desde la que rige la nueva versión (YYYY-MM-DD). No puede ser anterior a la fecha actual.',
    example: '2026-11-01',
    type: String,
    format: 'date',
  })
  @IsDateString(
    { strict: true },
    {
      message:
        'La fecha de inicio de vigencia es obligatoria y debe ser una fecha válida.',
    },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de inicio de vigencia debe tener formato YYYY-MM-DD.',
  })
  validFrom!: string;
}
