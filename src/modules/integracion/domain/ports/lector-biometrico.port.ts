export const LECTOR_BIOMETRICO_PORT = Symbol('LECTOR_BIOMETRICO_PORT');

/** Lo que entrega el lector cuando el empleado coloca el dedo. */
export interface LecturaBiometrica {
  /** false si el sensor no logró capturar la huella o el lector no respondió. */
  capturaExitosa: boolean;
  /** Huella capturada; solo el adaptador del lector sabe interpretarla. */
  huella?: string;
}

export interface LectorBiometricoPort {
  /**
   * Busca la huella entre las registradas en el lector y devuelve el documento
   * del empleado al que pertenece, o null si la huella no está registrada.
   * Lanza LecturaBiometricaError si el lector falla durante la comparación.
   */
  identificar(huella: string): Promise<string | null>;
}
