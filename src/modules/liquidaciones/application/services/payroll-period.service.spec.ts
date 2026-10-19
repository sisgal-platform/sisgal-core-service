import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { LoanInstallment } from 'src/entities/loan-installment.model';
import { PayrollLine } from 'src/entities/payroll_line.model';
import { LoanInstallmentConflictError } from '../../domain/errors/loan-installment-conflict.error';

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
  const auditPortMock = { log: jest.fn() };

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
        { provide: AUDIT_PORT, useValue: auditPortMock },
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
        loanInstallments: [],
        loanObservations: [],
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
        [],
      );
      expect(result).toMatchObject({
        id: 12,
        totalEarnings: 2100000,
        totalDeductions: 230000,
        netPay: 1870000,
        status: 'Confirmada',
      });
    });

    describe('cuotas de préstamos', () => {
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
      const loanInstallment = {
        loanId: 7,
        conceptName: 'Cuota préstamo #7',
        cutoffDates: ['2026-09-30'],
        installments: 1,
        scheduledAmount: 250000,
        amount: 150000,
        previousBalance: 400000,
        newBalance: 250000,
        previousPendingInstallments: 2,
        remainingInstallments: 2,
      };
      const limitObservation = {
        loanId: 7,
        reason: 'LIMITE_DEDUCCIONES' as const,
        message: 'La cuota del préstamo #7 se descontó parcialmente.',
        details: { scheduledAmount: 250000, appliedAmount: 150000 },
      };
      const appliedAt = new Date('2026-10-01T15:00:00.000Z');

      beforeEach(() => {
        employeeRepositoryMock.findById.mockResolvedValue(employee);
        nominaServiceMock.calculatePreLiquidation.mockResolvedValue({
          totalEarnings: 2000000,
          totalDeductions: 310000,
          netPay: 1690000,
          configSnapshot: { loanObservations: [limitObservation.message] },
          earnings: [{ conceptName: 'Salario base', amount: 2000000 }],
          deductions: [
            { conceptName: 'Salud', amount: 80000 },
            { conceptName: 'Pensión', amount: 80000 },
            { conceptName: 'Cuota préstamo #7', amount: 150000 },
          ],
          workedHours: [],
          loanInstallments: [loanInstallment],
          loanObservations: [limitObservation],
        });
        // El repositorio devuelve la liquidación con los ids de sus conceptos y la cuota registrada.
        payrollPeriodRepositoryMock.save.mockImplementation(
          async (payrollPeriod: PayrollPeriod) =>
            Object.assign(payrollPeriod, {
              id: 12,
              payroll_lines: payrollPeriod.payroll_lines.map(
                (line: PayrollLine, index: number) =>
                  Object.assign(line, { id: 100 + index }),
              ),
              loan_installments: [
                Object.assign(new LoanInstallment(), {
                  loanId: 7,
                  payrollLineId: 103,
                  installmentsApplied: 1,
                  scheduledAmount: '250000.00',
                  amount: '150000.00',
                  newBalance: '250000.00',
                  remainingInstallments: 2,
                  appliedAt,
                }),
              ],
            }),
        );
      });

      it('guarda la liquidación junto con las cuotas a aplicar', async () => {
        await service.generate(4, period);

        expect(payrollPeriodRepositoryMock.save).toHaveBeenCalledWith(
          expect.objectContaining({ employee }),
          [loanInstallment],
        );
      });

      it('muestra el descuento con su préstamo y las observaciones en la liquidación', async () => {
        const result = await service.generate(4, period);

        expect(result.deductions).toEqual([
          { conceptName: 'Salud', amount: 80000 },
          { conceptName: 'Pensión', amount: 80000 },
          {
            conceptName: 'Cuota préstamo #7',
            amount: 150000,
            loan: {
              loanId: 7,
              installments: 1,
              scheduledAmount: 250000,
              outstandingBalance: 250000,
              pendingInstallments: 2,
            },
          },
        ]);
        expect(result.observations).toEqual([limitObservation.message]);
      });

      it('registra en auditoría cada cuota descontada y las que no se pudieron descontar completas', async () => {
        await service.generate(4, period);

        expect(auditPortMock.log).toHaveBeenCalledWith({
          action: 'LOAN_INSTALLMENT_APPLIED',
          module: 'Liquidaciones',
          resource: 'EmployeeLoan',
          resourceId: 7,
          result: 'SUCCESS',
          message: expect.stringContaining(
            'del préstamo #7 en la liquidación #12.',
          ),
          metadata: {
            employeeId: 4,
            loanId: 7,
            payrollPeriodId: 12,
            appliedAt,
            installments: 1,
            scheduledAmount: 250000,
            amount: 150000,
            previousBalance: 400000,
            newBalance: 250000,
            previousPendingInstallments: 2,
            remainingInstallments: 2,
          },
        });
        expect(auditPortMock.log).toHaveBeenCalledWith({
          action: 'LOAN_INSTALLMENT_LIMITED',
          module: 'Liquidaciones',
          resource: 'EmployeeLoan',
          resourceId: 7,
          result: 'FAILED',
          message: limitObservation.message,
          metadata: {
            employeeId: 4,
            loanId: 7,
            payrollPeriodId: 12,
            scheduledAmount: 250000,
            appliedAmount: 150000,
          },
        });
      });

      it('responde con conflicto cuando un préstamo cambió durante el proceso y lo registra', async () => {
        payrollPeriodRepositoryMock.save.mockRejectedValue(
          new LoanInstallmentConflictError(7),
        );

        await expect(service.generate(4, period)).rejects.toThrow(
          new ConflictException(
            'El préstamo #7 cambió mientras se generaba la liquidación. Vuelva a generarla para descontar la cuota con el saldo actualizado.',
          ),
        );
        expect(auditPortMock.log).toHaveBeenCalledTimes(1);
        expect(auditPortMock.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'PAYROLL_SETTLEMENT_FAILED',
            result: 'FAILED',
            metadata: expect.objectContaining({ employeeId: 4, loanIds: [7] }),
          }),
        );
      });

      it('propaga cualquier otro error al guardar sin registrar cuotas aplicadas', async () => {
        const error = new Error('fallo de conexión');
        payrollPeriodRepositoryMock.save.mockRejectedValue(error);

        await expect(service.generate(4, period)).rejects.toBe(error);
        expect(auditPortMock.log).toHaveBeenCalledTimes(1);
        expect(auditPortMock.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'PAYROLL_SETTLEMENT_FAILED',
            metadata: expect.objectContaining({ error: 'fallo de conexión' }),
          }),
        );
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
