import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PayrollPeriodService } from './payroll-period.service';
import { PAYROLL_PERIOD_REPOSITORY_PORT } from '../../domain/ports/payroll-period-repository.port';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { EMPLOYEE_REPOSITORY_PORT } from 'src/modules/empleados/domain/ports/employee-repository.port';
import { NominaService } from 'src/modules/nomina/application/services/nomina.service';
import { PreLiquidationRequestDto } from 'src/modules/nomina/infrastructure/http/dtos/pre-liquidation-request.dto';
import { Employee } from 'src/entities/employee.model';

describe('PayrollPeriodService', () => {
  let service: PayrollPeriodService;

  const payrollPeriodRepositoryMock: {
    findAll: jest.Mock;
    findById: jest.Mock;
    save: jest.Mock;
  } = {
    findAll: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
  };
  const employeeRepositoryMock = { findById: jest.fn() };
  const nominaServiceMock = { calculatePreLiquidation: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollPeriodService,
        {
          provide: PAYROLL_PERIOD_REPOSITORY_PORT,
          useValue: payrollPeriodRepositoryMock,
        },
        { provide: EMPLOYEE_REPOSITORY_PORT, useValue: employeeRepositoryMock },
        { provide: NominaService, useValue: nominaServiceMock },
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

  describe('generate', () => {
    it('debe guardar los totales, conceptos y snapshot calculados', async () => {
      const employee = Object.assign(new Employee(), {
        id: 4,
        firstName: 'Ana',
        lastName: 'Díaz',
        document_type: 'CC',
        document: '123',
      });
      const period: PreLiquidationRequestDto = {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      };
      const calculation = {
        totalEarnings: 2100000,
        totalDeductions: 230000,
        netPay: 1870000,
        configSnapshot: { minimumWage: 1400000 },
        earnings: [{ conceptName: 'Salario base', amount: 2100000 }],
        deductions: [{ conceptName: 'Salud', amount: 230000 }],
      };
      employeeRepositoryMock.findById.mockResolvedValue(employee);
      nominaServiceMock.calculatePreLiquidation.mockResolvedValue(calculation);
      payrollPeriodRepositoryMock.save.mockImplementation(
        async (payrollPeriod: PayrollPeriod) =>
          Object.assign(payrollPeriod, { id: 12 }),
      );

      const result = await service.generate(4, period);

      expect(nominaServiceMock.calculatePreLiquidation).toHaveBeenCalledWith(
        employee,
        period.periodStart,
        period.periodEnd,
      );
      expect(payrollPeriodRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          employee,
          total_earnings: 2100000,
          total_deductions: 230000,
          net_pay: 1870000,
          config_snapshot: calculation.configSnapshot,
          payroll_lines: [
            expect.objectContaining({
              concept_name: 'Salario base',
              type: 'DEVENGADO',
              amount: 2100000,
            }),
            expect.objectContaining({
              concept_name: 'Salud',
              type: 'DEDUCCION',
              amount: 230000,
            }),
          ],
        }),
      );
      expect(result).toMatchObject({
        id: 12,
        totalEarnings: 2100000,
        totalDeductions: 230000,
        netPay: 1870000,
        status: 'Confirmada',
      });
    });
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
