import { Repository } from 'typeorm';
import { Employee, EmployeeLoan, LoanInstallment } from 'src/entities';
import { LoanStatus } from '../../../enums/loan-status.enum';
import { LoanTypeOrmRepository } from './loan.typeorm.repository';

describe('LoanTypeOrmRepository', () => {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn(),
    andWhere: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    getRawOne: jest.fn(),
  };
  const employeeLoanRepository = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const employeeRepository = {
    findOneBy: jest.fn(),
  };
  const installmentRepository = { countBy: jest.fn() };
  let repository: LoanTypeOrmRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.leftJoinAndSelect.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.addSelect.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.addOrderBy.mockReturnValue(queryBuilder);
    employeeLoanRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    repository = new LoanTypeOrmRepository(
      employeeLoanRepository as unknown as Repository<EmployeeLoan>,
      employeeRepository as unknown as Repository<Employee>,
      installmentRepository as unknown as Repository<LoanInstallment>,
    );
  });

  it('busca el empleado por identificador y guarda el préstamo', async () => {
    const employee = { id: 7 } as Employee;
    const loan = { employee } as EmployeeLoan;
    employeeRepository.findOneBy.mockResolvedValue(employee);
    employeeLoanRepository.save.mockResolvedValue(loan);

    await expect(repository.findEmployeeById(7)).resolves.toBe(employee);
    await expect(repository.save(loan)).resolves.toBe(loan);

    expect(employeeRepository.findOneBy).toHaveBeenCalledWith({ id: 7 });
    expect(employeeLoanRepository.save).toHaveBeenCalledWith(loan);
  });

  it('busca un préstamo por id y carga el empleado asociado', async () => {
    const loan = { id: 3 } as EmployeeLoan;
    queryBuilder.getOne.mockResolvedValue(loan);

    await expect(repository.findById(3)).resolves.toBe(loan);

    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'loan.employee',
      'employee',
    );
    expect(queryBuilder.where).toHaveBeenCalledWith('loan.id = :loanId', {
      loanId: 3,
    });
    expect(queryBuilder.getOne).toHaveBeenCalled();
  });

  it('combina todos los filtros mediante AND y carga el empleado', async () => {
    queryBuilder.getMany.mockResolvedValue([]);

    await repository.findAll({
      empleadoId: 7,
      nombreEmpleado: 'maría pé',
      documento: '123456789',
      estado: LoanStatus.ACTIVO,
      fechaDesde: '2026-03-01',
      fechaHasta: '2026-03-31',
    });

    expect(employeeLoanRepository.createQueryBuilder).toHaveBeenCalledWith(
      'loan',
    );
    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'loan.employee',
      'employee',
    );
    expect(queryBuilder.andWhere.mock.calls).toEqual([
      ['loan.employeeId = :empleadoId', { empleadoId: 7 }],
      [
        "CONCAT(employee.firstName, ' ', employee.lastName) ILIKE :nombreEmpleado",
        { nombreEmpleado: '%maría pé%' },
      ],
      ['employee.document = :documento', { documento: '123456789' }],
      ['loan.status = :estado', { estado: LoanStatus.ACTIVO }],
      ['loan.grantedAt >= :fechaDesde', { fechaDesde: '2026-03-01' }],
      ['loan.grantedAt <= :fechaHasta', { fechaHasta: '2026-03-31' }],
    ]);
    expect(queryBuilder.getMany).toHaveBeenCalled();
  });

  it('consulta sin filtros cuando no se recibe ningún criterio', async () => {
    queryBuilder.getMany.mockResolvedValue([]);

    await repository.findAll({});

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('calcula en una consulta la cantidad y monto original de préstamos activos', async () => {
    queryBuilder.getRawOne.mockResolvedValue({
      cantidadPrestamosActivos: '2',
      montoTotalPrestamosActivos: '3500000.50',
    });

    await expect(repository.getIndicators()).resolves.toEqual({
      cantidadPrestamosActivos: 2,
      montoTotalPrestamosActivos: 3500000.5,
    });

    expect(queryBuilder.select).toHaveBeenCalledWith(
      'COUNT(loan.id)',
      'cantidadPrestamosActivos',
    );
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      'COALESCE(SUM(loan.totalAmount), 0)',
      'montoTotalPrestamosActivos',
    );
    expect(queryBuilder.where).toHaveBeenCalledWith('loan.status = :estado', {
      estado: LoanStatus.ACTIVO,
    });
    expect(queryBuilder.getRawOne).toHaveBeenCalledTimes(1);
  });

  it('retorna indicadores en cero cuando la agregación no tiene resultado', async () => {
    queryBuilder.getRawOne.mockResolvedValue(undefined);

    await expect(repository.getIndicators()).resolves.toEqual({
      cantidadPrestamosActivos: 0,
      montoTotalPrestamosActivos: 0,
    });
  });

  it('cuenta las cuotas descontadas de un préstamo', async () => {
    installmentRepository.countBy.mockResolvedValue(2);

    await expect(repository.countInstallments(22)).resolves.toBe(2);

    expect(installmentRepository.countBy).toHaveBeenCalledWith({ loanId: 22 });
  });

  it('elimina el préstamo por su identificador', async () => {
    await repository.delete(22);

    expect(employeeLoanRepository.delete).toHaveBeenCalledWith({ id: 22 });
  });
});
