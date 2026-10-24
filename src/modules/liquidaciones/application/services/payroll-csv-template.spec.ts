import { PayrollCsvRow } from 'src/modules/liquidaciones/domain/payroll-csv';
import { buildPayrollCsv } from './payroll-csv-template';

describe('payroll-csv-template', () => {
  it('arma el encabezado y una fila por cada concepto', () => {
    const csv = buildPayrollCsv([crearFila({ conceptName: 'Salario base', amount: 1530000 })]);
    const lineas = csv.split('\r\n');

    expect(lineas[0]).toBe(
      'liquidacion_id,periodo_inicio,periodo_fin,tipo_documento_empleado,documento_empleado,nombre_empleado,tipo_concepto,concepto,monto',
    );
    expect(lineas[1]).toBe(
      '1,2026-09-01,2026-09-30,CC,1020304050,Ana Barros,DEVENGADO,Salario base,1530000.00',
    );
  });

  it('escapa un concepto que contiene una coma', () => {
    const csv = buildPayrollCsv([crearFila({ conceptName: 'Salud, pensión', amount: 150000 })]);

    expect(csv).toContain('"Salud, pensión"');
  });

  it('escapa un valor que contiene comillas duplicándolas', () => {
    const csv = buildPayrollCsv([crearFila({ employeeName: 'José "Pepe" Ruiz' })]);

    expect(csv).toContain('"José ""Pepe"" Ruiz"');
  });

  it('formatea los montos con punto decimal y sin separador de miles', () => {
    const csv = buildPayrollCsv([crearFila({ amount: 1800000.5 })]);

    expect(csv).toContain('1800000.50');
    expect(csv).not.toContain('1.800.000');
  });

  it('termina cada línea en CRLF', () => {
    const csv = buildPayrollCsv([crearFila()]);

    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3); // encabezado + fila + "" final
  });
});

function crearFila(overrides: Partial<PayrollCsvRow> = {}): PayrollCsvRow {
  return {
    liquidacionId: 1,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    employeeDocumentType: 'CC',
    employeeDocument: '1020304050',
    employeeName: 'Ana Barros',
    conceptType: 'DEVENGADO',
    conceptName: 'Salario base',
    amount: 1530000,
    ...overrides,
  };
}
