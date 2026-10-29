/** Texto que reemplaza a los valores sensibles. */
export const REDACTED = '[REDACTED]';

/** Límites para que un dato enviado por el cliente no infle la base de datos. */
export const MAX_SHORT_TEXT = 255;
export const MAX_METADATA_VALUE = 10_000;
export const MAX_ERROR_TEXT = 8_000;
export const MAX_SNAPSHOT_CHARS = 100_000;

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 200;

/**
 * Nombres de campo cuyo valor nunca debe quedar en la auditoría: credenciales,
 * tokens y datos biométricos. Se compara contra el nombre, sin importar
 * mayúsculas ni el idioma (el sistema mezcla español e inglés).
 */
const SENSITIVE_KEY =
  /pass(word|wd)?|contrase|secret|token|authorization|cookie|api[-_]?key|credential|huella|fingerprint/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Recorta un texto al máximo permitido, marcando que se cortó. */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…[recortado]` : value;
}

/**
 * Copia el valor reemplazando los campos sensibles, y acotando la
 * profundidad y la cantidad de elementos para no procesar estructuras
 * enormes o circulares. Devuelve solo datos serializables a JSON.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return null;
  }
  if (typeof value !== 'object') {
    return typeof value === 'string'
      ? truncate(value, MAX_METADATA_VALUE)
      : value;
  }
  if (depth >= MAX_DEPTH) {
    return '[profundidad máxima]';
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactSensitive(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[${value.length - MAX_ARRAY_ITEMS} elementos más]`);
    }
    return items;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : redactSensitive(item, depth + 1);
  }
  return result;
}

/**
 * Convierte un valor a texto para guardarlo como valor anterior o nuevo de un
 * campo. Los nulos se conservan como nulos.
 */
export function toAuditText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const redacted = redactSensitive(value);
  const text =
    typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
  return truncate(text ?? '', MAX_METADATA_VALUE);
}

/**
 * Deja el valor listo para la columna `json` del estado completo. Si resulta
 * demasiado grande se descarta (y se avisa con `omitted`), en vez de guardar
 * un registro a medias.
 */
export function toBoundedSnapshot(
  value: unknown,
  maxChars = MAX_SNAPSHOT_CHARS,
): { snapshot: unknown | null; omitted: boolean } {
  if (value === null || value === undefined) {
    return { snapshot: null, omitted: false };
  }

  const redacted = redactSensitive(value);
  const serialized = JSON.stringify(redacted);
  if (serialized === undefined || serialized.length > maxChars) {
    return { snapshot: null, omitted: true };
  }
  return { snapshot: redacted, omitted: false };
}
