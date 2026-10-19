import { ApiProperty } from '@nestjs/swagger';
import { WorkRateType } from 'src/modules/parametros-nomina/domain/work-rate-type.enum';

export class WorkedHoursResponseDto {
  @ApiProperty({
    description: 'Tipo de hora',
    enum: WorkRateType,
    example: WorkRateType.ORDINARIA_DIURNA,
  })
  type!: string;

  @ApiProperty({
    description: 'Nombre del tipo de hora',
    example: 'Horas ordinarias diurnas',
  })
  label!: string;

  @ApiProperty({
    description: 'Horas trabajadas de este tipo en el período',
    example: 176,
  })
  hours!: number;
}
