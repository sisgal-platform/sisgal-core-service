export type AuditStatus = 'SUCCESS' | 'FAILED';

/** Quién realizó la acción, tal como se guarda en `audit_user`. */
export interface AuditActor {
  id: string;
  username: string;
  email: string;
  role: string;
}

/**
 * Las acciones sin una sesión válida (por ejemplo un intento con un token
 * inválido) se atribuyen a este usuario genérico, porque todo evento exige un
 * usuario.
 */
export const ANONYMOUS_AUDIT_ACTOR: AuditActor = {
  id: '00000000-0000-0000-0000-000000000000',
  username: 'anonimo',
  email: 'anonimo@sisgal.local',
  role: 'SIN_SESION',
};

export interface AuditFieldChangeRecord {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface AuditMetadataRecord {
  key: string;
  value: string | null;
}

export interface AuditErrorRecord {
  message: string | null;
  stackTrace: string | null;
}

/** Evento de auditoría ya depurado y listo para guardarse. */
export interface AuditRecord {
  actor: AuditActor;
  action: string;
  entity: string;
  entityId: string | null;
  status: AuditStatus;
  httpStatus: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  correlationId: string | null;
  fieldChanges: AuditFieldChangeRecord[];
  metadata: AuditMetadataRecord[];
  error: AuditErrorRecord | null;
  /** Estado completo del recurso después del evento; ya sin datos sensibles. */
  snapshot: unknown | null;
}
