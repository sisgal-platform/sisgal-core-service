import { ApiProperty } from '@nestjs/swagger';
import { EmployeeLoan } from 'src/entities';
import { LoanPeriodicity } from '../../../enums/loan-periodicity.enum';
import { LoanStatus } from '../../../enums/loan-status.enum';

export class LoanEmployeeResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'María' })
  firstName!: string;

  @ApiProperty({ example: 'Pérez' })
  lastName!: string;

  @ApiProperty({
    description: 'Tipo de documento de identidad',
    example: 'CC',
  })
  documentType!: string;

  @ApiProperty({ example: '123456789' })
  document!: string;
}

export class LoanResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ type: LoanEmployeeResponseDto })
  employee!: LoanEmployeeResponseDto;

  @ApiProperty({ example: 2500000 })
  totalAmount!: number;

  @ApiProperty({ example: 250000 })
  installmentAmount!: number;

  @ApiProperty({ example: 10 })
  totalInstallments!: number;

  @ApiProperty({ example: 8 })
  pendingInstallments!: number;

  @ApiProperty({ example: 2000000 })
  outstandingBalance!: number;

  @ApiProperty({ example: '2026-01-15', type: String })
  grantedAt!: Date;

  @ApiProperty({
    description: 'Cada cuánto se descuenta una cuota en la liquidación',
    enum: LoanPeriodicity,
    example: LoanPeriodicity.MENSUAL,
  })
  periodicity!: LoanPeriodicity;

  @ApiProperty({ enum: LoanStatus, example: LoanStatus.ACTIVO })
  status!: LoanStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  static fromEntity(entity: EmployeeLoan): LoanResponseDto {
    const dto = new LoanResponseDto();
    dto.id = entity.id;
    dto.employee = {
      id: entity.employee.id,
      firstName: entity.employee.firstName,
      lastName: entity.employee.lastName,
      documentType: entity.employee.document_type,
      document: entity.employee.document,
    };
    dto.totalAmount = Number(entity.totalAmount);
    dto.installmentAmount = Number(entity.installmentAmount);
    dto.totalInstallments = entity.totalInstallments;
    dto.pendingInstallments = entity.pendingInstallments;
    dto.outstandingBalance = Number(entity.outstandingBalance);
    dto.grantedAt = entity.grantedAt;
    dto.periodicity = entity.periodicity;
    dto.status = entity.status;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
