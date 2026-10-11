import { ApiProperty } from '@nestjs/swagger';
import { WorkdayConfig } from '../../../../../entities/workday-config.model';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import {
  aFechaCalendario,
  EstadoVigencia,
  estadoDeVigencia,
} from '../../../domain/vigencia';

export class WorkdayConfigResponseDto {
  @ApiProperty({
    description: 'Identificador único de la versión',
    example: 2,
  })
  id!: number;

  @ApiProperty({
    description: 'Máximo de horas ordinarias por semana',
    example: 44,
  })
  maxWeekHours!: number;

  @ApiProperty({
    description: 'Máximo de horas ordinarias por día',
    example: 8,
  })
  maxDayHours!: number;

  @ApiProperty({
    description: 'Hora en que inicia la jornada diurna (HH:mm)',
    example: '06:00',
  })
  dayStart!: string;

  @ApiProperty({
    description: 'Hora en que termina la jornada diurna (HH:mm)',
    example: '21:00',
  })
  dayEnd!: string;

  @ApiProperty({
    description: 'Hora en que inicia la jornada nocturna (HH:mm)',
    example: '21:00',
  })
  nightStart!: string;

  @ApiProperty({
    description: 'Hora en que termina la jornada nocturna (HH:mm)',
    example: '06:00',
  })
  nightEnd!: string;

  @ApiProperty({
    description: 'Fecha desde la que rige la versión (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  validFrom!: string;

  @ApiProperty({
    description:
      'Último día en que rige la versión (YYYY-MM-DD). Es null mientras no se registre una versión posterior.',
    example: '2026-10-31',
    nullable: true,
  })
  validTo!: string | null;

  @ApiProperty({
    description:
      'Estado de la versión respecto a la fecha actual: vigente, programada para una fecha futura o histórica.',
    enum: EstadoVigencia,
    example: EstadoVigencia.VIGENTE,
  })
  status!: EstadoVigencia;

  static fromEntity(
    entity: WorkdayConfig,
    hoy: string = getColombiaDate(new Date()),
  ): WorkdayConfigResponseDto {
    const dto = new WorkdayConfigResponseDto();

    dto.id = entity.id;
    dto.maxWeekHours = entity.max_week_hours;
    dto.maxDayHours = entity.max_day_hours;
    // La columna `time` devuelve HH:mm:ss; la API expone HH:mm.
    dto.dayStart = entity.day_start.slice(0, 5);
    dto.dayEnd = entity.day_end.slice(0, 5);
    dto.nightStart = entity.night_start.slice(0, 5);
    dto.nightEnd = entity.night_end.slice(0, 5);
    dto.validFrom = aFechaCalendario(entity.valid_from);
    dto.validTo = entity.valid_to ? aFechaCalendario(entity.valid_to) : null;
    dto.status = estadoDeVigencia(dto.validFrom, dto.validTo, hoy);

    return dto;
  }
}
