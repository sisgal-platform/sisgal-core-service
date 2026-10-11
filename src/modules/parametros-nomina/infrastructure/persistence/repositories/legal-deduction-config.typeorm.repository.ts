import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { SystemConfig } from 'src/entities';
import { LegalDeductionConfigRepositoryPort } from '../../../domain/ports/legal-deduction-config.repository.port';
import { VigenciaSuperpuestaError } from '../../../domain/errors/vigencia-superpuesta.error';
import { CierreDeVersion } from '../../../domain/vigencia';

/** Código de PostgreSQL para violación de restricción de exclusión. */
const PG_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class LegalDeductionConfigTypeOrmRepository implements LegalDeductionConfigRepositoryPort {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly repository: Repository<SystemConfig>,

    private readonly dataSource: DataSource,
  ) {}

  async findAll(keys: string[]): Promise<SystemConfig[]> {
    if (keys.length === 0) {
      return [];
    }

    return this.repository.find({
      where: { key: In(keys) },
      order: {
        key: 'ASC',
        valid_from: 'DESC',
      },
    });
  }

  async findVigentes(keys: string[], fecha: string): Promise<SystemConfig[]> {
    if (keys.length === 0) {
      return [];
    }

    return this.repository
      .createQueryBuilder('config')
      .where('config.key IN (:...keys)', { keys })
      .andWhere('config.valid_from <= :fecha', { fecha })
      .andWhere('(config.valid_to IS NULL OR config.valid_to >= :fecha)', {
        fecha,
      })
      .orderBy('config.key', 'ASC')
      .getMany();
  }

  async findUltimas(keys: string[]): Promise<SystemConfig[]> {
    if (keys.length === 0) {
      return [];
    }

    const versiones = await this.repository.find({
      where: { key: In(keys) },
      order: {
        valid_from: 'DESC',
      },
    });

    // Vienen de la más reciente a la más antigua: la primera de cada clave es su última versión.
    const ultimaPorClave = new Map<string, SystemConfig>();

    for (const version of versiones) {
      if (!ultimaPorClave.has(version.key)) {
        ultimaPorClave.set(version.key, version);
      }
    }

    return [...ultimaPorClave.values()];
  }

  async registrarVersiones(
    versiones: SystemConfig[],
    cierres: CierreDeVersion[],
  ): Promise<SystemConfig[]> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Primero se cierran las versiones anteriores para que su período no se cruce con el nuevo.
      for (const cierre of cierres) {
        await queryRunner.manager.update(
          SystemConfig,
          { id: cierre.id },
          { valid_to: cierre.validTo },
        );
      }

      const nuevasVersiones = queryRunner.manager.create(
        SystemConfig,
        versiones,
      );

      const versionesCreadas = await queryRunner.manager.save(
        SystemConfig,
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
      return new VigenciaSuperpuestaError('los descuentos legales');
    }

    return error;
  }
}
