import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EmployeeLoan } from 'src/entities/employee_loan.model';
import { LoanInstallment } from 'src/entities/loan-installment.model';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { LoanStatus } from 'src/modules/loans/enums/loan-status.enum';
import { LoanInstallmentConflictError } from 'src/modules/liquidaciones/domain/errors/loan-installment-conflict.error';
import {
  PayrollPeriodRepositoryPort,
  PayrollPeriodFilters,
} from 'src/modules/liquidaciones/domain/ports/payroll-period-repository.port';
import type { LoanInstallmentPlan } from 'src/modules/nomina/domain/loan-installments';

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
        loan_installments: true,
      },
    });
  }

  save(
    payrollPeriod: PayrollPeriod,
    loanInstallments: LoanInstallmentPlan[] = [],
  ): Promise<PayrollPeriod> {
    if (loanInstallments.length === 0) {
      return this.repository.save(payrollPeriod);
    }

    return this.repository.manager.transaction(async (manager) => {
      await this.lockUnchangedLoans(manager, loanInstallments);

      const savedPayrollPeriod = await manager.save(payrollPeriod);
      const savedInstallments: LoanInstallment[] = [];

      for (const plan of loanInstallments) {
        const payrollLine = savedPayrollPeriod.payroll_lines.find(
          (line) =>
            line.type === 'DEDUCCION' && line.concept_name === plan.conceptName,
        );
        if (!payrollLine) {
          throw new Error(
            `La liquidación no tiene el concepto "${plan.conceptName}" de la cuota del préstamo #${plan.loanId}.`,
          );
        }

        savedInstallments.push(
          await manager.save(
            Object.assign(new LoanInstallment(), {
              loanId: plan.loanId,
              employeeId: savedPayrollPeriod.employee.id,
              payrollPeriodId: savedPayrollPeriod.id,
              payrollLineId: payrollLine.id,
              installmentsApplied: plan.installments,
              scheduledAmount: plan.scheduledAmount,
              amount: plan.amount,
              previousBalance: plan.previousBalance,
              newBalance: plan.newBalance,
              previousPendingInstallments: plan.previousPendingInstallments,
              remainingInstallments: plan.remainingInstallments,
            }),
          ),
        );
        await manager.update(
          EmployeeLoan,
          { id: plan.loanId },
          {
            outstandingBalance: plan.newBalance,
            pendingInstallments: plan.remainingInstallments,
            status:
              plan.newBalance === 0 ? LoanStatus.SALDADO : LoanStatus.ACTIVO,
          },
        );
      }

      savedPayrollPeriod.loan_installments = savedInstallments;
      return savedPayrollPeriod;
    });
  }

  /**
   * Bloquea los préstamos hasta el fin de la transacción y comprueba que
   * siguen como los vio el cálculo. Así una cuota no se descuenta dos veces
   * cuando dos liquidaciones se generan al mismo tiempo.
   */
  private async lockUnchangedLoans(
    manager: EntityManager,
    loanInstallments: LoanInstallmentPlan[],
  ): Promise<void> {
    const loans = await manager
      .getRepository(EmployeeLoan)
      .createQueryBuilder('loan')
      .setLock('pessimistic_write')
      .where('loan.id IN (:...loanIds)', {
        loanIds: loanInstallments.map((plan) => plan.loanId),
      })
      .getMany();

    for (const plan of loanInstallments) {
      const loan = loans.find((item) => item.id === plan.loanId);
      const isUnchanged =
        loan?.status === LoanStatus.ACTIVO &&
        Number(loan.outstandingBalance) === plan.previousBalance &&
        Number(loan.pendingInstallments) === plan.previousPendingInstallments;

      if (!isUnchanged) {
        throw new LoanInstallmentConflictError(plan.loanId);
      }
    }
  }
}
