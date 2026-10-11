import { ApiProperty } from '@nestjs/swagger';
import { WorkRateConfig } from '../../../../../entities/work-rate-config.model';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import {
  aFechaCalendario,
  EstadoVigencia,
  estadoDeVigencia,
} from '../../../domain/vigencia';
import { WorkRateType } from '../../../domain/work-rate-type.enum';

export class WorkRateConfigResponseDto {
  @ApiProperty({
    description: 'Identificador único de la versión',
    example: 12,
  })
  id!: number;

  @ApiProperty({
    description: 'Tipo de hora al que aplica el multiplicador',
    enum: WorkRateType,
    example: WorkRateType.EXTRA_DIURNA,
  })
  type!: string;

  @ApiProperty({
    description:
      'Factor sobre el valor de la hora ordinaria. Por ejemplo, 1.25 equivale a un recargo del 25 %.',
    example: 1.25,
  })
  multiplier!: number;

  @ApiProperty({
    description: 'Fecha desde la que rige la versión (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  validFrom!: string;

  @ApiProperty({
    description:
      'Último día en que rige la versión (YYYY-MM-DD). Es null mientras no se registre una versión posterior del mismo tipo de hora.',
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
    entity: WorkRateConfig,
    hoy: string = getColombiaDate(new Date()),
  ): WorkRateConfigResponseDto {
    const dto = new WorkRateConfigResponseDto();

    dto.id = entity.id;
    dto.type = entity.type;
    // La columna `decimal` llega como texto; la API expone un número.
    dto.multiplier = Number(entity.multiplier);
    dto.validFrom = aFechaCalendario(entity.valid_from);
    dto.validTo = entity.valid_to ? aFechaCalendario(entity.valid_to) : null;
    dto.status = estadoDeVigencia(dto.validFrom, dto.validTo, hoy);

    return dto;
  }
}
