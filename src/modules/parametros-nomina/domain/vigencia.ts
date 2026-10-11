/** Estado de una versión de un parámetro respecto a la fecha de consulta. */
export enum EstadoVigencia {
  VIGENTE = 'VIGENTE',
  PROGRAMADA = 'PROGRAMADA',
  HISTORICA = 'HISTORICA',
}

/** Cierre de la versión anterior: su vigencia termina el día previo al inicio de la nueva. */
export interface CierreDeVersion {
  readonly id: number;
  readonly validTo: Date;
}

/**
 * Fecha calendario (YYYY-MM-DD) de una columna `date`. TypeORM la entrega como
 * texto al consultar, aunque la entidad la declare como Date.
 */
export function aFechaCalendario(valor: Date | string): string {
  if (typeof valor === 'string') {
    return valor.slice(0, 10);
  }

  const anio = String(valor.getFullYear()).padStart(4, '0');
  const mes = String(valor.getMonth() + 1).padStart(2, '0');
  const dia = String(valor.getDate()).padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}

/**
 * Date al mediodía local del día indicado (YYYY-MM-DD): conserva el día
 * calendario al persistirse en una columna `date`, sin importar la zona
 * horaria del servidor.
 */
export function aDate(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);

  return new Date(anio, mes - 1, dia, 12);
}

/** Día calendario anterior al indicado (YYYY-MM-DD). */
export function diaAnterior(fecha: string): string {
  const calendario = new Date(`${fecha}T12:00:00Z`);
  calendario.setUTCDate(calendario.getUTCDate() - 1);

  return calendario.toISOString().slice(0, 10);
}

/**
 * Una versión sin fecha de fin rige hasta que se registre la siguiente. Las
 * fechas YYYY-MM-DD se comparan como texto porque su orden coincide con el
 * cronológico.
 */
export function estadoDeVigencia(
  validFrom: string,
  validTo: string | null,
  fecha: string,
): EstadoVigencia {
  if (validFrom > fecha) {
    return EstadoVigencia.PROGRAMADA;
  }

  if (validTo !== null && validTo < fecha) {
    return EstadoVigencia.HISTORICA;
  }

  return EstadoVigencia.VIGENTE;
}
