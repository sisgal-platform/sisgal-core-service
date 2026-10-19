import { ApiProperty } from '@nestjs/swagger';
import { PayrollPeriod } from '../../../../../entities/payroll-period.model';
import { PayrollPeriodResponseDto } from './payroll-period-response.dto';
import { PayrollLineResponseDto } from './payroll-line-response.dto';
import { WorkedHoursResponseDto } from './worked-hours-response.dto';
import type { Employee } from '../../../../../entities/employee.model';
import type { PreLiquidationRequestDto } from 'src/modules/nomina/infrastructure/http/dtos/pre-liquidation-request.dto';
import type { PreLiquidationCalculation } from 'src/modules/nomina/application/services/nomina.service';

// Las observaciones de la liquidación quedan en su snapshot al guardarla.
function savedObservations(
  configSnapshot: Record<string, unknown> | null | undefined,
): string[] {
  const observations = configSnapshot?.loanObservations;
  return Array.isArray(observations)
    ? observations.filter(
        (observation): observation is string => typeof observation === 'string',
      )
    : [];
}

export class PayrollPeriodDetailResponseDto extends PayrollPeriodResponseDto {
  @ApiProperty({
    description: 'Tipo de documento de identidad del empleado',
    example: 'CC',
  })
  employeeDocumentType!: string;

  @ApiProperty({
    description: 'Número de documento de identidad o NIT del empleado',
    example: '1020304050',
  })
  employeeDocument!: string;

  @ApiProperty({
    description: 'Cargo del empleado',
    example: 'Mesero',
    nullable: true,
  })
  employeePosition!: string | null;

  @ApiProperty({
    description:
      'Conceptos devengados (salario base, horas extra, recargos, auxilio de transporte, primas, etc.)',
    type: PayrollLineResponseDto,
    isArray: true,
  })
  earnings!: PayrollLineResponseDto[];

  @ApiProperty({
    description:
      'Conceptos deducidos (deducciones legales, préstamos, adelantos, etc.)',
    type: PayrollLineResponseDto,
    isArray: true,
  })
  deductions!: PayrollLineResponseDto[];

  @ApiProperty({
    description:
      'Horas trabajadas por tipo de hora (ordinarias, dominicales y extra). Solo se informan en la preliquidación.',
    type: WorkedHoursResponseDto,
    isArray: true,
  })
  workedHours!: WorkedHoursResponseDto[];

  @ApiProperty({
    description:
      'Cuotas de préstamos que no se descontaron o se descontaron en parte, y por qué',
    example: [
      'La cuota del préstamo #4 se descontó parcialmente ($ 150.000 de $ 250.000) por el límite de deducciones del período (50% del salario neto).',
    ],
    isArray: true,
    type: String,
  })
  observations!: string[];

  static fromEntity(
    payrollPeriod: PayrollPeriod,
  ): PayrollPeriodDetailResponseDto {
    const base = PayrollPeriodResponseDto.fromEntity(payrollPeriod);
    const dto = Object.assign(new PayrollPeriodDetailResponseDto(), base);

    dto.employeeDocumentType = payrollPeriod.employee.document_type;
    dto.employeeDocument = payrollPeriod.employee.document;
    dto.employeePosition = payrollPeriod.employee.jobPosition?.name ?? null;

    const lines = payrollPeriod.payroll_lines ?? [];
    const loanInstallmentsByLine = new Map(
      (payrollPeriod.loan_installments ?? []).map((installment) => [
        installment.payrollLineId,
        installment,
      ]),
    );
    dto.earnings = lines
      .filter((line) => line.type === 'DEVENGADO')
      .map((line) => PayrollLineResponseDto.fromEntity(line));
    dto.deductions = lines
      .filter((line) => line.type === 'DEDUCCION')
      .map((line) =>
        PayrollLineResponseDto.fromEntity(
          line,
          loanInstallmentsByLine.get(line.id),
        ),
      );
    dto.workedHours = [];
    dto.observations = savedObservations(payrollPeriod.config_snapshot);

    return dto;
  }

  static fromPreLiquidation(
    employee: Employee,
    period: PreLiquidationRequestDto,
    calculation: PreLiquidationCalculation,
  ): PayrollPeriodDetailResponseDto {
    const dto = new PayrollPeriodDetailResponseDto();
    dto.id = null;
    dto.employeeId = employee.id;
    dto.employeeName = `${employee.firstName} ${employee.lastName}`;
    dto.periodStart = new Date(`${period.periodStart}T00:00:00.000Z`);
    dto.periodEnd = new Date(`${period.periodEnd}T00:00:00.000Z`);
    dto.settlementDate = null;
    dto.totalEarnings = calculation.totalEarnings;
    dto.totalDeductions = calculation.totalDeductions;
    dto.netPay = calculation.netPay;
    dto.status = 'Preliquidación';
    dto.employeeDocumentType = employee.document_type;
    dto.employeeDocument = employee.document;
    dto.employeePosition = employee.jobPosition?.name ?? null;
    dto.earnings = calculation.earnings;
    dto.deductions = calculation.deductions;
    dto.workedHours = calculation.workedHours;
    dto.observations = calculation.loanObservations.map(
      (observation) => observation.message,
    );
    return dto;
  }
}
