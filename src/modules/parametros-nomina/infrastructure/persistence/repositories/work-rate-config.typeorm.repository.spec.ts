import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DataSource, In, QueryFailedError } from 'typeorm';

import { WorkRateConfigTypeOrmRepository } from './work-rate-config.typeorm.repository';

import { WorkRateConfig } from 'src/entities';

import { VigenciaSuperpuestaError } from '../../../domain/errors/vigencia-superpuesta.error';

describe('WorkRateConfigTypeOrmRepository', () => {
  let repository: WorkRateConfigTypeOrmRepository;

  const queryBuilderMock = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };

  const workRateConfigRepositoryMock = {
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
    },
  };

  const dataSourceMock = {
    createQueryRunner: jest.fn(),
  };

  beforeEach(async () => {
    dataSourceMock.createQueryRunner.mockReturnValue(queryRunnerMock);
    workRateConfigRepositoryMock.createQueryBuilder.mockReturnValue(
      queryBuilderMock,
    );
    queryBuilderMock.where.mockReturnValue(queryBuilderMock);
    queryBuilderMock.andWhere.mockReturnValue(queryBuilderMock);
    queryBuilderMock.orderBy.mockReturnValue(queryBuilderMock);
    queryRunnerMock.manager.create.mockImplementation(
      (_entidad: unknown, versiones: WorkRateConfig[]) => versiones,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkRateConfigTypeOrmRepository,
        {
          provide: getRepositoryToken(WorkRateConfig),
          useValue: workRateConfigRepositoryMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    repository = module.get<WorkRateConfigTypeOrmRepository>(
      WorkRateConfigTypeOrmRepository,
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
    it('debe consultar las versiones por tipo y de la más reciente a la más antigua', async () => {
      const versiones = [crearVersion('EXTRA_DIURNA')];

      workRateConfigRepositoryMock.find.mockResolvedValue(versiones);

      await expect(repository.findAll()).resolves.toBe(versiones);

      expect(workRateConfigRepositoryMock.find).toHaveBeenCalledWith({
        order: { type: 'ASC', valid_from: 'DESC' },
      });
    });
  });

  describe('findVigentes', () => {
    it('debe buscar las versiones cuyo período contiene la fecha', async () => {
      const versiones = [crearVersion('EXTRA_DIURNA')];

      queryBuilderMock.getMany.mockResolvedValue(versiones);

      await expect(repository.findVigentes('2026-10-11')).resolves.toBe(
        versiones,
      );

      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        'rate.valid_from <= :fecha',
        { fecha: '2026-10-11' },
      );
      // Una versión sin fecha de fin rige hasta que se registre la siguiente.
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(rate.valid_to IS NULL OR rate.valid_to >= :fecha)',
        { fecha: '2026-10-11' },
      );
    });
  });

  describe('findUltimas', () => {
    it('debe retornar la versión más reciente de cada tipo de hora', async () => {
      const extraProgramada = crearVersion('EXTRA_DIURNA');
      const extraVigente = crearVersion('EXTRA_DIURNA');
      const dominical = crearVersion('DOMINICAL_DIURNA');

      // El repositorio las entrega de la más reciente a la más antigua.
      workRateConfigRepositoryMock.find.mockResolvedValue([
        extraProgramada,
        dominical,
        extraVigente,
      ]);

      const resultado = await repository.findUltimas([
        'EXTRA_DIURNA',
        'DOMINICAL_DIURNA',
      ]);

      expect(resultado).toEqual([extraProgramada, dominical]);
      expect(resultado[0]).toBe(extraProgramada);
      expect(workRateConfigRepositoryMock.find).toHaveBeenCalledWith({
        where: { type: In(['EXTRA_DIURNA', 'DOMINICAL_DIURNA']) },
        order: { valid_from: 'DESC' },
      });
    });

    it('no debe consultar la base de datos cuando no se indican tipos', async () => {
      await expect(repository.findUltimas([])).resolves.toEqual([]);

      expect(workRateConfigRepositoryMock.find).not.toHaveBeenCalled();
    });
  });

  // =========================================================
  // registrarVersiones
  // =========================================================

  describe('registrarVersiones', () => {
    it('debe guardar todas las versiones dentro de una sola transacción', async () => {
      const versiones = [
        crearVersion('EXTRA_DIURNA'),
        crearVersion('EXTRA_NOCTURNA'),
      ];

      queryRunnerMock.manager.save.mockResolvedValue(versiones);

      await expect(repository.registrarVersiones(versiones, [])).resolves.toBe(
        versiones,
      );

      expect(queryRunnerMock.manager.update).not.toHaveBeenCalled();
      expect(queryRunnerMock.manager.save).toHaveBeenCalledTimes(1);
      expect(queryRunnerMock.manager.save).toHaveBeenCalledWith(
        WorkRateConfig,
        versiones,
      );
      expect(dataSourceMock.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(queryRunnerMock.startTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunnerMock.commitTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunnerMock.rollbackTransaction).not.toHaveBeenCalled();
      expect(queryRunnerMock.release).toHaveBeenCalled();
    });

    it('debe cerrar cada versión anterior antes de guardar las nuevas', async () => {
      const versiones = [
        crearVersion('EXTRA_DIURNA'),
        crearVersion('EXTRA_NOCTURNA'),
      ];
      const validTo = new Date(2026, 9, 31, 12);

      queryRunnerMock.manager.save.mockResolvedValue(versiones);

      await repository.registrarVersiones(versiones, [
        { id: 3, validTo },
        { id: 4, validTo },
      ]);

      // Solo cambia la fecha de fin: los valores de las versiones anteriores se conservan.
      expect(queryRunnerMock.manager.update).toHaveBeenNthCalledWith(
        1,
        WorkRateConfig,
        { id: 3 },
        { valid_to: validTo },
      );
      expect(queryRunnerMock.manager.update).toHaveBeenNthCalledWith(
        2,
        WorkRateConfig,
        { id: 4 },
        { valid_to: validTo },
      );
      expect(
        queryRunnerMock.manager.update.mock.invocationCallOrder[1],
      ).toBeLessThan(queryRunnerMock.manager.save.mock.invocationCallOrder[0]);
    });

    it('no debe aplicar ningún cierre si falla el guardado de las nuevas versiones', async () => {
      const error = new Error('Conexión perdida');

      queryRunnerMock.manager.save.mockRejectedValue(error);

      await expect(
        repository.registrarVersiones(
          [crearVersion('EXTRA_DIURNA')],
          [{ id: 3, validTo: new Date(2026, 9, 31, 12) }],
        ),
      ).rejects.toBe(error);

      expect(queryRunnerMock.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.release).toHaveBeenCalled();
    });

    it('debe hacer rollback y traducir la violación de la restricción de vigencias superpuestas', async () => {
      queryRunnerMock.manager.save.mockRejectedValue(crearErrorExclusion());

      await expect(
        repository.registrarVersiones([crearVersion('EXTRA_DIURNA')], []),
      ).rejects.toBeInstanceOf(VigenciaSuperpuestaError);

      expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.release).toHaveBeenCalled();
    });
  });
});

// =========================================================
// Utilidades
// =========================================================

function crearVersion(type: string): WorkRateConfig {
  return Object.assign(new WorkRateConfig(), {
    type,
    multiplier: 1.3,
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
