import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollLine } from '../../../../../entities/payroll_line.model';
import type { LoanInstallment } from '../../../../../entities/loan-installment.model';

export class PayrollLineLoanResponseDto {
  @ApiProperty({ description: 'Identificador del préstamo', example: 4 })
  loanId!: number;

  @ApiProperty({
    description: 'Cuotas que cubre el descuento (una por fecha de corte)',
    example: 1,
  })
  installments!: number;

  @ApiProperty({
    description:
      'Valor que correspondía descontar; es mayor que el descontado cuando el límite de deducciones solo permitió un descuento parcial',
    example: 250000,
  })
  scheduledAmount!: number;

  @ApiProperty({
    description: 'Saldo del préstamo después del descuento',
    example: 750000,
  })
  outstandingBalance!: number;

  @ApiProperty({
    description: 'Cuotas pendientes del préstamo después del descuento',
    example: 3,
  })
  pendingInstallments!: number;

  static fromEntity(installment: LoanInstallment): PayrollLineLoanResponseDto {
    const dto = new PayrollLineLoanResponseDto();
    dto.loanId = installment.loanId;
    dto.installments = installment.installmentsApplied;
    dto.scheduledAmount = Number(installment.scheduledAmount);
    dto.outstandingBalance = Number(installment.newBalance);
    dto.pendingInstallments = installment.remainingInstallments;
    return dto;
  }
}

export class PayrollLineServiceBonusResponseDto {
  @ApiProperty({ description: 'Inicio del semestre', example: '2026-01-01' })
  semesterStart!: string;

  @ApiProperty({ description: 'Fin del semestre', example: '2026-06-30' })
  semesterEnd!: string;

  @ApiProperty({
    description: 'Días trabajados del semestre (base 360)',
    example: 120,
  })
  workedDays!: number;

  @ApiProperty({ description: 'Días del semestre completo', example: 180 })
  semesterDays!: number;

  @ApiProperty({
    description:
      'Base de la prima: salario base más auxilio de transporte si el empleado tiene derecho',
    example: 1749095,
  })
  baseAmount!: number;

  @ApiProperty({
    description:
      'Indica si la prima es proporcional porque el empleado no trabajó todo el semestre',
    example: true,
  })
  isProportional!: boolean;
}

export class PayrollLineResponseDto {
  @ApiProperty({
    description:
      'Nombre del concepto (ej. "Salario base", "Horas extra", "Préstamos")',
    example: 'Horas extra',
  })
  conceptName!: string;

  @ApiProperty({
    description: 'Monto del concepto',
    example: 85000,
  })
  amount!: number;

  @ApiPropertyOptional({
    description:
      'Préstamo al que corresponde el descuento; solo en las cuotas de préstamos',
    type: PayrollLineLoanResponseDto,
  })
  loan?: PayrollLineLoanResponseDto;

  @ApiPropertyOptional({
    description:
      'Semestre y tiempo trabajado de la prima; solo en la prima de servicios',
    type: PayrollLineServiceBonusResponseDto,
  })
  serviceBonus?: PayrollLineServiceBonusResponseDto;

  static fromEntity(
    payrollLine: PayrollLine,
    loanInstallment?: LoanInstallment,
  ): PayrollLineResponseDto {
    const dto = new PayrollLineResponseDto();
    dto.conceptName = payrollLine.concept_name;
    // TypeORM retorna las columnas decimal como string; se convierte para que el contrato sea numérico
    dto.amount = Number(payrollLine.amount);
    if (loanInstallment) {
      dto.loan = PayrollLineLoanResponseDto.fromEntity(loanInstallment);
    }
    return dto;
  }
}
