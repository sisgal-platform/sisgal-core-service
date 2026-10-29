import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../../../domain/value-objects/document-type.enum';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ description: 'Nombres del empleado', example: 'Juan' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Apellidos del empleado', example: 'Pérez' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Nuevo tipo de documento. Se debe enviar junto con documentNumber.',
    enum: DocumentType,
  })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @ApiPropertyOptional({
    description: 'Nuevo número de documento (solo dígitos, debe ser único). Se debe enviar junto con documentType.',
    example: '1020304050',
  })
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional({ description: 'Número de teléfono del empleado', example: '3001234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Salario base mensual (mayor que cero)',
    example: 1800000,
    minimum: 0.01,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  salaryBase?: number;

  @ApiPropertyOptional({ description: 'Identificador del nuevo cargo activo', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  positionId?: number;

  @ApiPropertyOptional({
    description:
      'Identificador de la nueva sucursal activa. Cierra la asignación vigente y abre una nueva.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Identificador de la nueva jornada laboral vigente asignada al empleado.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  workdayConfigId?: number;

  @ApiPropertyOptional({
    description: 'Fecha de ingreso (YYYY-MM-DD), no posterior a hoy.',
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
