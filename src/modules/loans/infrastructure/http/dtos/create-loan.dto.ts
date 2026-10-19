import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoanPeriodicity } from '../../../enums/loan-periodicity.enum';

export class CreateLoanDto {
  @ApiProperty({
    description: 'Identificador del empleado que recibe el préstamo',
    example: 7,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'El identificador del empleado debe ser un entero.' })
  @Min(1, { message: 'El identificador del empleado debe ser mayor que cero.' })
  employeeId!: number;

  @ApiProperty({
    description: 'Monto total del préstamo, sin intereses',
    example: 2500000,
    minimum: 0.01,
    maximum: 9999999999999.99,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe tener máximo dos decimales.' },
  )
  @Min(0.01, { message: 'El monto debe ser mayor que cero.' })
  @Max(9999999999999.99, { message: 'El monto supera el máximo permitido.' })
  totalAmount!: number;

  @ApiProperty({
    description: 'Número total de cuotas del préstamo',
    example: 10,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'El número de cuotas debe ser un entero.' })
  @Min(1, { message: 'El número de cuotas debe ser mayor que cero.' })
  totalInstallments!: number;

  @ApiProperty({
    description: 'Fecha de otorgamiento del préstamo (YYYY-MM-DD)',
    example: '2026-03-10',
    type: String,
    format: 'date',
  })
  @IsDateString(
    { strict: true },
    { message: 'La fecha de otorgamiento debe ser válida.' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de otorgamiento debe tener formato YYYY-MM-DD.',
  })
  grantedAt!: string;

  @ApiPropertyOptional({
    description:
      'Cada cuánto se descuenta una cuota: MENSUAL (el último día de cada mes) o QUINCENAL (el día 15 y el último día de cada mes). Por defecto, MENSUAL.',
    enum: LoanPeriodicity,
    example: LoanPeriodicity.MENSUAL,
  })
  @IsOptional()
  @IsEnum(LoanPeriodicity, {
    message: 'La periodicidad del préstamo no es válida.',
  })
  periodicity?: LoanPeriodicity;
}
