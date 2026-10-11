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
  DescuentoLegalCommand,
  RegistrarDescuentosLegalesCommand,
} from '../../../application/commands/legal-deduction-config.commands';
import { LegalDeductionType } from '../../../domain/legal-deduction-type.enum';

const PORCENTAJE_MINIMO = 0;
const PORCENTAJE_MAXIMO = 100;

export class LegalDeductionInputDto implements DescuentoLegalCommand {
  @ApiProperty({
    description: 'Descuento legal al que aplica el porcentaje',
    enum: LegalDeductionType,
    example: LegalDeductionType.HEALTH_RATE,
  })
  @IsEnum(LegalDeductionType, {
    message:
      'El descuento es obligatorio y debe ser uno de los descuentos legales configurables.',
  })
  type!: LegalDeductionType;

  @ApiProperty({
    description:
      'Porcentaje a cargo del empleado sobre la base de cotización. Por ejemplo, 4 equivale a un 4 %.',
    example: 4,
    minimum: PORCENTAJE_MINIMO,
    maximum: PORCENTAJE_MAXIMO,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'El porcentaje es obligatorio y debe ser un número con máximo dos decimales.',
    },
  )
  @Min(PORCENTAJE_MINIMO, {
    message: 'El porcentaje no puede ser negativo.',
  })
  @Max(PORCENTAJE_MAXIMO, {
    message: `El porcentaje no puede ser mayor que ${PORCENTAJE_MAXIMO}.`,
  })
  percentage!: number;
}

export class RegisterLegalDeductionsDto implements RegistrarDescuentosLegalesCommand {
  @ApiProperty({
    description:
      'Fecha desde la que rigen los nuevos porcentajes (YYYY-MM-DD). No puede ser anterior a la fecha actual.',
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
      'Descuentos cuyo porcentaje cambia. Los que no se incluyen conservan su valor.',
    type: LegalDeductionInputDto,
    isArray: true,
  })
  @IsArray({ message: 'Los descuentos deben enviarse como una lista.' })
  @ArrayMinSize(1, {
    message: 'Debes indicar al menos un descuento para modificar.',
  })
  @ArrayUnique((deduction: LegalDeductionInputDto) => deduction?.type, {
    message: 'No se puede repetir un descuento en la misma solicitud.',
  })
  @ValidateNested({ each: true })
  @Type(() => LegalDeductionInputDto)
  deductions!: LegalDeductionInputDto[];
}
