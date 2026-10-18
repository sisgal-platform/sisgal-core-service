import { ApiProperty } from '@nestjs/swagger';
import { PayrollPeriod } from '../../../../../entities/payroll-period.model';

export class PayrollPeriodResponseDto {
  @ApiProperty({
    description: 'Identificador único de la liquidación',
    example: 1,
    nullable: true,
  })
  id!: number | null;

  @ApiProperty({
    description: 'Identificador del empleado asociado',
    example: 1,
  })
  employeeId!: number;

  @ApiProperty({
    description: 'Nombre completo del empleado asociado',
    example: 'Juan Pérez',
  })
  employeeName!: string;

  @ApiProperty({
    description: 'Fecha de inicio del período',
    example: '2026-09-01',
  })
  periodStart!: Date;

  @ApiProperty({
    description: 'Fecha de finalización del período',
    example: '2026-09-30',
  })
  periodEnd!: Date;

  @ApiProperty({
    description: 'Fecha de liquidación (fecha de cierre del período)',
    example: '2026-09-30',
    nullable: true,
  })
  settlementDate!: Date | null;

  @ApiProperty({
    description: 'Total devengado en el período',
    example: 1800000,
  })
  totalEarnings!: number;

  @ApiProperty({
    description: 'Total de deducciones en el período',
    example: 150000,
  })
  totalDeductions!: number;

  @ApiProperty({
    description: 'Neto a pagar',
    example: 1650000,
  })
  netPay!: number;

  @ApiProperty({
    description:
      'Estado de la liquidación. Todas las liquidaciones registradas están confirmadas.',
    example: 'Confirmada',
  })
  status!: 'Confirmada' | 'Preliquidación';

  static fromEntity(payrollPeriod: PayrollPeriod): PayrollPeriodResponseDto {
    const dto = new PayrollPeriodResponseDto();
    dto.id = payrollPeriod.id;
    dto.employeeId = payrollPeriod.employee.id;
    dto.employeeName = `${payrollPeriod.employee.firstName} ${payrollPeriod.employee.lastName}`;
    dto.periodStart = payrollPeriod.period_start;
    dto.periodEnd = payrollPeriod.period_end;
    dto.settlementDate = payrollPeriod.period_end;
    // TypeORM retorna las columnas decimal como string; se convierten para que el contrato sea numérico
    dto.totalEarnings = Number(payrollPeriod.total_earnings);
    dto.totalDeductions = Number(payrollPeriod.total_deductions);
    dto.netPay = Number(payrollPeriod.net_pay);
    dto.status = 'Confirmada';
    return dto;
  }
}
