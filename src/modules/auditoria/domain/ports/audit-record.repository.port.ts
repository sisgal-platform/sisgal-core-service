import type { AuditRecord } from '../audit-record';

export const AUDIT_RECORD_REPOSITORY_PORT = Symbol(
  'AUDIT_RECORD_REPOSITORY_PORT',
);

export interface AuditRecordRepositoryPort {
  /**
   * Guarda el evento junto con todo su detalle en una sola transacción: o
   * queda completo o no queda nada.
   */
  save(record: AuditRecord): Promise<void>;
}
