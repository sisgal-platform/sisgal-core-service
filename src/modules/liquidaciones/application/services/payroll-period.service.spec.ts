import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PayrollPeriodService } from './payroll-period.service';
import { PAYROLL_PERIOD_REPOSITORY_PORT } from '../../domain/ports/payroll-period-repository.port';
import { PayrollPeriod } from 'src/entities/payroll-period.model';

describe('PayrollPeriodService', () => {
  let service: PayrollPeriodService;

  const payrollPeriodRepositoryMock: {
    findAll: jest.Mock;
    findById: jest.Mock;
  } = {
    findAll: jest.fn(),
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollPeriodService,
        {
          provide: PAYROLL_PERIOD_REPOSITORY_PORT,
          useValue: payrollPeriodRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<PayrollPeriodService>(PayrollPeriodService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // findAll
  // =========================================================

  describe('findAll', () => {
    it('debe delegar la consulta al repositorio con los filtros recibidos', async () => {
      const liquidaciones = [{ id: 1 } as PayrollPeriod];
      payrollPeriodRepositoryMock.findAll.mockResolvedValue(liquidaciones);

      const resultado = await service.findAll({ employeeId: 5 });

      expect(resultado).toEqual(liquidaciones);
      expect(payrollPeriodRepositoryMock.findAll).toHaveBeenCalledWith({
        employeeId: 5,
      });
    });

    it('debe lanzar BadRequestException cuando el período inicial es posterior al final', async () => {
      await expect(
        service.findAll({ periodStart: '2026-09-15', periodEnd: '2026-09-10' }),
      ).rejects.toThrow(BadRequestException);

      expect(payrollPeriodRepositoryMock.findAll).not.toHaveBeenCalled();
    });

    it('no debe lanzar error cuando los períodos están en orden válido', async () => {
      payrollPeriodRepositoryMock.findAll.mockResolvedValue([]);

      await expect(
        service.findAll({ periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
      ).resolves.toEqual([]);
    });
  });

  // =========================================================
  // findById
  // =========================================================

  describe('findById', () => {
    it('debe retornar la liquidación cuando existe', async () => {
      const liquidacion = { id: 1 } as PayrollPeriod;
      payrollPeriodRepositoryMock.findById.mockResolvedValue(liquidacion);

      const resultado = await service.findById(1);

      expect(resultado).toEqual(liquidacion);
      expect(payrollPeriodRepositoryMock.findById).toHaveBeenCalledWith(1);
    });

    it('debe lanzar NotFoundException cuando la liquidación no existe', async () => {
      payrollPeriodRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findById(99)).rejects.toThrow(NotFoundException);
    });
  });
});
