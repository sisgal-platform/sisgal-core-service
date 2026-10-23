import { Injectable, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common';
import { PAYROLL_CSV_HEADERS, PayrollCsvRow } from 'src/modules/liquidaciones/domain/payroll-csv';
import { buildPayrollCsv } from './payroll-csv-template';

// BOM UTF-8: sin esto, Excel (el destino más común de un CSV contable)
// interpreta el archivo en una codificación distinta y daña las tildes/ñ.
const UTF8_BOM = '﻿';
const EXPECTED_HEADER = PAYROLL_CSV_HEADERS.join(',');

@Injectable()
export class PayrollCsvService {
  generate(rows: PayrollCsvRow[]): Buffer {
    // Sin filas no hay nada que exportar (información incompleta para la
    // integración contable): mejor informarlo que entregar un CSV vacío.
    if (rows.length === 0) {
      throw new UnprocessableEntityException(
        'La liquidación no tiene conceptos ni totales para exportar.',
      );
    }

    const csv = buildPayrollCsv(rows);
    const buffer = Buffer.from(UTF8_BOM + csv, 'utf-8');

    this.validateFormat(buffer, rows.length);
    return buffer;
  }

  // Verificación mínima de integridad: el archivo debe empezar con el BOM
  // esperado, tener exactamente el encabezado definido y una fila por cada
  // registro que se intentó exportar. Si no, es mejor informar el error que
  // entregar un CSV corrupto o incompleto.
  private validateFormat(buffer: Buffer, expectedRows: number): void {
    const tieneBom = buffer.subarray(0, 3).toString('utf-8') === UTF8_BOM;
    const texto = buffer.toString('utf-8').replace(/^﻿/, '');
    const lineas = texto.split('\r\n').filter((linea) => linea.length > 0);
    const encabezadoValido = lineas[0] === EXPECTED_HEADER;

    if (!tieneBom || !encabezadoValido || lineas.length !== expectedRows + 1) {
      throw new InternalServerErrorException(
        'No fue posible generar el archivo de exportación contable en un formato válido.',
      );
    }
  }
}
