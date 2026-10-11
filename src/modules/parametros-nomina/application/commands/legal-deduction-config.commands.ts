import { LegalDeductionType } from '../../domain/legal-deduction-type.enum';

/** Nuevo porcentaje de un descuento legal. */
export interface DescuentoLegalCommand {
  readonly type: LegalDeductionType;
  /** Porcentaje sobre la base de cotización, p. ej. 4 para un 4 %. */
  readonly percentage: number;
}

/**
 * Datos de entrada del caso de uso. Viven en la capa de aplicación para que el
 * servicio no dependa de los DTOs HTTP de infraestructura; el DTO lo satisface
 * estructuralmente.
 */
export interface RegistrarDescuentosLegalesCommand {
  /** Fecha desde la que rigen los nuevos porcentajes (YYYY-MM-DD). */
  readonly validFrom: string;
  /** Solo los descuentos cuyo porcentaje cambia. */
  readonly deductions: readonly DescuentoLegalCommand[];
}
