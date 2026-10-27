import { RegistroDuplicadoError } from './errors/marcacion.errors';
import { TipoMarcacion } from './value-objects/tipo-marcacion.enum';

const MILISEGUNDOS_POR_MINUTO = 60_000;

/** Dos marcaciones del mismo empleado deben estar separadas al menos un minuto. */
export const INTERVALO_MINIMO_ENTRE_MARCACIONES_MS = MILISEGUNDOS_POR_MINUTO;

/**
 * Tiempo máximo que una entrada sin salida sigue esperando su salida. Pasado
 * ese tiempo se asume que el empleado olvidó marcar la salida: la entrada queda
 * incompleta y la siguiente marcación abre una jornada nueva. Es más amplio que
 * un día calendario para que los turnos que cruzan la medianoche cierren bien.
 */
export const DURACION_MAXIMA_JORNADA_ABIERTA_MS =
  16 * 60 * MILISEGUNDOS_POR_MINUTO;

/** Lo que se necesita saber del último registro de asistencia del empleado. */
export interface UltimaJornada {
  entrada: Date;
  salida: Date | null;
}

/**
 * Decide si la marcación es una entrada o una salida a partir de la última
 * jornada del empleado. Una entrada sin salida reciente se cierra con esta
 * marcación; en cualquier otro caso empieza una jornada nueva, lo que permite
 * varias jornadas en el mismo día sin dos entradas seguidas.
 */
export function determinarTipoMarcacion(
  ultimaJornada: UltimaJornada | null,
  fechaHora: Date,
): TipoMarcacion {
  if (!ultimaJornada) {
    return TipoMarcacion.ENTRADA;
  }

  const ultimaMarcacion = ultimaJornada.salida ?? ultimaJornada.entrada;

  if (
    fechaHora.getTime() - ultimaMarcacion.getTime() <
    INTERVALO_MINIMO_ENTRE_MARCACIONES_MS
  ) {
    throw new RegistroDuplicadoError();
  }

  const tieneEntradaAbierta =
    ultimaJornada.salida === null &&
    fechaHora.getTime() - ultimaJornada.entrada.getTime() <=
      DURACION_MAXIMA_JORNADA_ABIERTA_MS;

  return tieneEntradaAbierta ? TipoMarcacion.SALIDA : TipoMarcacion.ENTRADA;
}
