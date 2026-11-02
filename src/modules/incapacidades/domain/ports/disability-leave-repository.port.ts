import { DisabilityLeave } from 'src/entities/disability_leave.model';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import type { DisabilityStatus } from '../value-objects/disability-status';

export const DISABILITY_LEAVE_REPOSITORY_PORT = Symbol('DISABILITY_LEAVE_REPOSITORY_PORT');

// Filtros de consulta: todos opcionales, se combinan con AND
export type DisabilityLeaveListFilters = {
  employeeId?: number;
  employeeName?: string;
  document?: string;
  positionId?: number;
  status?: DisabilityStatus;
  startDate?: string;
  endDate?: string;
};

export interface DisabilityLeaveRepositoryPort {
  save(disabilityLeave: DisabilityLeave): Promise<DisabilityLeave>;
  findAll(filters: DisabilityLeaveListFilters): Promise<DisabilityLeave[]>;
  // Trae el registro con el empleado y su cargo
  findById(id: number): Promise<DisabilityLeave | null>;
  delete(id: number): Promise<void>;
  // Períodos existentes del empleado que se cruzan con el rango dado (para validar superposición)
  findOverlapping(
    employeeId: number,
    startDate: string,
    endDate: string,
    excludedId?: number,
  ): Promise<DisabilityLeave[]>;
  // Liquidaciones guardadas del empleado que se cruzan con el rango dado
  findOverlappingPayrollPeriods(
    employeeId: number,
    startDate: string,
    endDate: string,
  ): Promise<PayrollPeriod[]>;
}
