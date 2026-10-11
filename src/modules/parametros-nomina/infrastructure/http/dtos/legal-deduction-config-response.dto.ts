import { ApiProperty } from '@nestjs/swagger';
import { SystemConfig } from '../../../../../entities/system-config.model';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import { LegalDeductionType } from '../../../domain/legal-deduction-type.enum';
import {
  aFechaCalendario,
  EstadoVigencia,
  estadoDeVigencia,
} from '../../../domain/vigencia';

export class LegalDeductionConfigResponseDto {
  @ApiProperty({
    description: 'Identificador único de la versión',
    example: 7,
  })
  id!: number;

  @ApiProperty({
    description: 'Descuento legal al que aplica el porcentaje',
    enum: LegalDeductionType,
    example: LegalDeductionType.HEALTH_RATE,
  })
  type!: string;

  @ApiProperty({
    description:
      'Porcentaje a cargo del empleado sobre la base de cotización. Por ejemplo, 4 equivale a un 4 %.',
    example: 4,
  })
  percentage!: number;

  @ApiProperty({
    description: 'Fecha desde la que rige la versión (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  validFrom!: string;

  @ApiProperty({
    description:
      'Último día en que rige la versión (YYYY-MM-DD). Es null mientras no se registre una versión posterior del mismo descuento.',
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
    entity: SystemConfig,
    hoy: string = getColombiaDate(new Date()),
  ): LegalDeductionConfigResponseDto {
    const dto = new LegalDeductionConfigResponseDto();

    dto.id = entity.id;
    dto.type = entity.key;
    // La columna `decimal` llega como texto; la API expone un número.
    dto.percentage = Number(entity.value);
    dto.validFrom = aFechaCalendario(entity.valid_from);
    dto.validTo = entity.valid_to ? aFechaCalendario(entity.valid_to) : null;
    dto.status = estadoDeVigencia(dto.validFrom, dto.validTo, hoy);

    return dto;
  }
}
