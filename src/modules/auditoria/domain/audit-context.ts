import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuditFieldChangeRecord } from './audit-record';

/**
 * Lo que se va acumulando durante una petición para incluirlo en su evento.
 * Hoy son los cambios de campos que detecta el suscriptor de TypeORM.
 */
export interface AuditContext {
  fieldChanges: AuditFieldChangeRecord[];
}

/** Máximo de cambios de campos por evento, para que una carga masiva no crezca sin límite. */
export const MAX_FIELD_CHANGES_PER_EVENT = 500;

/**
 * Contexto de la petición en curso. El suscriptor de TypeORM no tiene acceso a
 * la petición HTTP; este almacenamiento le permite entregar sus hallazgos al
 * evento de la petición que está ejecutándose, sin mezclar peticiones
 * concurrentes entre sí.
 */
export const auditContext = new AsyncLocalStorage<AuditContext>();
