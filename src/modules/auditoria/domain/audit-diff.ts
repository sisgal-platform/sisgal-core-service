import type { AuditFieldChangeRecord } from './audit-record';
import { toAuditText } from './audit-sanitizer';

/**
 * Valor en una forma comparable. La base de datos entrega los decimales como
 * texto ("1200000.00") y el código los maneja como número (1200000): sin
 * normalizar, cada guardado parecería un cambio aunque el valor sea el mismo.
 */
function normalize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (value instanceof Date) {
    return `date:${value.getTime()}`;
  }
  if (
    (typeof value === 'string' &&
      value.trim() !== '' &&
      !Number.isNaN(Number(value))) ||
    typeof value === 'number'
  ) {
    return `num:${Number(value)}`;
  }
  return `json:${JSON.stringify(value)}`;
}

export function valuesDiffer(before: unknown, after: unknown): boolean {
  return normalize(before) !== normalize(after);
}

/**
 * Describe el cambio de un campo, o devuelve null si el valor en realidad no
 * cambió. El nombre incluye la tabla y el id del registro porque una misma
 * petición puede modificar varios registros.
 */
export function describeFieldChange(
  table: string,
  recordId: unknown,
  property: string,
  before: unknown,
  after: unknown,
): AuditFieldChangeRecord | null {
  if (!valuesDiffer(before, after)) {
    return null;
  }

  return {
    fieldName: `${table}[${String(recordId ?? '?')}].${property}`,
    oldValue: toAuditText(before),
    newValue: toAuditText(after),
  };
}
