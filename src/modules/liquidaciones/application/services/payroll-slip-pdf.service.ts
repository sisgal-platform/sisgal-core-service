import { Injectable, InternalServerErrorException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PayrollSlipData } from 'src/modules/liquidaciones/domain/payroll-slip';
import { drawPayrollSlip } from './payroll-slip-pdf-template';

const PDF_HEADER = '%PDF-';

@Injectable()
export class PayrollSlipPdfService {
  // Genera el PDF en memoria (sin tocar el sistema de archivos) y resuelve
  // con el buffer completo una vez pdfkit termina de escribir el documento.
  async generate(data: PayrollSlipData): Promise<Buffer> {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawPayrollSlip(doc, data);
      doc.end();
    });

    this.validateFormat(buffer);
    return buffer;
  }

  // Verificación mínima de integridad: si pdfkit no produjo un documento PDF
  // válido, es mejor informar el error que entregar un archivo corrupto.
  private validateFormat(buffer: Buffer): void {
    const header = buffer.subarray(0, PDF_HEADER.length).toString('latin1');
    if (header !== PDF_HEADER) {
      throw new InternalServerErrorException(
        'No fue posible generar el comprobante de pago en un formato PDF válido.',
      );
    }
  }
}
