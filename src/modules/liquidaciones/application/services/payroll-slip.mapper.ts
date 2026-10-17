import { UnprocessableEntityException } from '@nestjs/common';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { EmployeeBranchAssignment } from 'src/entities/employee-branch-assignment.model';
import { PayrollSlipData } from 'src/modules/liquidaciones/domain/payroll-slip';

// Las columnas 'date' de TypeORM llegan como string ('YYYY-MM-DD'), no como
// Date, aunque la entidad las tipe como Date. Se normalizan a string para
// poder comparar fechas de forma segura sin importar cuál de las dos llegó.
function toIsoDate(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

// Busca la sucursal vigente del empleado en la fecha del período liquidado
// (no la sucursal actual): respeta la regla de no recalcular con datos
// distintos a los usados al momento de la liquidación.
export function findBranchAssignmentAt(
  assignments: EmployeeBranchAssignment[],
  date: Date | string,
): EmployeeBranchAssignment | null {
  const target = toIsoDate(date);
  return (
    assignments.find((assignment) => {
      const start = toIsoDate(assignment.start_date);
      const end = assignment.end_date ? toIsoDate(assignment.end_date) : null;
      return start <= target && (end === null || end >= target);
    }) ?? null
  );
}

export function toPayrollSlipData(payrollPeriod: PayrollPeriod): PayrollSlipData {
  const { employee } = payrollPeriod;
  const assignment = findBranchAssignmentAt(
    employee.employee_branch_assig ?? [],
    payrollPeriod.period_end,
  );
  // Sin la sucursal vigente a la fecha liquidada no se puede armar un
  // comprobante confiable (faltaría la dirección exigida por la normativa);
  // es mejor informar el error que generar un PDF con esos datos en blanco.
  if (!assignment) {
    throw new UnprocessableEntityException(
      `No fue posible determinar la sucursal del empleado para la fecha de liquidación de la liquidación ${payrollPeriod.id}.`,
    );
  }
  const branch = assignment.branch;

  const lines = payrollPeriod.payroll_lines ?? [];

  return {
    company: {
      name: branch.company?.name ?? '',
      nit: null,
    },
    branch: {
      name: branch.name,
      city: branch.city,
      address: branch.address ?? null,
    },
    employee: {
      fullName: `${employee.firstName} ${employee.lastName}`,
      documentType: employee.document_type,
      document: employee.document,
      position: employee.jobPosition?.name ?? null,
    },
    period: {
      start: new Date(payrollPeriod.period_start),
      end: new Date(payrollPeriod.period_end),
      settlementDate: new Date(payrollPeriod.period_end),
    },
    earnings: lines
      .filter((line) => line.type === 'DEVENGADO')
      .map((line) => ({ conceptName: line.concept_name, amount: Number(line.amount) })),
    deductions: lines
      .filter((line) => line.type === 'DEDUCCION')
      .map((line) => ({ conceptName: line.concept_name, amount: Number(line.amount) })),
    totalEarnings: Number(payrollPeriod.total_earnings),
    totalDeductions: Number(payrollPeriod.total_deductions),
    netPay: Number(payrollPeriod.net_pay),
    generatedAt: new Date(),
  };
}
