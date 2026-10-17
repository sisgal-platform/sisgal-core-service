import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PayrollSlipData } from 'src/modules/liquidaciones/domain/payroll-slip';
import { drawPayrollSlip } from './payroll-slip-pdf-template';

@Injectable()
export class PayrollSlipPdfService {
  // Genera el PDF en memoria (sin tocar el sistema de archivos) y resuelve
  // con el buffer completo una vez pdfkit termina de escribir el documento.
  generate(data: PayrollSlipData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawPayrollSlip(doc, data);
      doc.end();
    });
  }
}
