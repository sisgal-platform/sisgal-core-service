import { PayrollPeriod } from 'src/entities/payroll-period.model';

export const PAYROLL_PERIOD_REPOSITORY_PORT = Symbol('PAYROLL_PERIOD_REPOSITORY_PORT');

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
}
