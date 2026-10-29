import type {
  AuditErrorRecord,
  AuditFieldChangeRecord,
  AuditStatus,
} from './audit-record';

/**
 * Lo que quien audita le entrega al servicio. Aún no está depurado: el
 * servicio se encarga de quitar datos sensibles y acotar los tamaños antes de
 * guardarlo.
 */
export interface AuditInput {
  /** Usuario autenticado; si falta, se atribuye al usuario anónimo. */
  actor?: { id?: unknown; email?: unknown; role?: unknown } | null;
  action: string;
  entity: string;
  entityId?: string | null;
  status: AuditStatus;
  httpStatus?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
  fieldChanges?: AuditFieldChangeRecord[];
  error?: AuditErrorRecord | null;
  /** Estado del recurso después del evento (por ejemplo, la respuesta). */
  snapshot?: unknown;
}
