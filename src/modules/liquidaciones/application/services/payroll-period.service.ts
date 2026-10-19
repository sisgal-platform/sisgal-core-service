import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import { LoanInstallmentConflictError } from '../../domain/errors/loan-installment-conflict.error';
import * as payrollPeriodRepositoryPort from '../../domain/ports/payroll-period-repository.port';
import { ListPayrollPeriodQueryDto } from '../../infraestructure/http/dtos/list-payroll-period-query.dto';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { PayrollLine } from 'src/entities/payroll_line.model';
import {
  EMPLOYEE_REPOSITORY_PORT,
  type EmployeeRepositoryPort,
} from 'src/modules/empleados/domain/ports/employee-repository.port';
import {
  NominaService,
  type PreLiquidationCalculation,
} from 'src/modules/nomina/application/services/nomina.service';
import { formatCurrency } from 'src/modules/nomina/domain/payroll-calculation';
import { PreLiquidationRequestDto } from 'src/modules/nomina/infrastructure/http/dtos/pre-liquidation-request.dto';
import { PayrollPeriodDetailResponseDto } from '../../infraestructure/http/dtos/payroll-period-detail-response.dto';

@Injectable()
export class PayrollPeriodService {
  constructor(
    @Inject(payrollPeriodRepositoryPort.PAYROLL_PERIOD_REPOSITORY_PORT)
    private readonly payrollPeriodRepository: payrollPeriodRepositoryPort.PayrollPeriodRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY_PORT)
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly nominaService: NominaService,
    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
  ) {}

  async generate(
    employeeId: number,
    period: PreLiquidationRequestDto,
  ): Promise<PayrollPeriodDetailResponseDto> {
    if (!Number.isInteger(employeeId) || employeeId < 1) {
      throw new BadRequestException(
        'El identificador del empleado debe ser positivo.',
      );
    }

    if (period.periodStart > period.periodEnd) {
      throw new BadRequestException(
        'El período inicial no puede ser posterior al período final.',
      );
    }

    const employee = await this.employeeRepository.findById(employeeId);
    if (!employee) {
      throw new NotFoundException(
        `No se encontró un empleado con el identificador ${employeeId}.`,
      );
    }

    const calculation = await this.nominaService.calculatePreLiquidation(
      employee,
      period.periodStart,
      period.periodEnd,
    );
    const payrollPeriod = Object.assign(new PayrollPeriod(), {
      period_start: new Date(`${period.periodStart}T00:00:00.000Z`),
      period_end: new Date(`${period.periodEnd}T00:00:00.000Z`),
      total_earnings: calculation.totalEarnings,
      total_deductions: calculation.totalDeductions,
      net_pay: calculation.netPay,
      config_snapshot: calculation.configSnapshot,
      employee,
      payroll_lines: [
        ...calculation.earnings.map((line) =>
          this.toPayrollLine(line, 'DEVENGADO'),
        ),
        ...calculation.deductions.map((line) =>
          this.toPayrollLine(line, 'DEDUCCION'),
        ),
      ],
    });

    let savedPayrollPeriod: PayrollPeriod;
    try {
      savedPayrollPeriod = await this.payrollPeriodRepository.save(
        payrollPeriod,
        calculation.loanInstallments,
      );
    } catch (error) {
      this.auditPort.log({
        action: 'PAYROLL_SETTLEMENT_FAILED',
        module: 'Liquidaciones',
        resource: 'PayrollPeriod',
        result: 'FAILED',
        message: `Falló el registro de la liquidación de ${employee.firstName} ${employee.lastName} del ${period.periodStart} al ${period.periodEnd}; no se guardó la liquidación ni se descontó ninguna cuota de préstamo.`,
        metadata: {
          employeeId: employee.id,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          loanIds: calculation.loanInstallments.map(
            (installment) => installment.loanId,
          ),
          error: error instanceof Error ? error.message : String(error),
        },
      });

      if (error instanceof LoanInstallmentConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    this.auditLoanInstallments(savedPayrollPeriod, calculation);

    return PayrollPeriodDetailResponseDto.fromEntity(savedPayrollPeriod);
  }

  // Consulta de solo lectura: nunca recalcula, solo muestra lo ya liquidado
  async findAll(query: ListPayrollPeriodQueryDto): Promise<PayrollPeriod[]> {
    if (
      query.periodStart &&
      query.periodEnd &&
      query.periodStart > query.periodEnd
    ) {
      throw new BadRequestException(
        'El período inicial no puede ser posterior al período final.',
      );
    }

    return this.payrollPeriodRepository.findAll(query);
  }

  async findById(id: number): Promise<PayrollPeriod> {
    const payrollPeriod = await this.payrollPeriodRepository.findById(id);
    if (!payrollPeriod) {
      throw new NotFoundException(
        `No se encontró una liquidación con el identificador ${id}.`,
      );
    }

    return payrollPeriod;
  }

  /** Trazabilidad de cada cuota descontada y de las que no se pudieron descontar. */
  private auditLoanInstallments(
    payrollPeriod: PayrollPeriod,
    calculation: PreLiquidationCalculation,
  ): void {
    const appliedAt = new Map(
      (payrollPeriod.loan_installments ?? []).map((installment) => [
        installment.loanId,
        installment.appliedAt,
      ]),
    );

    for (const installment of calculation.loanInstallments) {
      this.auditPort.log({
        action: 'LOAN_INSTALLMENT_APPLIED',
        module: 'Liquidaciones',
        resource: 'EmployeeLoan',
        resourceId: installment.loanId,
        result: 'SUCCESS',
        message: `Se descontaron ${formatCurrency(installment.amount)} del préstamo #${installment.loanId} en la liquidación #${payrollPeriod.id}.`,
        metadata: {
          employeeId: payrollPeriod.employee.id,
          loanId: installment.loanId,
          payrollPeriodId: payrollPeriod.id,
          appliedAt: appliedAt.get(installment.loanId),
          installments: installment.installments,
          scheduledAmount: installment.scheduledAmount,
          amount: installment.amount,
          previousBalance: installment.previousBalance,
          newBalance: installment.newBalance,
          previousPendingInstallments: installment.previousPendingInstallments,
          remainingInstallments: installment.remainingInstallments,
        },
      });
    }

    for (const observation of calculation.loanObservations) {
      this.auditPort.log({
        action:
          observation.reason === 'INFORMACION_INCONSISTENTE'
            ? 'LOAN_INSTALLMENT_INCONSISTENT'
            : 'LOAN_INSTALLMENT_LIMITED',
        module: 'Liquidaciones',
        resource: 'EmployeeLoan',
        resourceId: observation.loanId,
        result: 'FAILED',
        message: observation.message,
        metadata: {
          employeeId: payrollPeriod.employee.id,
          loanId: observation.loanId,
          payrollPeriodId: payrollPeriod.id,
          ...observation.details,
        },
      });
    }
  }

  private toPayrollLine(
    line: { conceptName: string; amount: number },
    type: 'DEVENGADO' | 'DEDUCCION',
  ): PayrollLine {
    return Object.assign(new PayrollLine(), {
      concept_name: line.conceptName,
      amount: line.amount,
      type,
    });
  }
}
