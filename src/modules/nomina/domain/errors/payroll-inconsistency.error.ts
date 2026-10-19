/**
 * Información del empleado que impide liquidarlo correctamente. Cada causa es
 * un mensaje que el administrador puede corregir; el cálculo no entrega un
 * resultado parcial mientras exista alguna.
 */
export class PayrollInconsistencyError extends Error {
  constructor(readonly causes: string[]) {
    super(causes.join(' '));
    this.name = 'PayrollInconsistencyError';
  }
}
