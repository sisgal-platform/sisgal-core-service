// Una fila del CSV de integración contable. A diferencia del PDF (HU29), el
// CSV no necesita datos de compañía/sucursal: el sistema contable destino
// solo necesita identificar al empleado, el período y los montos.
//
// Formato "largo" (una fila por concepto) en vez de una columna fija por
// concepto: los nombres de concepto (concept_name) son texto libre en la
// base de datos, no un catálogo cerrado, así que mapearlos a columnas fijas
// ("auxilio_transporte", "recargos", etc.) sería frágil. El concepto mismo
// viaja como dato en cada fila, igual que ya se muestra en el detalle y el PDF.
export type PayrollCsvRow = {
  liquidacionId: number;
  periodStart: string;
  periodEnd: string;
  employeeDocumentType: string;
  employeeDocument: string;
  employeeName: string;
  conceptType: 'DEVENGADO' | 'DEDUCCION' | 'TOTAL';
  conceptName: string;
  amount: number;
};

export const PAYROLL_CSV_HEADERS = [
  'liquidacion_id',
  'periodo_inicio',
  'periodo_fin',
  'tipo_documento_empleado',
  'documento_empleado',
  'nombre_empleado',
  'tipo_concepto',
  'concepto',
  'monto',
] as const;
