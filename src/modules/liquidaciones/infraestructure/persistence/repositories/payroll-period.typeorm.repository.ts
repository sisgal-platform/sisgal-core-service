import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import {
  PayrollPeriodRepositoryPort,
  PayrollPeriodFilters,
} from 'src/modules/liquidaciones/domain/ports/payroll-period-repository.port';

@Injectable()
export class PayrollPeriodTypeOrmRepository implements PayrollPeriodRepositoryPort {
  constructor(
    @InjectRepository(PayrollPeriod)
    private readonly repository: Repository<PayrollPeriod>,
  ) {}

  async findAll(filters: PayrollPeriodFilters): Promise<PayrollPeriod[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('payrollPeriod')
      .leftJoinAndSelect('payrollPeriod.employee', 'employee')
      .orderBy('payrollPeriod.period_start', 'DESC');

    if (filters.employeeId) {
      queryBuilder.andWhere('employee.id = :employeeId', {
        employeeId: filters.employeeId,
      });
    }
    // El rango de período filtra por la fecha de inicio del período, igual que incapacidades
    if (filters.periodStart) {
      queryBuilder.andWhere('payrollPeriod.period_start >= :periodStart', {
        periodStart: filters.periodStart,
      });
    }
    if (filters.periodEnd) {
      queryBuilder.andWhere('payrollPeriod.period_start <= :periodEnd', {
        periodEnd: filters.periodEnd,
      });
    }

    return queryBuilder.getMany();
  }

  async findById(id: number): Promise<PayrollPeriod | null> {
    return this.repository.findOne({
      where: { id },
      relations: {
        employee: {
          jobPosition: true,
          // Necesario para el PDF: la sucursal (y su compañía) vigente en la
          // fecha de la liquidación, no necesariamente la actual del empleado.
          employee_branch_assig: {
            branch: {
              company: true,
            },
          },
        },
        payroll_lines: true,
      },
    });
  }

  save(payrollPeriod: PayrollPeriod): Promise<PayrollPeriod> {
    return this.repository.save(payrollPeriod);
  }
}
