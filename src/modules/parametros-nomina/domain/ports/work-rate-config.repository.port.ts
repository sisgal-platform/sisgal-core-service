import { WorkRateConfig } from '../../../../entities/work-rate-config.model';
import { CierreDeVersion } from '../vigencia';

export const WORK_RATE_CONFIG_REPOSITORY_PORT = Symbol(
  'WORK_RATE_CONFIG_REPOSITORY_PORT',
);

export interface WorkRateConfigRepositoryPort {
  /** Todas las versiones de todos los tipos de hora. */
  findAll(): Promise<WorkRateConfig[]>;
  /** Versión de cada tipo de hora que rige en la fecha indicada (YYYY-MM-DD). */
  findVigentes(fecha: string): Promise<WorkRateConfig[]>;
  /**
   * Versión con el inicio de vigencia más reciente de cada tipo indicado, esté
   * vigente o programada. Los tipos sin versiones no aparecen en el resultado.
   */
  findUltimas(types: string[]): Promise<WorkRateConfig[]>;

  /**
   * Cierra las versiones anteriores y guarda las nuevas en una sola
   * transacción: si algo falla no se aplica ningún cambio.
   *
   * @throws VigenciaSuperpuestaError si un período se cruza con otra versión del mismo tipo.
   */
  registrarVersiones(
    versiones: WorkRateConfig[],
    cierres: CierreDeVersion[],
  ): Promise<WorkRateConfig[]>;
}
