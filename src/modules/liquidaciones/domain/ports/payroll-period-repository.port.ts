import { PayrollPeriod } from 'src/entities/payroll-period.model';
import type { LoanInstallmentPlan } from 'src/modules/nomina/domain/loan-installments';

export const PAYROLL_PERIOD_REPOSITORY_PORT = Symbol(
  'PAYROLL_PERIOD_REPOSITORY_PORT',
);

// Filtros de consulta: todos opcionales, se combinan con AND
export interface PayrollPeriodFilters {
  employeeId?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface PayrollPeriodRepositoryPort {
  findAll(filters: PayrollPeriodFilters): Promise<PayrollPeriod[]>;
  // Trae el período con sus líneas (devengados/deducciones) para el detalle completo
  findById(id: number): Promise<PayrollPeriod | null>;
  /**
   * Guarda la liquidación con sus conceptos y, en la misma transacción,
   * registra cada cuota de préstamo y actualiza el saldo, las cuotas
   * pendientes y el estado del préstamo. Si algo falla no queda nada guardado.
   * Lanza `LoanInstallmentConflictError` si un préstamo cambió desde el cálculo.
   */
  save(
    payrollPeriod: PayrollPeriod,
    loanInstallments?: LoanInstallmentPlan[],
  ): Promise<PayrollPeriod>;
}
