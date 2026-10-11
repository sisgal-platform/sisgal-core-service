/**
 * Lo lanza el adaptador de persistencia cuando la base de datos rechaza un
 * período de vigencia que se cruza con el de otra versión. Cubre la condición
 * de carrera entre la validación previa del servicio y la escritura, sin
 * exponer detalles del motor.
 */
export class VigenciaSuperpuestaError extends Error {
  /** @param parametro Parámetro afectado, p. ej. "la jornada laboral". */
  constructor(parametro: string) {
    super(
      `El período de vigencia se superpone con el de otra versión de ${parametro}.`,
    );
    this.name = 'VigenciaSuperpuestaError';
  }
}
