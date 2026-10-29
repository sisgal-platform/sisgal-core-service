import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Employee, WorkdayConfig } from 'src/entities';
import { WorkdayConfigRepositoryPort } from '../../../domain/ports/workday-config.repository.port';
import { VigenciaSuperpuestaError } from '../../../domain/errors/vigencia-superpuesta.error';
import { CierreDeVersion } from '../../../domain/vigencia';

/** Código de PostgreSQL para violación de restricción de exclusión. */
const PG_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class WorkdayConfigTypeOrmRepository implements WorkdayConfigRepositoryPort {
  constructor(
    @InjectRepository(WorkdayConfig)
    private readonly repository: Repository<WorkdayConfig>,

    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<WorkdayConfig[]> {
    return this.repository.find({
      order: {
        valid_from: 'DESC',
      },
    });
  }

  async findVigente(fecha: string): Promise<WorkdayConfig | null> {
    return this.repository
      .createQueryBuilder('config')
      .where('config.valid_from <= :fecha', { fecha })
      .andWhere('(config.valid_to IS NULL OR config.valid_to >= :fecha)', {
        fecha,
      })
      .orderBy('config.valid_from', 'DESC')
      .getOne();
  }

  async findUltima(): Promise<WorkdayConfig | null> {
    const [ultima] = await this.repository.find({
      order: {
        valid_from: 'DESC',
      },
      take: 1,
    });

    return ultima ?? null;
  }

  async registrarVersion(
    version: WorkdayConfig,
    cierre?: CierreDeVersion,
  ): Promise<WorkdayConfig> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Primero se cierra la versión anterior para que su período no se cruce con el nuevo.
      if (cierre) {
        await queryRunner.manager.update(
          WorkdayConfig,
          { id: cierre.id },
          { valid_to: cierre.validTo },
        );
      }

      const nuevaVersion = queryRunner.manager.create(WorkdayConfig, version);

      const versionCreada = await queryRunner.manager.save(
        WorkdayConfig,
        nuevaVersion,
      );

      // Los empleados asignados a la versión anterior pasan a la nueva, en la misma
      // transacción: si algo falla no se mueve a nadie ni se guarda la versión.
      if (cierre) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(Employee)
          .set({ workdayConfig: versionCreada })
          .where('workday_config_id = :anterior', { anterior: cierre.id })
          .execute();
      }

      await queryRunner.commitTransaction();

      return versionCreada;
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
      return new VigenciaSuperpuestaError('la jornada laboral');
    }

    return error;
  }
}
