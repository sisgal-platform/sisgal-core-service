import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

import { SystemConfigTypeOrmRepository } from './system-config.typeorm.repository';

import { SystemConfig } from 'src/entities';

describe('SystemConfigTypeOrmRepository', () => {
  let repository: SystemConfigTypeOrmRepository;

  const systemConfigRepositoryMock = {
    findOne: jest.fn(),
  };

  const payrollDate = new Date('2026-03-31T12:00:00-05:00');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigTypeOrmRepository,
        {
          provide: getRepositoryToken(SystemConfig),
          useValue: systemConfigRepositoryMock,
        },
      ],
    }).compile();

    repository = module.get<SystemConfigTypeOrmRepository>(
      SystemConfigTypeOrmRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getValue', () => {
    it('debe buscar la versión cuyo período contiene la fecha, tenga o no fecha de fin', async () => {
      systemConfigRepositoryMock.findOne.mockResolvedValue(
        Object.assign(new SystemConfig(), {
          key: 'HEALTH_RATE',
          value: '4.00',
        }),
      );

      await repository.getValue('HEALTH_RATE', payrollDate);

      expect(systemConfigRepositoryMock.findOne).toHaveBeenCalledWith({
        where: [
          {
            key: 'HEALTH_RATE',
            valid_from: LessThanOrEqual(payrollDate),
            valid_to: MoreThanOrEqual(payrollDate),
          },
          // La versión más reciente no tiene fecha de fin mientras no se registre otra.
          {
            key: 'HEALTH_RATE',
            valid_from: LessThanOrEqual(payrollDate),
            valid_to: IsNull(),
          },
        ],
        order: { valid_from: 'DESC' },
      });
    });

    it('debe retornar el valor como número', async () => {
      systemConfigRepositoryMock.findOne.mockResolvedValue(
        Object.assign(new SystemConfig(), {
          key: 'HEALTH_RATE',
          value: '4.50',
        }),
      );

      await expect(
        repository.getValue('HEALTH_RATE', payrollDate),
      ).resolves.toBe(4.5);
    });

    it('debe retornar null cuando ninguna versión rige en la fecha', async () => {
      systemConfigRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        repository.getValue('HEALTH_RATE', payrollDate),
      ).resolves.toBeNull();
    });

    it('debe fallar cuando el valor almacenado no es numérico', async () => {
      systemConfigRepositoryMock.findOne.mockResolvedValue(
        Object.assign(new SystemConfig(), { key: 'HEALTH_RATE', value: 'abc' }),
      );

      await expect(
        repository.getValue('HEALTH_RATE', payrollDate),
      ).rejects.toThrow(
        'El valor de la configuración HEALTH_RATE no es válido.',
      );
    });
  });
});
