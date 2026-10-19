import { Repository } from 'typeorm';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { PayrollPeriodTypeOrmRepository } from './payroll-period.typeorm.repository';

describe('PayrollPeriodTypeOrmRepository', () => {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };
  const payrollPeriodRepositoryMock = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
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
    });
  });
});
