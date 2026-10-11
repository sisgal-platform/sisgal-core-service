import { WorkdayConfig } from '../../../../entities/workday-config.model';
import { CierreDeVersion } from '../vigencia';

export const WORKDAY_CONFIG_REPOSITORY_PORT = Symbol(
  'WORKDAY_CONFIG_REPOSITORY_PORT',
);

export interface WorkdayConfigRepositoryPort {
  /** Todas las versiones, de la más reciente a la más antigua. */
  findAll(): Promise<WorkdayConfig[]>;
  /** Versión que rige en la fecha indicada (YYYY-MM-DD). */
  findVigente(fecha: string): Promise<WorkdayConfig | null>;
  /** Versión con el inicio de vigencia más reciente, esté vigente o programada. */
  findUltima(): Promise<WorkdayConfig | null>;

  /**
   * Cierra la versión anterior y guarda la nueva en una sola transacción: si
   * algo falla no se aplica ninguno de los dos cambios.
   *
   * @throws VigenciaSuperpuestaError si el período se cruza con otra versión.
   */
  registrarVersion(
    version: WorkdayConfig,
    cierre?: CierreDeVersion,
  ): Promise<WorkdayConfig>;
}
