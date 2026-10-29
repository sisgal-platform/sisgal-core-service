import { isUuid } from './audit-request';
import { ANONYMOUS_AUDIT_ACTOR, type AuditActor } from './audit-record';
import { MAX_SHORT_TEXT, truncate } from './audit-sanitizer';

/**
 * Convierte al usuario autenticado en el registro que se guarda en
 * `audit_user`. Solo se confía en un id con forma de UUID (el que entrega
 * Supabase); cualquier otro caso se atribuye al usuario anónimo, para no
 * guardar identificadores arbitrarios ni fallar al insertarlos.
 */
export function resolveAuditActor(
  user?: { id?: unknown; email?: unknown; role?: unknown } | null,
): AuditActor {
  if (!user || !isUuid(user.id)) {
    return ANONYMOUS_AUDIT_ACTOR;
  }

  const email =
    typeof user.email === 'string' ? truncate(user.email, MAX_SHORT_TEXT) : '';

  return {
    id: user.id.toLowerCase(),
    // No hay un nombre de usuario aparte: se identifica por el correo.
    username: email || user.id,
    email,
    role:
      typeof user.role === 'string' && user.role.length > 0
        ? truncate(user.role, MAX_SHORT_TEXT)
        : 'SIN_ROL',
  };
}
