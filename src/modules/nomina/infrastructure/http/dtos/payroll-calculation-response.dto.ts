import { ApiProperty } from '@nestjs/swagger';
import { PayrollPeriodDetailResponseDto } from 'src/modules/liquidaciones/infraestructure/http/dtos/payroll-period-detail-response.dto';
import type {
  PayrollCalculationResult,
  PayrollCalculationStatus,
  PayrollEmployeeError,
} from '../../../application/services/nomina.service';
import { roundCurrency } from '../../../domain/payroll-calculation';

export class PayrollCalculationErrorResponseDto {
  @ApiProperty({ description: 'Identificador del empleado', example: 3 })
  employeeId!: number;

  @ApiProperty({
    description: 'Nombre completo del empleado',
    example: 'Juan Pérez',
  })
  employeeName!: string;

  @ApiProperty({ description: 'Tipo de documento del empleado', example: 'CC' })
  employeeDocumentType!: string;

  @ApiProperty({
    description: 'Número de documento del empleado',
    example: '1020304050',
  })
  employeeDocument!: string;

  @ApiProperty({
    description:
      'Información que se debe corregir para poder liquidar al empleado',
    example: ['La marcación del 08/09/2026 no tiene hora de salida.'],
    isArray: true,
    type: String,
  })
  causes!: string[];

  static fromError(
    error: PayrollEmployeeError,
  ): PayrollCalculationErrorResponseDto {
    const dto = new PayrollCalculationErrorResponseDto();
    dto.employeeId = error.employee.id;
    dto.employeeName = `${error.employee.firstName} ${error.employee.lastName}`;
    dto.employeeDocumentType = error.employee.document_type;
    dto.employeeDocument = error.employee.document;
    dto.causes = error.causes;
    return dto;
  }
}

export class PayrollCalculationResponseDto {
  @ApiProperty({
    description: 'Fecha de inicio del período',
    example: '2026-09-01',
  })
  periodStart!: string;

  @ApiProperty({
    description: 'Fecha de fin del período',
    example: '2026-09-30',
  })
  periodEnd!: string;

  @ApiProperty({
    description:
      'COMPLETADO si todos los empleados se calcularon; CON_ERRORES si alguno tiene información por corregir.',
    enum: ['COMPLETADO', 'CON_ERRORES'],
    example: 'COMPLETADO',
  })
  status!: PayrollCalculationStatus;

  @ApiProperty({
    description: 'Empleados activos incluidos en el cálculo',
    example: 12,
  })
  totalEmployees!: number;

  @ApiProperty({
    description: 'Suma del total devengado de los empleados calculados',
    example: 21500000,
  })
  totalEarnings!: number;

  @ApiProperty({
    description: 'Suma del total de deducciones de los empleados calculados',
    example: 2150000,
  })
  totalDeductions!: number;

  @ApiProperty({
    description: 'Suma del neto a pagar de los empleados calculados',
    example: 19350000,
  })
  totalNetPay!: number;

  @ApiProperty({
    description: 'Liquidación calculada de cada empleado, sin guardar',
    type: PayrollPeriodDetailResponseDto,
    isArray: true,
  })
  results!: PayrollPeriodDetailResponseDto[];

  @ApiProperty({
    description: 'Empleados que no se pudieron calcular y su causa',
    type: PayrollCalculationErrorResponseDto,
    isArray: true,
  })
  errors!: PayrollCalculationErrorResponseDto[];

  static fromResult(
    result: PayrollCalculationResult,
  ): PayrollCalculationResponseDto {
    const period = {
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
    };
    const dto = new PayrollCalculationResponseDto();
    dto.periodStart = result.periodStart;
    dto.periodEnd = result.periodEnd;
    dto.status = result.status;
    dto.totalEmployees = result.results.length + result.errors.length;
    dto.results = result.results.map(({ employee, calculation }) =>
      PayrollPeriodDetailResponseDto.fromPreLiquidation(
        employee,
        period,
        calculation,
      ),
    );
    dto.errors = result.errors.map((error) =>
      PayrollCalculationErrorResponseDto.fromError(error),
    );
    dto.totalEarnings = roundCurrency(
      dto.results.reduce((total, item) => total + item.totalEarnings, 0),
    );
    dto.totalDeductions = roundCurrency(
      dto.results.reduce((total, item) => total + item.totalDeductions, 0),
    );
    dto.totalNetPay = roundCurrency(
      dto.results.reduce((total, item) => total + item.netPay, 0),
    );
    return dto;
  }
}
