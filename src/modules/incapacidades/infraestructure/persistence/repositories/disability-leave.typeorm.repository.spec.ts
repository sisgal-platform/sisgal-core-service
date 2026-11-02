import { Repository } from 'typeorm';
import { DisabilityLeave } from 'src/entities/disability_leave.model';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { DisabilityLeaveTypeOrmRepository } from './disability-leave.typeorm.repository';

describe('DisabilityLeaveTypeOrmRepository', () => {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    getMany: jest.fn(),
    getRawOne: jest.fn(),
  };
  const disabilityLeaveRepositoryMock = {
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  const payrollPeriodRepositoryMock = { createQueryBuilder: jest.fn() };
  let repository: DisabilityLeaveTypeOrmRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.leftJoinAndSelect.mockReturnValue(queryBuilder);
    queryBuilder.innerJoin.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
        queryBuilder.addOrderBy.mockReturnValue(queryBuilder);
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.addSelect.mockReturnValue(queryBuilder);
    disabilityLeaveRepositoryMock.createQueryBuilder.mockReturnValue(
      queryBuilder,
    );

    repository = new DisabilityLeaveTypeOrmRepository(
      disabilityLeaveRepositoryMock as unknown as Repository<DisabilityLeave>,
      payrollPeriodRepositoryMock as unknown as Repository<PayrollPeriod>,
    );
  });

  describe('save', () => {
    it('debe guardar el registro y retornar la entidad persistida', async () => {
      const disabilityLeave = { type: 'Enfermedad general' } as DisabilityLeave;
      const guardado = { id: 1, type: 'Enfermedad general' } as DisabilityLeave;

      disabilityLeaveRepositoryMock.save.mockResolvedValue(guardado);

      const resultado = await repository.save(disabilityLeave);

      expect(resultado).toEqual(guardado);
      expect(disabilityLeaveRepositoryMock.save).toHaveBeenCalledWith(
        disabilityLeave,
      );
    });
  });

  describe('findAll', () => {
    it('combina todos los filtros mediante AND', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await repository.findAll({
        employeeId: 5,
        employeeName: 'maría pé',
        document: '1020304050',
        positionId: 2,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(disabilityLeaveRepositoryMock.createQueryBuilder).toHaveBeenCalledWith(
        'disabilityLeave',
      );
      expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'disabilityLeave.employee',
        'employee',
      );
      expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'employee.jobPosition',
        'jobPosition',
      );
      expect(queryBuilder.andWhere.mock.calls).toEqual([
        ['employee.id = :employeeId', { employeeId: 5 }],
        [
          "CONCAT(employee.\"firstName\", ' ', employee.\"lastName\") ILIKE :employeeName",
          { employeeName: '%maría pé%' },
        ],
        ['employee.document = :document', { document: '1020304050' }],
        ['jobPosition.id = :positionId', { positionId: 2 }],
        ['disabilityLeave.start_date >= :startDate', { startDate: '2026-09-01' }],
        ['disabilityLeave.start_date <= :endDate', { endDate: '2026-09-30' }],
      ]);
      expect(queryBuilder.getMany).toHaveBeenCalled();
    });

    it('consulta sin filtros cuando no se recibe ningún criterio', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await repository.findAll({});

      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('debe filtrar por estado Activo usando la fecha de finalización', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await repository.findAll({ status: 'Activo' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'disabilityLeave.end_date >= CURRENT_DATE',
      );
    });

    it('debe filtrar por estado Finalizado usando la fecha de finalización', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await repository.findAll({ status: 'Finalizado' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'disabilityLeave.end_date < CURRENT_DATE',
      );
    });
  });

  describe('findOverlapping', () => {
    it('debe consultar los períodos del empleado que se crucen con el rango dado', async () => {
      const registroExistente = { id: 9 } as DisabilityLeave;
      queryBuilder.getMany.mockResolvedValue([registroExistente]);

      const resultado = await repository.findOverlapping(
        5,
        '2026-09-04',
        '2026-09-10',
      );

      expect(resultado).toEqual([registroExistente]);
      expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
        'disabilityLeave.employee',
        'employee',
      );
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'employee.id = :employeeId',
        { employeeId: 5 },
      );
      expect(queryBuilder.andWhere.mock.calls).toEqual([
        ['disabilityLeave.start_date <= :endDate', { endDate: '2026-09-10' }],
        ['disabilityLeave.end_date >= :startDate', { startDate: '2026-09-04' }],
      ]);
    });
  });

  it('excluye el registro indicado al buscar cruces', async () => {
    queryBuilder.getMany.mockResolvedValue([]);

    await repository.findOverlapping(3, '2026-09-10', '2026-09-15', 5);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'disabilityLeave.id <> :excludedId',
      { excludedId: 5 },
    );
  });

  it('busca las liquidaciones del empleado que se cruzan con el rango', async () => {
    payrollPeriodRepositoryMock.createQueryBuilder.mockReturnValue(queryBuilder);
    queryBuilder.getMany.mockResolvedValue([]);

    await repository.findOverlappingPayrollPeriods(
      3,
      '2026-09-10',
      '2026-09-15',
    );

    expect(queryBuilder.where).toHaveBeenCalledWith('employee.id = :employeeId', {
      employeeId: 3,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'payrollPeriod.period_start <= :endDate',
      { endDate: '2026-09-15' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'payrollPeriod.period_end >= :startDate',
      { startDate: '2026-09-10' },
    );
  });

  it('consulta por id con el empleado y su cargo, y elimina por id', async () => {
    await repository.findById(5);
    await repository.delete(5);

    expect(disabilityLeaveRepositoryMock.findOne).toHaveBeenCalledWith({
      where: { id: 5 },
      relations: { employee: { jobPosition: true } },
    });
    expect(disabilityLeaveRepositoryMock.delete).toHaveBeenCalledWith({ id: 5 });
  });
});
