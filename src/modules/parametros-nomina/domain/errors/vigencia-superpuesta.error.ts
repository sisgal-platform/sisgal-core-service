/**
 * Lo lanza el adaptador de persistencia cuando la base de datos rechaza un
 * período de vigencia que se cruza con el de otra versión. Cubre la condición
 * de carrera entre la validación previa del servicio y la escritura, sin
 * exponer detalles del motor.
 */
export class VigenciaSuperpuestaError extends Error {
  constructor() {
    super(
      'El período de vigencia se superpone con el de otra versión de la jornada laboral.',
    );
    this.name = 'VigenciaSuperpuestaError';
  }
}
