import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../../../../../modules/empleados/domain/value-objects/document-type.enum';

export class RegisterEmployeeDto {
  @ApiProperty({
    description: 'Nombres del empleado',
    example: 'Juan',
  })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({
    description: 'Apellidos del empleado',
    example: 'Pérez',
  })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({
    description: 'Tipo de documento de identidad',
    enum: DocumentType,
    example: DocumentType.CC,
  })
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @ApiProperty({
    description: 'Número de documento (solo dígitos, debe ser único)',
    example: '1020304050',
  })
  @IsString()
  @IsNotEmpty()
  documentNumber!: string;

  @ApiProperty({
    description: 'Número de teléfono del empleado',
    example: '3001234567',
  })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({
    description: 'Salario base mensual (mayor que cero)',
    example: 1800000,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  salaryBase!: number;

  @ApiProperty({
    description: 'Identificador del cargo activo asignado al empleado',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  positionId!: number;

  @ApiProperty({
    description: 'Identificador de la sucursal activa donde se asigna el empleado',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiPropertyOptional({
    description:
      'Identificador de la jornada laboral vigente que se asigna al empleado. Si se omite, se asigna la jornada vigente.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  workdayConfigId?: number;

  @ApiPropertyOptional({
    description:
      'Fecha de ingreso (YYYY-MM-DD), no posterior a hoy. Es necesaria para calcular la prima de servicios.',
    example: '2026-02-15',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'La fecha de ingreso debe ser válida.' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de ingreso debe tener formato YYYY-MM-DD.',
  })
  hireDate?: string;
}
