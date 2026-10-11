import { WorkRateType } from '../../domain/work-rate-type.enum';

/** Nuevo multiplicador de un tipo de hora. */
export interface RecargoCommand {
  readonly type: WorkRateType;
  /** Factor sobre el valor de la hora ordinaria, p. ej. 1.25 para un recargo del 25 %. */
  readonly multiplier: number;
}

/**
 * Datos de entrada del caso de uso. Viven en la capa de aplicación para que el
 * servicio no dependa de los DTOs HTTP de infraestructura; el DTO lo satisface
 * estructuralmente.
 */
export interface RegistrarRecargosCommand {
  /** Fecha desde la que rigen los nuevos multiplicadores (YYYY-MM-DD). */
  readonly validFrom: string;
  /** Solo los tipos de hora cuyo multiplicador cambia. */
  readonly rates: readonly RecargoCommand[];
}
