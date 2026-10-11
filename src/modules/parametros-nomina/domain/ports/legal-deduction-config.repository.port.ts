import { SystemConfig } from '../../../../entities/system-config.model';
import { CierreDeVersion } from '../vigencia';

export const LEGAL_DEDUCTION_CONFIG_REPOSITORY_PORT = Symbol(
  'LEGAL_DEDUCTION_CONFIG_REPOSITORY_PORT',
);

/**
 * `system_config` guarda también parámetros que no son descuentos legales, por
 * lo que todas las consultas se limitan a las claves indicadas.
 */
export interface LegalDeductionConfigRepositoryPort {
  /** Todas las versiones de los parámetros indicados. */
  findAll(keys: string[]): Promise<SystemConfig[]>;
  /** Versión de cada parámetro indicado que rige en la fecha (YYYY-MM-DD). */
  findVigentes(keys: string[], fecha: string): Promise<SystemConfig[]>;
  /**
   * Versión con el inicio de vigencia más reciente de cada parámetro indicado,
   * esté vigente o programada. Los que no tienen versiones no aparecen.
   */
  findUltimas(keys: string[]): Promise<SystemConfig[]>;

  /**
   * Cierra las versiones anteriores y guarda las nuevas en una sola
   * transacción: si algo falla no se aplica ningún cambio.
   *
   * @throws VigenciaSuperpuestaError si un período se cruza con otra versión del mismo parámetro.
   */
  registrarVersiones(
    versiones: SystemConfig[],
    cierres: CierreDeVersion[],
  ): Promise<SystemConfig[]>;
}
