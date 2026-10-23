import { UnprocessableEntityException } from '@nestjs/common';
import { PayrollCsvRow } from 'src/modules/liquidaciones/domain/payroll-csv';
import { PayrollCsvService } from './payroll-csv.service';

describe('PayrollCsvService', () => {
  let service: PayrollCsvService;

  beforeEach(() => {
    service = new PayrollCsvService();
  });

  it('genera un CSV con BOM UTF-8 y una fila por cada registro', () => {
    const buffer = service.generate([crearFila(), crearFila({ conceptName: 'Horas extra' })]);
    const texto = buffer.toString('utf-8');

    expect(texto.charCodeAt(0)).toBe(0xfeff);
    expect(texto.split('\r\n').filter((l) => l.length > 0)).toHaveLength(3); // encabezado + 2 filas
  });

  it('lanza un error cuando no hay filas para exportar', () => {
    expect(() => service.generate([])).toThrow(UnprocessableEntityException);
  });

  it('genera un archivo distinto por cada liquidación (no reutiliza un CSV cacheado)', () => {
    const primero = service.generate([crearFila({ amount: 1000000 })]);
    const segundo = service.generate([crearFila({ amount: 2000000 })]);

    expect(primero.equals(segundo)).toBe(false);
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
