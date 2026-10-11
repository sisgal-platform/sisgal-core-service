import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { WorkRateConfig } from 'src/entities';
import { WorkRateConfigRepositoryPort } from '../../../domain/ports/work-rate-config.repository.port';
import { VigenciaSuperpuestaError } from '../../../domain/errors/vigencia-superpuesta.error';
import { CierreDeVersion } from '../../../domain/vigencia';

/** Código de PostgreSQL para violación de restricción de exclusión. */
const PG_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class WorkRateConfigTypeOrmRepository implements WorkRateConfigRepositoryPort {
  constructor(
    @InjectRepository(WorkRateConfig)
    private readonly repository: Repository<WorkRateConfig>,

    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<WorkRateConfig[]> {
    return this.repository.find({
      order: {
        type: 'ASC',
        valid_from: 'DESC',
      },
    });
  }

  async findVigentes(fecha: string): Promise<WorkRateConfig[]> {
    return this.repository
      .createQueryBuilder('rate')
      .where('rate.valid_from <= :fecha', { fecha })
      .andWhere('(rate.valid_to IS NULL OR rate.valid_to >= :fecha)', {
        fecha,
      })
      .orderBy('rate.type', 'ASC')
      .getMany();
  }

  async findUltimas(types: string[]): Promise<WorkRateConfig[]> {
    if (types.length === 0) {
      return [];
    }

    const versiones = await this.repository.find({
      where: { type: In(types) },
      order: {
        valid_from: 'DESC',
      },
    });

    // Vienen de la más reciente a la más antigua: la primera de cada tipo es su última versión.
    const ultimaPorTipo = new Map<string, WorkRateConfig>();

    for (const version of versiones) {
      if (!ultimaPorTipo.has(version.type)) {
        ultimaPorTipo.set(version.type, version);
      }
    }

    return [...ultimaPorTipo.values()];
  }

  async registrarVersiones(
    versiones: WorkRateConfig[],
    cierres: CierreDeVersion[],
  ): Promise<WorkRateConfig[]> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Primero se cierran las versiones anteriores para que su período no se cruce con el nuevo.
      for (const cierre of cierres) {
        await queryRunner.manager.update(
          WorkRateConfig,
          { id: cierre.id },
          { valid_to: cierre.validTo },
        );
      }

      const nuevasVersiones = queryRunner.manager.create(
        WorkRateConfig,
        versiones,
      );

      const versionesCreadas = await queryRunner.manager.save(
        WorkRateConfig,
        nuevasVersiones,
      );

      await queryRunner.commitTransaction();

      return versionesCreadas;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw this.traducirError(error);
    } finally {
      await queryRunner.release();
    }
  }

  private traducirError(error: unknown): unknown {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code ===
        PG_EXCLUSION_VIOLATION
    ) {
      return new VigenciaSuperpuestaError('los recargos laborales');
    }

    return error;
  }
}
