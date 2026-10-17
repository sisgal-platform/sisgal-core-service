import PDFDocument from 'pdfkit';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import { PayrollSlipData } from 'src/modules/liquidaciones/domain/payroll-slip';

// Formateadores cacheados a nivel de módulo: construir un Intl.NumberFormat
// por cada línea del documento es costoso y evitable (mismo criterio aplicado
// en el módulo de dashboard).
const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(date: Date): string {
  const [year, month, day] = getColombiaDate(date).split('-');
  return `${day}/${month}/${year}`;
}

const PAGE_MARGIN = 50;
const PRIMARY_COLOR = '#1E3A5F';
const MUTED_COLOR = '#6B7280';
const SUCCESS_COLOR = '#2E7D32';
const ERROR_COLOR = '#C62828';

// Dibuja el desprendible de nómina sobre un documento pdfkit ya abierto. Es
// una función pura de layout: no abre archivos, no hace streaming, no
// consulta la base de datos. El servicio que la invoca se encarga de eso.
export function drawPayrollSlip(doc: PDFKit.PDFDocument, data: PayrollSlipData): void {
  drawHeader(doc, data);
  drawEmployeeInfo(doc, data);
  drawConceptsTable(doc, data);
  drawTotals(doc, data);
  drawFooter(doc, data);
}

function drawHeader(doc: PDFKit.PDFDocument, data: PayrollSlipData): void {
  doc
    .fillColor(PRIMARY_COLOR)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(data.company.name, PAGE_MARGIN, PAGE_MARGIN);

  doc
    .fillColor(MUTED_COLOR)
    .fontSize(9)
    .font('Helvetica')
    .text(
      // El NIT queda en blanco a propósito: aún no se registra en el sistema.
      `NIT: ${data.company.nit ?? ''}`,
      PAGE_MARGIN,
      doc.y + 2,
    )
    .text(`${data.branch.name} — ${data.branch.address ?? ''}, ${data.branch.city}`);

  doc
    .fillColor('#000000')
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Comprobante de pago de nómina', PAGE_MARGIN, doc.y + 14);

  doc
    .fillColor(MUTED_COLOR)
    .fontSize(9)
    .font('Helvetica')
    .text(`Fecha de generación: ${formatDate(data.generatedAt)}`, PAGE_MARGIN, doc.y + 4)
    .text('Estado de la liquidación: Confirmada');

  doc.moveDown(1);
  drawDivider(doc);
}

function drawEmployeeInfo(doc: PDFKit.PDFDocument, data: PayrollSlipData): void {
  doc.moveDown(0.5);
  doc
    .fillColor('#000000')
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('Información del empleado');

  doc.font('Helvetica').fontSize(9);
  const filas: [string, string][] = [
    ['Nombre', data.employee.fullName],
    ['Documento', `${data.employee.documentType} ${data.employee.document}`],
    ['Cargo', data.employee.position ?? '—'],
    ['Período liquidado', `${formatDate(data.period.start)} – ${formatDate(data.period.end)}`],
    ['Fecha de liquidación', formatDate(data.period.settlementDate)],
  ];
  for (const [label, value] of filas) {
    doc
      .fillColor(MUTED_COLOR)
      .text(`${label}: `, { continued: true })
      .fillColor('#000000')
      .text(value);
  }

  doc.moveDown(1);
  drawDivider(doc);
}

function drawConceptsTable(doc: PDFKit.PDFDocument, data: PayrollSlipData): void {
  doc.moveDown(0.5);
  drawConceptSection(doc, 'Conceptos devengados', data.earnings, SUCCESS_COLOR, '+');
  doc.moveDown(0.5);
  drawConceptSection(doc, 'Deducciones', data.deductions, ERROR_COLOR, '-');
}

function drawConceptSection(
  doc: PDFKit.PDFDocument,
  title: string,
  conceptos: { conceptName: string; amount: number }[],
  color: string,
  sign: '+' | '-',
): void {
  doc.fillColor(color).fontSize(10).font('Helvetica-Bold').text(title);
  doc.font('Helvetica').fontSize(9);

  if (conceptos.length === 0) {
    doc.fillColor(MUTED_COLOR).text('Sin conceptos registrados.');
    return;
  }

  for (const concepto of conceptos) {
    const y = doc.y;
    doc.fillColor('#000000').text(concepto.conceptName, PAGE_MARGIN, y, { continued: false });
    doc.text(`${sign}${formatCurrency(concepto.amount)}`, PAGE_MARGIN, y, {
      width: doc.page.width - PAGE_MARGIN * 2,
      align: 'right',
    });
  }
}

function drawTotals(doc: PDFKit.PDFDocument, data: PayrollSlipData): void {
  doc.moveDown(1);
  drawDivider(doc);
  doc.moveDown(0.5);

  const totales: [string, number, string][] = [
    ['Total devengado', data.totalEarnings, SUCCESS_COLOR],
    ['Total deducciones', data.totalDeductions, ERROR_COLOR],
  ];
  doc.fontSize(9).font('Helvetica');
  for (const [label, amount, color] of totales) {
    const y = doc.y;
    doc.fillColor(MUTED_COLOR).text(label, PAGE_MARGIN, y);
    doc
      .fillColor(color)
      .text(formatCurrency(amount), PAGE_MARGIN, y, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: 'right',
      });
  }

  const y = doc.y + 4;
  doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold').text('Neto a pagar', PAGE_MARGIN, y);
  doc.text(formatCurrency(data.netPay), PAGE_MARGIN, y, {
    width: doc.page.width - PAGE_MARGIN * 2,
    align: 'right',
  });
}

function drawFooter(doc: PDFKit.PDFDocument, _data: PayrollSlipData): void {
  doc.moveDown(2);
  doc
    .fillColor(MUTED_COLOR)
    .fontSize(7)
    .font('Helvetica')
    .text(
      'Este documento refleja exactamente los valores registrados al momento de confirmar la liquidación.',
      PAGE_MARGIN,
      doc.y,
      { width: doc.page.width - PAGE_MARGIN * 2, align: 'center' },
    );
}

function drawDivider(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc
    .strokeColor('#E5E7EB')
    .moveTo(PAGE_MARGIN, y)
    .lineTo(doc.page.width - PAGE_MARGIN, y)
    .stroke();
  doc.moveDown(0.5);
}
