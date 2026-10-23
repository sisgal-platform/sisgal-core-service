/** El lector no pudo capturar la huella o no respondió. */
export class LecturaBiometricaError extends Error {
  constructor(readonly detalle?: string) {
    super('Error en lectura biométrica');
    this.name = 'LecturaBiometricaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** El empleado ya marcó hace menos del intervalo mínimo permitido. */
export class RegistroDuplicadoError extends Error {
  constructor() {
    super('Registro duplicado no permitido');
    this.name = 'RegistroDuplicadoError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
