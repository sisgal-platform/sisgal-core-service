import { Injectable } from '@nestjs/common';
import { LectorBiometricoPort } from '../../domain/ports/lector-biometrico.port';

/**
 * Lector de huella simulado: el proyecto no cuenta con el dispositivo físico.
 *
 * Un lector real compara la huella con las que tiene enroladas y entrega el
 * número de usuario con el que se enroló a la persona; aquí ese número es el
 * documento del empleado, así que la huella simulada es el propio documento.
 * Mientras no exista el registro de huellas (HU24), todo empleado cuenta como
 * enrolado y un documento desconocido equivale a una huella no registrada.
 *
 * Con el lector real, este adaptador se reemplaza por uno que use su SDK o su
 * protocolo; el servicio de registro de marcaciones no cambia.
 */
@Injectable()
export class LectorBiometricoSimuladoAdapter implements LectorBiometricoPort {
  identificar(huella: string): Promise<string | null> {
    const documento = huella.trim();

    return Promise.resolve(documento === '' ? null : documento);
  }
}
