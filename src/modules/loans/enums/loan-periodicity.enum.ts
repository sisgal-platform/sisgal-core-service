/**
 * Cada cuánto se descuenta una cuota del préstamo. Cada periodicidad tiene
 * sus fechas de corte: una liquidación descuenta una cuota por cada fecha de
 * corte que cae dentro de su período.
 */
export enum LoanPeriodicity {
  /** Corte el último día de cada mes. */
  MENSUAL = 'MENSUAL',
  /** Cortes el día 15 y el último día de cada mes. */
  QUINCENAL = 'QUINCENAL',
}
