import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DataSource, QueryFailedError } from 'typeorm';

import { WorkdayConfigTypeOrmRepository } from './workday-config.typeorm.repository';

import { Employee, WorkdayConfig } from 'src/entities';

import { VigenciaSuperpuestaError } from '../../../domain/errors/vigencia-superpuesta.error';

describe('WorkdayConfigTypeOrmRepository', () => {
  let repository: WorkdayConfigTypeOrmRepository;

  const queryBuilderMock = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getOne: jest.fn(),
  };

  const workdayConfigRepositoryMock = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const queryRunnerMock = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    },
  };

  // Cadena de query builder con la que se mueven los empleados a la versión nueva
  const reasignacionMock = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    execute: jest.fn(),
  };

  const dataSourceMock = {
    createQueryRunner: jest.fn(),
  };

  beforeEach(async () => {
    dataSourceMock.createQueryRunner.mockReturnValue(queryRunnerMock);
    workdayConfigRepositoryMock.createQueryBuilder.mockReturnValue(
      queryBuilderMock,
    );
    queryBuilderMock.where.mockReturnValue(queryBuilderMock);
    queryBuilderMock.andWhere.mockReturnValue(queryBuilderMock);
    queryBuilderMock.orderBy.mockReturnValue(queryBuilderMock);
    queryRunnerMock.manager.createQueryBuilder.mockReturnValue(
      reasignacionMock,
    );
    reasignacionMock.update.mockReturnValue(reasignacionMock);
    reasignacionMock.set.mockReturnValue(reasignacionMock);
    reasignacionMock.where.mockReturnValue(reasignacionMock);
    reasignacionMock.execute.mockResolvedValue({ affected: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkdayConfigTypeOrmRepository,
        {
          provide: getRepositoryToken(WorkdayConfig),
          useValue: workdayConfigRepositoryMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    repository = module.get<WorkdayConfigTypeOrmRepository>(
      WorkdayConfigTypeOrmRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(repository).toBeDefined();
  });

  // =========================================================
  // Consultas
  // =========================================================

  describe('findAll', () => {
    it('debe consultar las versiones de la más reciente a la más antigua', async () => {
      const versiones = [new WorkdayConfig()];

      workdayConfigRepositoryMock.find.mockResolvedValue(versiones);

      await expect(repository.findAll()).resolves.toBe(versiones);

      expect(workdayConfigRepositoryMock.find).toHaveBeenCalledWith({
        order: { valid_from: 'DESC' },
      });
    });
  });

  describe('findVigente', () => {
    it('debe buscar la versión cuyo período contiene la fecha', async () => {
      const version = new WorkdayConfig();

      queryBuilderMock.getOne.mockResolvedValue(version);

      await expect(repository.findVigente('2026-10-11')).resolves.toBe(version);

      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        'config.valid_from <= :fecha',
        { fecha: '2026-10-11' },
      );
      // Una versión sin fecha de fin rige hasta que se registre la siguiente.
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(config.valid_to IS NULL OR config.valid_to >= :fecha)',
        { fecha: '2026-10-11' },
      );
    });

    it('debe retornar null cuando ninguna versión rige en la fecha', async () => {
      queryBuilderMock.getOne.mockResolvedValue(null);

      await expect(repository.findVigente('2025-01-01')).resolves.toBeNull();
    });
  });

  describe('findUltima', () => {
    it('debe retornar la versión con el inicio de vigencia más reciente', async () => {
      const ultima = new WorkdayConfig();

      workdayConfigRepositoryMock.find.mockResolvedValue([ultima]);

      await expect(repository.findUltima()).resolves.toBe(ultima);

      expect(workdayConfigRepositoryMock.find).toHaveBeenCalledWith({
        order: { valid_from: 'DESC' },
        take: 1,
      });
    });

    it('debe retornar null cuando no hay versiones', async () => {
      workdayConfigRepositoryMock.find.mockResolvedValue([]);

      await expect(repository.findUltima()).resolves.toBeNull();
    });
  });

  // =========================================================
  // registrarVersion
  // =========================================================

  describe('registrarVersion', () => {
    it('debe guardar la primera versión dentro de una transacción', async () => {
      const version = crearVersion();
      const guardada = Object.assign(crearVersion(), { id: 1 });

      queryRunnerMock.manager.create.mockReturnValue(version);
      queryRunnerMock.manager.save.mockResolvedValue(guardada);

      await expect(repository.registrarVersion(version)).resolves.toBe(
        guardada,
      );

      expect(queryRunnerMock.manager.update).not.toHaveBeenCalled();
      expect(queryRunnerMock.manager.save).toHaveBeenCalledWith(
        WorkdayConfig,
        version,
      );
      expect(queryRunnerMock.startTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.commitTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.rollbackTransaction).not.toHaveBeenCalled();
      expect(queryRunnerMock.release).toHaveBeenCalled();
    });

    it('debe cerrar la versión anterior antes de guardar la nueva, en la misma transacción', async () => {
      const version = crearVersion();
      const validTo = new Date(2026, 9, 31, 12);

      queryRunnerMock.manager.create.mockReturnValue(version);
      queryRunnerMock.manager.save.mockResolvedValue(version);

      await repository.registrarVersion(version, { id: 1, validTo });

      // Solo cambia la fecha de fin: los valores de la versión anterior se conservan.
      expect(queryRunnerMock.manager.update).toHaveBeenCalledWith(
        WorkdayConfig,
        { id: 1 },
        { valid_to: validTo },
      );
      expect(
        queryRunnerMock.manager.update.mock.invocationCallOrder[0],
      ).toBeLessThan(queryRunnerMock.manager.save.mock.invocationCallOrder[0]);
      expect(dataSourceMock.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(queryRunnerMock.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('debe mover a la versión nueva los empleados asignados a la anterior, en la misma transacción', async () => {
      const version = crearVersion();
      const guardada = Object.assign(crearVersion(), { id: 9 });

      queryRunnerMock.manager.create.mockReturnValue(version);
      queryRunnerMock.manager.save.mockResolvedValue(guardada);

      await repository.registrarVersion(version, {
        id: 1,
        validTo: new Date(2026, 9, 31, 12),
      });

      expect(reasignacionMock.update).toHaveBeenCalledWith(Employee);
      expect(reasignacionMock.set).toHaveBeenCalledWith({
        workdayConfig: guardada,
      });
      expect(reasignacionMock.where).toHaveBeenCalledWith(
        'workday_config_id = :anterior',
        { anterior: 1 },
      );
      expect(reasignacionMock.execute).toHaveBeenCalledTimes(1);
      expect(
        reasignacionMock.execute.mock.invocationCallOrder[0],
      ).toBeLessThan(
        queryRunnerMock.commitTransaction.mock.invocationCallOrder[0],
      );
    });

    it('no debe mover empleados al guardar la primera versión', async () => {
      const version = crearVersion();

      queryRunnerMock.manager.create.mockReturnValue(version);
      queryRunnerMock.manager.save.mockResolvedValue(version);

      await repository.registrarVersion(version);

      expect(reasignacionMock.execute).not.toHaveBeenCalled();
    });

    it('debe hacer rollback si falla el movimiento de los empleados', async () => {
      const version = crearVersion();
      const error = new Error('Conexión perdida');

      queryRunnerMock.manager.create.mockReturnValue(version);
      queryRunnerMock.manager.save.mockResolvedValue(version);
      reasignacionMock.execute.mockRejectedValue(error);

      await expect(
        repository.registrarVersion(version, {
          id: 1,
          validTo: new Date(2026, 9, 31, 12),
        }),
      ).rejects.toBe(error);

      expect(queryRunnerMock.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
    });

    it('no debe aplicar el cierre de la versión anterior si falla el guardado de la nueva', async () => {
      const version = crearVersion();
      const error = new Error('Conexión perdida');

      queryRunnerMock.manager.create.mockReturnValue(version);
      queryRunnerMock.manager.save.mockRejectedValue(error);

      await expect(
        repository.registrarVersion(version, {
          id: 1,
          validTo: new Date(2026, 9, 31, 12),
        }),
      ).rejects.toBe(error);

      expect(queryRunnerMock.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.release).toHaveBeenCalled();
    });

    it('debe hacer rollback y traducir la violación de la restricción de vigencias superpuestas', async () => {
      const version = crearVersion();

      queryRunnerMock.manager.create.mockReturnValue(version);
      queryRunnerMock.manager.save.mockRejectedValue(crearErrorExclusion());

      await expect(repository.registrarVersion(version)).rejects.toBeInstanceOf(
        VigenciaSuperpuestaError,
      );

      expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.release).toHaveBeenCalled();
    });
  });
});

// =========================================================
// Utilidades
// =========================================================

function crearVersion(): WorkdayConfig {
  return Object.assign(new WorkdayConfig(), {
    max_week_hours: 42,
    max_day_hours: 8,
    day_start: '06:00',
    day_end: '19:00',
    night_start: '19:00',
    night_end: '06:00',
    valid_from: new Date(2026, 10, 1, 12),
    valid_to: null,
  });
}

function crearErrorExclusion(): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code: '23P01',
    message: 'conflicting key value violates exclusion constraint',
  } as unknown as Error);
}
