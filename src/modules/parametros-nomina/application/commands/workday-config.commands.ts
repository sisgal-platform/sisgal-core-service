/**
 * Datos de entrada del caso de uso. Viven en la capa de aplicación para que el
 * servicio no dependa de los DTOs HTTP de infraestructura; el DTO lo satisface
 * estructuralmente.
 */
export interface RegistrarJornadaLaboralCommand {
  readonly maxWeekHours: number;
  readonly maxDayHours: number;
  /** Horas en formato HH:mm. */
  readonly dayStart: string;
  readonly dayEnd: string;
  readonly nightStart: string;
  readonly nightEnd: string;
  /** Fecha desde la que rige la versión (YYYY-MM-DD). */
  readonly validFrom: string;
}
