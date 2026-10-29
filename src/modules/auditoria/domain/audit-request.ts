import { randomUUID } from 'node:crypto';
import type { AuditContext } from './audit-context';
import type { AuditInput } from './audit-input';
import type {
  AuditErrorRecord,
  AuditFieldChangeRecord,
  AuditStatus,
} from './audit-record';
import { redactSensitive, truncate, MAX_SHORT_TEXT } from './audit-sanitizer';

/** Lo mínimo que se necesita de la petición HTTP, sin depender de Express. */
export interface AuditableRequest {
  method: string;
  originalUrl?: string;
  path?: string;
  route?: { path?: unknown };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  user?: { id?: unknown; email?: unknown; role?: unknown };
  /** Lo asignan el interceptor y el filtro para que ambos usen el mismo valor. */
  auditCorrelationId?: string;
  auditContext?: AuditContext;
  auditStartedAt?: number;
}

/** Resultado de la petición que se quiere auditar. */
export interface AuditOutcome {
  status: AuditStatus;
  httpStatus: number;
  /** Se omite cuando se desconoce (por ejemplo, un rechazo antes de ejecutar el handler). */
  durationMs?: number;
  /** Nombre del controlador y del método que atendió la petición. */
  handler?: string;
  responseBody?: unknown;
  fieldChanges?: AuditFieldChangeRecord[];
  error?: AuditErrorRecord | null;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Accesos rechazados: se auditan siempre, sea cual sea el método. */
const ACCESS_DENIED_STATUSES = new Set([401, 403]);

const MAX_USER_AGENT = 512;
const MAX_IP = 64;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

/**
 * Se auditan las peticiones que modifican datos (éxito o fallo) y todo acceso
 * rechazado (401/403). Las consultas normales no se auditan: serían la mayoría
 * del tráfico y no cambian nada.
 */
export function shouldAudit(method: string, httpStatus: number): boolean {
  return isMutatingMethod(method) || ACCESS_DENIED_STATUSES.has(httpStatus);
}

/**
 * Identificador que une todos los registros de una petición. Si el cliente
 * envía uno válido se respeta (permite seguir una operación entre sistemas);
 * si no es un UUID se ignora y se genera otro, para no guardar texto
 * arbitrario del cliente.
 */
export function resolveCorrelationId(request: AuditableRequest): string {
  if (request.auditCorrelationId) {
    return request.auditCorrelationId;
  }

  const header = request.headers?.['x-correlation-id'];
  const candidate = Array.isArray(header) ? header[0] : header;
  request.auditCorrelationId = isUuid(candidate) ? candidate : randomUUID();
  return request.auditCorrelationId;
}

/** Ruta tal como se declaró en el controlador (con `:id`), sin datos del cliente. */
export function resolveRoutePath(request: AuditableRequest): string {
  const declared = request.route?.path;
  if (typeof declared === 'string' && declared.length > 0) {
    return truncate(declared, MAX_SHORT_TEXT);
  }

  // Sin ruta declarada (por ejemplo, una ruta que no existe) se usa la
  // solicitada, sin la cadena de consulta.
  const requested = request.path ?? request.originalUrl?.split('?')[0] ?? '/';
  return truncate(requested, MAX_SHORT_TEXT);
}

export function resolveAction(request: AuditableRequest): string {
  return truncate(
    `${request.method.toUpperCase()} ${resolveRoutePath(request)}`,
    MAX_SHORT_TEXT,
  );
}

/** Recurso afectado: el primer segmento fijo de la ruta ("liquidaciones", "empleados"…). */
export function resolveEntity(routePath: string): string {
  const segment = routePath
    .split('/')
    .find((part) => part.length > 0 && !part.startsWith(':'));
  return truncate(segment ?? 'desconocido', MAX_SHORT_TEXT);
}

/**
 * Identificador del registro afectado: el parámetro de la ruta si lo hay
 * (`/empleados/12`); y si no, el `id` del recurso creado en la respuesta
 * (`POST /empleados`).
 */
export function resolveEntityId(
  request: AuditableRequest,
  responseBody?: unknown,
): string | null {
  for (const [key, value] of Object.entries(request.params ?? {})) {
    if (
      /id$/i.test(key) &&
      (typeof value === 'string' || typeof value === 'number')
    ) {
      const text = String(value);
      if (text.length > 0) {
        return truncate(text, MAX_SHORT_TEXT);
      }
    }
  }

  if (typeof responseBody === 'object' && responseBody !== null) {
    const id = (responseBody as Record<string, unknown>).id;
    if (typeof id === 'string' || typeof id === 'number') {
      return truncate(String(id), MAX_SHORT_TEXT);
    }
  }

  return null;
}

function firstHeader(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text.length > 0 ? text : null;
}

/**
 * Arma lo que se guarda de una petición a partir del resultado. Es una función
 * pura: no consulta nada ni guarda nada, solo describe el evento.
 */
export function buildRequestAuditInput(
  request: AuditableRequest,
  outcome: AuditOutcome,
): AuditInput {
  const routePath = resolveRoutePath(request);
  const metadata: Record<string, unknown> = {
    method: request.method.toUpperCase(),
    path: truncate(
      request.originalUrl?.split('?')[0] ?? request.path ?? routePath,
      MAX_SHORT_TEXT,
    ),
    route: routePath,
  };

  if (outcome.durationMs !== undefined) {
    metadata.duration_ms = outcome.durationMs;
  }
  if (outcome.handler) {
    metadata.handler = outcome.handler;
  }
  if (request.query && Object.keys(request.query).length > 0) {
    metadata.query = redactSensitive(request.query);
  }
  if (
    typeof request.body === 'object' &&
    request.body !== null &&
    Object.keys(request.body).length > 0
  ) {
    metadata.request_body = redactSensitive(request.body);
  }

  // Un usuario cuyo id no es un UUID no se puede identificar en `audit_user`;
  // se deja constancia de lo que llegó en vez de perderlo.
  const rawUserId = request.user?.id;
  if (rawUserId !== undefined && !isUuid(rawUserId)) {
    metadata.invalid_user_id = truncate(String(rawUserId), MAX_SHORT_TEXT);
  }

  return {
    actor: request.user ?? null,
    action: resolveAction(request),
    entity: resolveEntity(routePath),
    entityId: resolveEntityId(request, outcome.responseBody),
    status: outcome.status,
    httpStatus: outcome.httpStatus,
    ipAddress:
      typeof request.ip === 'string' ? truncate(request.ip, MAX_IP) : null,
    userAgent: truncateOrNull(firstHeader(request.headers?.['user-agent'])),
    correlationId: resolveCorrelationId(request),
    metadata,
    fieldChanges: outcome.fieldChanges ?? [],
    error: outcome.error ?? null,
    snapshot: outcome.responseBody,
  };
}

function truncateOrNull(value: string | null): string | null {
  return value === null ? null : truncate(value, MAX_USER_AGENT);
}
