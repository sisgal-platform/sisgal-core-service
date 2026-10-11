import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  RecargoCommand,
  RegistrarRecargosCommand,
} from '../../../application/commands/work-rate-config.commands';
import { WorkRateType } from '../../../domain/work-rate-type.enum';

/** La hora no puede pagarse por debajo de su valor ordinario. */
const MULTIPLICADOR_MINIMO = 1;
/** Tope de seguridad: un recargo del 400 % sobre la hora ordinaria. */
const MULTIPLICADOR_MAXIMO = 5;

export class WorkRateInputDto implements RecargoCommand {
  @ApiProperty({
    description: 'Tipo de hora al que aplica el multiplicador',
    enum: WorkRateType,
    example: WorkRateType.EXTRA_DIURNA,
  })
  @IsEnum(WorkRateType, {
    message:
      'El tipo de hora es obligatorio y debe ser uno de los tipos de hora configurables.',
  })
  type!: WorkRateType;

  @ApiProperty({
    description:
      'Factor sobre el valor de la hora ordinaria. Por ejemplo, 1.25 equivale a un recargo del 25 %.',
    example: 1.25,
    minimum: MULTIPLICADOR_MINIMO,
    maximum: MULTIPLICADOR_MAXIMO,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'El multiplicador es obligatorio y debe ser un número con máximo dos decimales.',
    },
  )
  @Min(MULTIPLICADOR_MINIMO, {
    message: `El multiplicador no puede ser menor que ${MULTIPLICADOR_MINIMO}: el recargo no puede ser negativo.`,
  })
  @Max(MULTIPLICADOR_MAXIMO, {
    message: `El multiplicador no puede ser mayor que ${MULTIPLICADOR_MAXIMO}.`,
  })
  multiplier!: number;
}

export class RegisterWorkRatesDto implements RegistrarRecargosCommand {
  @ApiProperty({
    description:
      'Fecha desde la que rigen los nuevos multiplicadores (YYYY-MM-DD). No puede ser anterior a la fecha actual.',
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

  @ApiProperty({
    description:
      'Tipos de hora cuyo multiplicador cambia. Los que no se incluyen conservan su valor.',
    type: WorkRateInputDto,
    isArray: true,
  })
  @IsArray({ message: 'Los recargos deben enviarse como una lista.' })
  @ArrayMinSize(1, {
    message: 'Debes indicar al menos un recargo para modificar.',
  })
  @ArrayUnique((rate: WorkRateInputDto) => rate?.type, {
    message: 'No se puede repetir un tipo de hora en la misma solicitud.',
  })
  @ValidateNested({ each: true })
  @Type(() => WorkRateInputDto)
  rates!: WorkRateInputDto[];
}
