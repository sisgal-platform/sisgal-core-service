import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AttendanceRecord,
  DisabilityLeave,
  Employee,
  EmployeeLoan,
  PayrollPeriod,
} from 'src/entities';
import { LoanStatus } from 'src/modules/loans/enums/loan-status.enum';
import { PayrollInputsRepositoryPort } from '../../../domain/ports/payroll-inputs.repository.port';

@Injectable()
export class PayrollInputsTypeOrmRepository implements PayrollInputsRepositoryPort {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,

    @InjectRepository(AttendanceRecord)
    private readonly attendanceRecordRepository: Repository<AttendanceRecord>,

    @InjectRepository(DisabilityLeave)
    private readonly disabilityLeaveRepository: Repository<DisabilityLeave>,

    @InjectRepository(EmployeeLoan)
    private readonly loanRepository: Repository<EmployeeLoan>,

    @InjectRepository(PayrollPeriod)
    private readonly payrollPeriodRepository: Repository<PayrollPeriod>,
  ) {}

  // Los empleados inactivos no se liquidan, aunque tengan marcaciones o
  // incapacidades en el período.
  findActiveEmployees(): Promise<Employee[]> {
    return this.employeeRepository.find({
      where: { status: 'ACTIVO' },
      relations: { jobPosition: true },
      order: { id: 'ASC' },
    });
  }

  async findAttendanceRecords(
    employeeIds: number[],
    from: Date,
    to: Date,
  ): Promise<AttendanceRecord[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    return this.attendanceRecordRepository
      .createQueryBuilder('record')
      .innerJoinAndSelect('record.employee', 'employee')
      .where('employee.id IN (:...employeeIds)', { employeeIds })
      .andWhere('record.check_in >= :from', { from })
      .andWhere('record.check_in < :to', { to })
      .orderBy('record.check_in', 'ASC')
      .addOrderBy('record.id', 'ASC')
      .getMany();
  }

  async findDisabilityLeaves(
    employeeIds: number[],
    periodStart: string,
    periodEnd: string,
  ): Promise<DisabilityLeave[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    return this.disabilityLeaveRepository
      .createQueryBuilder('disabilityLeave')
      .innerJoinAndSelect('disabilityLeave.employee', 'employee')
      .where('employee.id IN (:...employeeIds)', { employeeIds })
      .andWhere('disabilityLeave.start_date <= :periodEnd', { periodEnd })
      .andWhere('disabilityLeave.end_date >= :periodStart', { periodStart })
      .orderBy('disabilityLeave.start_date', 'ASC')
      .getMany();
  }

  async findActiveLoans(
    employeeIds: number[],
    periodEnd: string,
  ): Promise<EmployeeLoan[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    return this.loanRepository
      .createQueryBuilder('loan')
      .where('loan.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('loan.status = :status', { status: LoanStatus.ACTIVO })
      .andWhere('loan.pendingInstallments > 0')
      .andWhere('loan.outstandingBalance > 0')
      .andWhere('loan.grantedAt <= :periodEnd', { periodEnd })
      .orderBy('loan.id', 'ASC')
      .getMany();
  }

  async findPayrollPeriods(
    employeeIds: number[],
    periodStart: string,
    periodEnd: string,
  ): Promise<PayrollPeriod[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    return this.payrollPeriodRepository
      .createQueryBuilder('payrollPeriod')
      .innerJoinAndSelect('payrollPeriod.employee', 'employee')
      .where('employee.id IN (:...employeeIds)', { employeeIds })
      .andWhere('payrollPeriod.period_start <= :periodEnd', { periodEnd })
      .andWhere('payrollPeriod.period_end >= :periodStart', { periodStart })
      .orderBy('payrollPeriod.period_start', 'ASC')
      .getMany();
  }
}
