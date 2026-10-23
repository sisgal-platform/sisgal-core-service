import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { PayrollCsvRow } from 'src/modules/liquidaciones/domain/payroll-csv';

// A diferencia del PDF (toPayrollSlipData), este mapeo no necesita resolver
// la sucursal/compañía del empleado: el sistema contable destino solo
// necesita al empleado, el período y los montos, no la dirección física.
export function toPayrollCsvRows(payrollPeriod: PayrollPeriod): PayrollCsvRow[] {
  const { employee } = payrollPeriod;
  const base = {
    liquidacionId: payrollPeriod.id,
    periodStart: String(payrollPeriod.period_start),
    periodEnd: String(payrollPeriod.period_end),
    employeeDocumentType: employee.document_type,
    employeeDocument: employee.document,
    employeeName: `${employee.firstName} ${employee.lastName}`,
  };

  const lines = payrollPeriod.payroll_lines ?? [];
  const conceptRows: PayrollCsvRow[] = lines.map((line) => ({
    ...base,
    conceptType: line.type === 'DEVENGADO' ? 'DEVENGADO' : 'DEDUCCION',
    conceptName: line.concept_name,
    amount: Number(line.amount),
  }));

  const totalRows: PayrollCsvRow[] = [
    { ...base, conceptType: 'TOTAL', conceptName: 'Total devengado', amount: Number(payrollPeriod.total_earnings) },
    { ...base, conceptType: 'TOTAL', conceptName: 'Total deducciones', amount: Number(payrollPeriod.total_deductions) },
    { ...base, conceptType: 'TOTAL', conceptName: 'Neto a pagar', amount: Number(payrollPeriod.net_pay) },
  ];

  return [...conceptRows, ...totalRows];
}
