import { Repository } from 'typeorm';
import { EmployeeLoan } from 'src/entities/employee_loan.model';
import { LoanInstallment } from 'src/entities/loan-installment.model';
import { PayrollLine } from 'src/entities/payroll_line.model';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { LoanInstallmentConflictError } from 'src/modules/liquidaciones/domain/errors/loan-installment-conflict.error';
import { LoanStatus } from 'src/modules/loans/enums/loan-status.enum';
import type { LoanInstallmentPlan } from 'src/modules/nomina/domain/loan-installments';
import { PayrollPeriodTypeOrmRepository } from './payroll-period.typeorm.repository';

describe('PayrollPeriodTypeOrmRepository', () => {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };
  const lockQueryBuilder = {
    setLock: jest.fn(),
    where: jest.fn(),
    getMany: jest.fn(),
  };
  const entityManager = {
    getRepository: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const payrollPeriodRepositoryMock = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    manager: {
      transaction: jest.fn(
        async (work: (manager: typeof entityManager) => Promise<unknown>) =>
          work(entityManager),
      ),
    },
  };
  let repository: PayrollPeriodTypeOrmRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.leftJoinAndSelect.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    payrollPeriodRepositoryMock.createQueryBuilder.mockReturnValue(
      queryBuilder,
    );
    lockQueryBuilder.setLock.mockReturnValue(lockQueryBuilder);
    lockQueryBuilder.where.mockReturnValue(lockQueryBuilder);
    entityManager.getRepository.mockReturnValue({
      createQueryBuilder: () => lockQueryBuilder,
    });

    repository = new PayrollPeriodTypeOrmRepository(
      payrollPeriodRepositoryMock as unknown as Repository<PayrollPeriod>,
    );
  });

  describe('findAll', () => {
    it('combina todos los filtros mediante AND', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await repository.findAll({
        employeeId: 5,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      });

      expect(
        payrollPeriodRepositoryMock.createQueryBuilder,
      ).toHaveBeenCalledWith('payrollPeriod');
      expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'payrollPeriod.employee',
        'employee',
      );
      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'payrollPeriod.period_start',
        'DESC',
      );
      expect(queryBuilder.andWhere.mock.calls).toEqual([
        ['employee.id = :employeeId', { employeeId: 5 }],
        [
          'payrollPeriod.period_start >= :periodStart',
          { periodStart: '2026-09-01' },
        ],
        [
          'payrollPeriod.period_start <= :periodEnd',
          { periodEnd: '2026-09-30' },
        ],
      ]);
      expect(queryBuilder.getMany).toHaveBeenCalled();
    });

    it('consulta sin filtros cuando no se recibe ningún criterio', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await repository.findAll({});

      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('debe consultar la liquidación con el empleado y las líneas relacionadas', async () => {
      const liquidacion = { id: 1 } as PayrollPeriod;
      payrollPeriodRepositoryMock.findOne.mockResolvedValue(liquidacion);

      const resultado = await repository.findById(1);

      expect(resultado).toEqual(liquidacion);
      expect(payrollPeriodRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: {
          employee: {
            jobPosition: true,
            employee_branch_assig: {
              branch: {
                company: true,
              },
            },
          },
          payroll_lines: true,
          loan_installments: true,
        },
      });
    });

    it('debe retornar null cuando la liquidación no existe', async () => {
      payrollPeriodRepositoryMock.findOne.mockResolvedValue(null);

      const resultado = await repository.findById(99);

      expect(resultado).toBeNull();
    });
  });

  describe('save', () => {
    it('delega el guardado de la liquidación y sus líneas al repositorio', async () => {
      const payrollPeriod = { id: 5 } as PayrollPeriod;
      payrollPeriodRepositoryMock.save.mockResolvedValue(payrollPeriod);

      await expect(repository.save(payrollPeriod)).resolves.toBe(payrollPeriod);
      expect(payrollPeriodRepositoryMock.save).toHaveBeenCalledWith(
        payrollPeriod,
      );
      expect(
        payrollPeriodRepositoryMock.manager.transaction,
      ).not.toHaveBeenCalled();
    });

    describe('con cuotas de préstamos', () => {
      const plan: LoanInstallmentPlan = {
        loanId: 7,
        conceptName: 'Cuota préstamo #7',
        cutoffDates: ['2026-09-30'],
        installments: 1,
        scheduledAmount: 200000,
        amount: 200000,
        previousBalance: 400000,
        newBalance: 200000,
        previousPendingInstallments: 2,
        remainingInstallments: 1,
      };

      function payrollPeriodWithLoanLine(): PayrollPeriod {
        return Object.assign(new PayrollPeriod(), {
          employee: { id: 3 },
          payroll_lines: [
            Object.assign(new PayrollLine(), {
              concept_name: 'Salud',
              type: 'DEDUCCION',
              amount: 80000,
            }),
            Object.assign(new PayrollLine(), {
              concept_name: 'Cuota préstamo #7',
              type: 'DEDUCCION',
              amount: 200000,
            }),
          ],
        });
      }

      function lockedLoan(overrides: Partial<EmployeeLoan> = {}) {
        return Object.assign(new EmployeeLoan(), {
          id: 7,
          status: LoanStatus.ACTIVO,
          // TypeORM entrega las columnas numeric como texto.
          outstandingBalance: '400000.00',
          pendingInstallments: 2,
          ...overrides,
        });
      }

      beforeEach(() => {
        lockQueryBuilder.getMany.mockResolvedValue([lockedLoan()]);
        entityManager.save.mockImplementation(async (entity: object) => {
          if (entity instanceof PayrollPeriod) {
            entity.id = 12;
            entity.payroll_lines.forEach((line, index) => {
              line.id = 50 + index;
            });
          }
          return entity;
        });
      });

      it('bloquea los préstamos y registra la liquidación, la cuota y el nuevo saldo en una transacción', async () => {
        const saved = await repository.save(payrollPeriodWithLoanLine(), [
          plan,
        ]);

        expect(
          payrollPeriodRepositoryMock.manager.transaction,
        ).toHaveBeenCalled();
        expect(payrollPeriodRepositoryMock.save).not.toHaveBeenCalled();
        expect(entityManager.getRepository).toHaveBeenCalledWith(EmployeeLoan);
        expect(lockQueryBuilder.setLock).toHaveBeenCalledWith(
          'pessimistic_write',
        );
        expect(lockQueryBuilder.where).toHaveBeenCalledWith(
          'loan.id IN (:...loanIds)',
          { loanIds: [7] },
        );
        expect(entityManager.save).toHaveBeenCalledWith(
          expect.objectContaining({
            loanId: 7,
            employeeId: 3,
            payrollPeriodId: 12,
            payrollLineId: 51,
            installmentsApplied: 1,
            scheduledAmount: 200000,
            amount: 200000,
            previousBalance: 400000,
            newBalance: 200000,
            previousPendingInstallments: 2,
            remainingInstallments: 1,
          }),
        );
        expect(entityManager.update).toHaveBeenCalledWith(
          EmployeeLoan,
          { id: 7 },
          {
            outstandingBalance: 200000,
            pendingInstallments: 1,
            status: LoanStatus.ACTIVO,
          },
        );
        expect(saved.loan_installments).toEqual([expect.any(LoanInstallment)]);
      });

      it('marca el préstamo como saldado cuando el saldo llega a cero', async () => {
        await repository.save(payrollPeriodWithLoanLine(), [
          { ...plan, newBalance: 0, remainingInstallments: 0, amount: 400000 },
        ]);

        expect(entityManager.update).toHaveBeenCalledWith(
          EmployeeLoan,
          { id: 7 },
          expect.objectContaining({ status: LoanStatus.SALDADO }),
        );
      });

      it.each([
        ['otro descuento cambió su saldo', { outstandingBalance: '200000.00' }],
        ['cambiaron sus cuotas pendientes', { pendingInstallments: 1 }],
        ['ya no está activo', { status: LoanStatus.CANCELADO }],
      ])('no guarda nada cuando el préstamo %s', async (_case, overrides) => {
        lockQueryBuilder.getMany.mockResolvedValue([
          lockedLoan(overrides as Partial<EmployeeLoan>),
        ]);

        await expect(
          repository.save(payrollPeriodWithLoanLine(), [plan]),
        ).rejects.toThrow(LoanInstallmentConflictError);
        expect(entityManager.save).not.toHaveBeenCalled();
        expect(entityManager.update).not.toHaveBeenCalled();
      });
    });
  });
});
