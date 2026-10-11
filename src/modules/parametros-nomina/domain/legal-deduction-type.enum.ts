/**
 * Descuentos legales a cargo del empleado. Sus valores son las claves de
 * `system_config` que usa el cálculo de deducciones de nómina, en el orden en
 * que se presentan.
 */
export enum LegalDeductionType {
  HEALTH_RATE = 'HEALTH_RATE',
  PENSION_RATE = 'PENSION_RATE',
}

/** Nombre de cada descuento para los mensajes que ve el administrador. */
export const NOMBRE_DESCUENTO: Record<LegalDeductionType, string> = {
  [LegalDeductionType.HEALTH_RATE]: 'salud',
  [LegalDeductionType.PENSION_RATE]: 'pensión',
};
