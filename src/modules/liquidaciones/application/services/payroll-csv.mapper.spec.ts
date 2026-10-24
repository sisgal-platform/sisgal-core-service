import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { Employee } from 'src/entities/employee.model';
import { PayrollLine } from 'src/entities/payroll_line.model';
import { toPayrollCsvRows } from './payroll-csv.mapper';

describe('payroll-csv.mapper', () => {
  it('mapea cada concepto a una fila con los datos del empleado y el período', () => {
    const liquidacion = crearLiquidacion({
      payroll_lines: [
        Object.assign(new PayrollLine(), { concept_name: 'Salario base', type: 'DEVENGADO', amount: 1530000 }),
        Object.assign(new PayrollLine(), { concept_name: 'Salud', type: 'DEDUCCION', amount: 60000 }),
      ],
    });

    const rows = toPayrollCsvRows(liquidacion);

    expect(rows).toEqual([
      expect.objectContaining({
        liquidacionId: 1,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        employeeDocumentType: 'CC',
        employeeDocument: '1020304050',
        employeeName: 'Juan Pérez',
        conceptType: 'DEVENGADO',
        conceptName: 'Salario base',
        amount: 1530000,
      }),
      expect.objectContaining({
        conceptType: 'DEDUCCION',
        conceptName: 'Salud',
        amount: 60000,
      }),
      expect.objectContaining({ conceptType: 'TOTAL', conceptName: 'Total devengado', amount: 1800000 }),
      expect.objectContaining({ conceptType: 'TOTAL', conceptName: 'Total deducciones', amount: 150000 }),
      expect.objectContaining({ conceptType: 'TOTAL', conceptName: 'Neto a pagar', amount: 1650000 }),
    ]);
  });

  it('no incluye sucursal ni compañía: no las necesita el sistema contable', () => {
    const liquidacion = crearLiquidacion();

    const rows = toPayrollCsvRows(liquidacion);

    for (const row of rows) {
      expect(row).not.toHaveProperty('branch');
      expect(row).not.toHaveProperty('company');
    }
  });

  it('no lanza error aunque el empleado no tenga asignación de sucursal (a diferencia del PDF)', () => {
    const liquidacion = crearLiquidacion({
      employee: Object.assign(new Employee(), {
        firstName: 'Juan',
        lastName: 'Pérez',
        document_type: 'CC',
        document: '1020304050',
        employee_branch_assig: [],
      }),
    });

    expect(() => toPayrollCsvRows(liquidacion)).not.toThrow();
  });
});

function crearLiquidacion(overrides: Partial<PayrollPeriod> = {}): PayrollPeriod {
  return Object.assign(new PayrollPeriod(), {
    id: 1,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    total_earnings: 1800000,
    total_deductions: 150000,
    net_pay: 1650000,
    employee: Object.assign(new Employee(), {
      firstName: 'Juan',
      lastName: 'Pérez',
      document_type: 'CC',
      document: '1020304050',
    }),
    payroll_lines: [],
    ...overrides,
  });
}
