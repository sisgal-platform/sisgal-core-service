import { PAYROLL_CSV_HEADERS, PayrollCsvRow } from 'src/modules/liquidaciones/domain/payroll-csv';

const SEPARATOR = ',';
const LINE_BREAK = '\r\n';

// Escapa un valor según RFC 4180: si contiene el separador, comillas o un
// salto de línea, se envuelve en comillas dobles y las comillas internas se
// duplican. Sin esto, un nombre o concepto con una coma rompería el CSV.
function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Los montos se exportan como números planos (punto decimal, sin separador
// de miles ni símbolo de moneda): es lo que un sistema contable espera poder
// parsear, a diferencia del formato de visualización ($ 1.800.000) de la UI.
function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function buildRowLine(row: PayrollCsvRow): string {
  const values = [
    String(row.liquidacionId),
    row.periodStart,
    row.periodEnd,
    row.employeeDocumentType,
    row.employeeDocument,
    row.employeeName,
    row.conceptType,
    row.conceptName,
    formatAmount(row.amount),
  ];
  return values.map(escapeField).join(SEPARATOR);
}

// Arma el contenido completo del CSV (encabezado + filas) a partir de las
// filas ya mapeadas. Función pura: no hace I/O ni conoce TypeORM.
export function buildPayrollCsv(rows: PayrollCsvRow[]): string {
  const lines = [PAYROLL_CSV_HEADERS.join(SEPARATOR), ...rows.map(buildRowLine)];
  return lines.join(LINE_BREAK) + LINE_BREAK;
}
