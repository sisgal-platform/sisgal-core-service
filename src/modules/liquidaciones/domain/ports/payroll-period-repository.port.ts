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
  /**
   * Reemplaza los valores de una liquidación guardada, en una transacción:
   * devuelve a los préstamos lo descontado, borra sus conceptos y guarda los
   * nuevos. Lanza `LoanInstallmentReversalError` si un préstamo tuvo movimientos
   * posteriores y `LoanInstallmentConflictError` si cambió desde el cálculo.
   */
  replace(
    payrollPeriod: PayrollPeriod,
    loanInstallments: LoanInstallmentPlan[],
  ): Promise<PayrollPeriod>;
  /**
   * Elimina la liquidación con sus conceptos y devuelve a los préstamos lo
   * descontado, en una transacción. Lanza `LoanInstallmentReversalError` si un
   * préstamo tuvo movimientos posteriores.
   */
  delete(payrollPeriodId: number): Promise<void>;
}
