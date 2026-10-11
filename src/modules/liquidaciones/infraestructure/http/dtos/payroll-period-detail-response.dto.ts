import { ApiProperty } from '@nestjs/swagger';
import { PayrollPeriod } from '../../../../../entities/payroll-period.model';
import { PayrollPeriodResponseDto } from './payroll-period-response.dto';
import { PayrollLineResponseDto } from './payroll-line-response.dto';

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
    description: 'Conceptos devengados (salario base, horas extra, recargos, auxilio de transporte, primas, etc.)',
    type: PayrollLineResponseDto,
    isArray: true,
  })
  earnings!: PayrollLineResponseDto[];

  @ApiProperty({
    description: 'Conceptos deducidos (deducciones legales, préstamos, adelantos, etc.)',
    type: PayrollLineResponseDto,
    isArray: true,
  })
  deductions!: PayrollLineResponseDto[];

  static fromEntity(payrollPeriod: PayrollPeriod): PayrollPeriodDetailResponseDto {
    const base = PayrollPeriodResponseDto.fromEntity(payrollPeriod);
    const dto = Object.assign(new PayrollPeriodDetailResponseDto(), base);

    dto.employeeDocumentType = payrollPeriod.employee.document_type;
    dto.employeeDocument = payrollPeriod.employee.document;
    dto.employeePosition = payrollPeriod.employee.jobPosition?.name ?? null;

    const lines = payrollPeriod.payroll_lines ?? [];
    dto.earnings = lines
      .filter((line) => line.type === 'DEVENGADO')
      .map((line) => PayrollLineResponseDto.fromEntity(line));
    dto.deductions = lines
      .filter((line) => line.type === 'DEDUCCION')
      .map((line) => PayrollLineResponseDto.fromEntity(line));

    return dto;
  }
}
