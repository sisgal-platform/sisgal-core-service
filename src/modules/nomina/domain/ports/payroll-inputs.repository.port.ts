import {
  AttendanceRecord,
  DisabilityLeave,
  Employee,
  EmployeeLoan,
  PayrollPeriod,
} from 'src/entities';

export const PAYROLL_INPUTS_REPOSITORY_PORT = Symbol(
  'PAYROLL_INPUTS_REPOSITORY_PORT',
);

/**
 * Información que la nómina lee de los demás módulos. Cada consulta recibe
 * varios empleados para liquidar un lote completo con pocas consultas.
 */
export interface PayrollInputsRepositoryPort {
  /** Empleados activos con su cargo, ordenados por identificador. */
  findActiveEmployees(): Promise<Employee[]>;

  /** Marcaciones (con su empleado) cuya entrada está en el rango [from, to). */
  findAttendanceRecords(
    employeeIds: number[],
    from: Date,
    to: Date,
  ): Promise<AttendanceRecord[]>;

  /** Incapacidades y licencias (con su empleado) que se cruzan con el período. */
  findDisabilityLeaves(
    employeeIds: number[],
    periodStart: string,
    periodEnd: string,
  ): Promise<DisabilityLeave[]>;

  /** Préstamos activos con cuotas pendientes otorgados hasta el fin del período. */
  findActiveLoans(
    employeeIds: number[],
    periodEnd: string,
  ): Promise<EmployeeLoan[]>;

  /** Liquidaciones registradas (con su empleado) que se cruzan con el período. */
  findPayrollPeriods(
    employeeIds: number[],
    periodStart: string,
    periodEnd: string,
  ): Promise<PayrollPeriod[]>;
}
