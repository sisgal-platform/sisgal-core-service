import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DataSource, In, QueryFailedError } from 'typeorm';

import { LegalDeductionConfigTypeOrmRepository } from './legal-deduction-config.typeorm.repository';

import { SystemConfig } from 'src/entities';

import { VigenciaSuperpuestaError } from '../../../domain/errors/vigencia-superpuesta.error';

describe('LegalDeductionConfigTypeOrmRepository', () => {
  let repository: LegalDeductionConfigTypeOrmRepository;

  const CLAVES = ['HEALTH_RATE', 'PENSION_RATE'];

  const queryBuilderMock = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };

  const systemConfigRepositoryMock = {
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
    systemConfigRepositoryMock.createQueryBuilder.mockReturnValue(
      queryBuilderMock,
    );
    queryBuilderMock.where.mockReturnValue(queryBuilderMock);
    queryBuilderMock.andWhere.mockReturnValue(queryBuilderMock);
    queryBuilderMock.orderBy.mockReturnValue(queryBuilderMock);
    queryRunnerMock.manager.create.mockImplementation(
      (_entidad: unknown, versiones: SystemConfig[]) => versiones,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalDeductionConfigTypeOrmRepository,
        {
          provide: getRepositoryToken(SystemConfig),
          useValue: systemConfigRepositoryMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    repository = module.get<LegalDeductionConfigTypeOrmRepository>(
      LegalDeductionConfigTypeOrmRepository,
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
    it('debe consultar solo las claves indicadas, de la versión más reciente a la más antigua', async () => {
      const versiones = [crearVersion('HEALTH_RATE')];

      systemConfigRepositoryMock.find.mockResolvedValue(versiones);

      await expect(repository.findAll(CLAVES)).resolves.toBe(versiones);

      expect(systemConfigRepositoryMock.find).toHaveBeenCalledWith({
        where: { key: In(CLAVES) },
        order: { key: 'ASC', valid_from: 'DESC' },
      });
    });

    it('no debe consultar la base de datos cuando no se indican claves', async () => {
      await expect(repository.findAll([])).resolves.toEqual([]);

      expect(systemConfigRepositoryMock.find).not.toHaveBeenCalled();
    });
  });

  describe('findVigentes', () => {
    it('debe buscar las versiones de las claves indicadas cuyo período contiene la fecha', async () => {
      const versiones = [crearVersion('HEALTH_RATE')];

      queryBuilderMock.getMany.mockResolvedValue(versiones);

      await expect(repository.findVigentes(CLAVES, '2026-10-11')).resolves.toBe(
        versiones,
      );

      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        'config.key IN (:...keys)',
        { keys: CLAVES },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'config.valid_from <= :fecha',
        { fecha: '2026-10-11' },
      );
      // Una versión sin fecha de fin rige hasta que se registre la siguiente.
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(config.valid_to IS NULL OR config.valid_to >= :fecha)',
        { fecha: '2026-10-11' },
      );
    });

    it('no debe consultar la base de datos cuando no se indican claves', async () => {
      await expect(repository.findVigentes([], '2026-10-11')).resolves.toEqual(
        [],
      );

      expect(
        systemConfigRepositoryMock.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });
  });

  describe('findUltimas', () => {
    it('debe retornar la versión más reciente de cada clave', async () => {
      const saludProgramada = crearVersion('HEALTH_RATE');
      const saludVigente = crearVersion('HEALTH_RATE');
      const pension = crearVersion('PENSION_RATE');

      // El repositorio las entrega de la más reciente a la más antigua.
      systemConfigRepositoryMock.find.mockResolvedValue([
        saludProgramada,
        pension,
        saludVigente,
      ]);

      const resultado = await repository.findUltimas(CLAVES);

      expect(resultado).toEqual([saludProgramada, pension]);
      expect(resultado[0]).toBe(saludProgramada);
      expect(systemConfigRepositoryMock.find).toHaveBeenCalledWith({
        where: { key: In(CLAVES) },
        order: { valid_from: 'DESC' },
      });
    });

    it('no debe consultar la base de datos cuando no se indican claves', async () => {
      await expect(repository.findUltimas([])).resolves.toEqual([]);

      expect(systemConfigRepositoryMock.find).not.toHaveBeenCalled();
    });
  });

  // =========================================================
  // registrarVersiones
  // =========================================================

  describe('registrarVersiones', () => {
    it('debe guardar todas las versiones dentro de una sola transacción', async () => {
      const versiones = [
        crearVersion('HEALTH_RATE'),
        crearVersion('PENSION_RATE'),
      ];

      queryRunnerMock.manager.save.mockResolvedValue(versiones);

      await expect(repository.registrarVersiones(versiones, [])).resolves.toBe(
        versiones,
      );

      expect(queryRunnerMock.manager.update).not.toHaveBeenCalled();
      expect(queryRunnerMock.manager.save).toHaveBeenCalledTimes(1);
      expect(queryRunnerMock.manager.save).toHaveBeenCalledWith(
        SystemConfig,
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
        crearVersion('HEALTH_RATE'),
        crearVersion('PENSION_RATE'),
      ];
      const validTo = new Date(2026, 9, 31, 12);

      queryRunnerMock.manager.save.mockResolvedValue(versiones);

      await repository.registrarVersiones(versiones, [
        { id: 1, validTo },
        { id: 2, validTo },
      ]);

      // Solo cambia la fecha de fin: los valores de las versiones anteriores se conservan.
      expect(queryRunnerMock.manager.update).toHaveBeenNthCalledWith(
        1,
        SystemConfig,
        { id: 1 },
        { valid_to: validTo },
      );
      expect(queryRunnerMock.manager.update).toHaveBeenNthCalledWith(
        2,
        SystemConfig,
        { id: 2 },
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
          [crearVersion('HEALTH_RATE')],
          [{ id: 1, validTo: new Date(2026, 9, 31, 12) }],
        ),
      ).rejects.toBe(error);

      expect(queryRunnerMock.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.release).toHaveBeenCalled();
    });

    it('debe hacer rollback y traducir la violación de la restricción de vigencias superpuestas', async () => {
      queryRunnerMock.manager.save.mockRejectedValue(crearErrorExclusion());

      await expect(
        repository.registrarVersiones([crearVersion('HEALTH_RATE')], []),
      ).rejects.toBeInstanceOf(VigenciaSuperpuestaError);

      expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.release).toHaveBeenCalled();
    });
  });
});

// =========================================================
// Utilidades
// =========================================================

function crearVersion(key: string): SystemConfig {
  return Object.assign(new SystemConfig(), {
    key,
    value: 4.5,
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
