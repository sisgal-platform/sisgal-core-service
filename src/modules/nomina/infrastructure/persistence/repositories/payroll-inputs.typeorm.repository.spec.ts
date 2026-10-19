import { Repository } from 'typeorm';
import {
  AttendanceRecord,
  DisabilityLeave,
  Employee,
  EmployeeLoan,
  PayrollPeriod,
} from 'src/entities';
import { LoanStatus } from 'src/modules/loans/enums/loan-status.enum';
import { PayrollInputsTypeOrmRepository } from './payroll-inputs.typeorm.repository';

describe('PayrollInputsTypeOrmRepository', () => {
  const queryBuilder = {
    innerJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    getMany: jest.fn(),
  };
  const employeeRepository = { find: jest.fn() };
  const queryRepository = () => ({
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  });
  const attendanceRecordRepository = queryRepository();
  const disabilityLeaveRepository = queryRepository();
  const loanRepository = queryRepository();
  const payrollPeriodRepository = queryRepository();

  const repository = new PayrollInputsTypeOrmRepository(
    employeeRepository as unknown as Repository<Employee>,
    attendanceRecordRepository as unknown as Repository<AttendanceRecord>,
    disabilityLeaveRepository as unknown as Repository<DisabilityLeave>,
    loanRepository as unknown as Repository<EmployeeLoan>,
    payrollPeriodRepository as unknown as Repository<PayrollPeriod>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    for (const method of [
      queryBuilder.innerJoinAndSelect,
      queryBuilder.where,
      queryBuilder.andWhere,
      queryBuilder.orderBy,
      queryBuilder.addOrderBy,
    ]) {
      method.mockReturnValue(queryBuilder);
    }
    queryBuilder.getMany.mockResolvedValue([]);
  });

  it('consulta solo los empleados activos con su cargo', async () => {
    employeeRepository.find.mockResolvedValue([]);

    await repository.findActiveEmployees();

    expect(employeeRepository.find).toHaveBeenCalledWith({
      where: { status: 'ACTIVO' },
      relations: { jobPosition: true },
      order: { id: 'ASC' },
    });
  });

  it('filtra las marcaciones por empleados y por la entrada en [from, to)', async () => {
    const from = new Date('2026-09-01T00:00:00-05:00');
    const to = new Date('2026-10-01T00:00:00-05:00');

    await repository.findAttendanceRecords([1, 2], from, to);

    expect(queryBuilder.innerJoinAndSelect).toHaveBeenCalledWith(
      'record.employee',
      'employee',
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'employee.id IN (:...employeeIds)',
      { employeeIds: [1, 2] },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'record.check_in >= :from',
      { from },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'record.check_in < :to',
      { to },
    );
  });

  it('busca las incapacidades que se cruzan con el período', async () => {
    await repository.findDisabilityLeaves([1], '2026-09-01', '2026-09-30');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'disabilityLeave.start_date <= :periodEnd',
      { periodEnd: '2026-09-30' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'disabilityLeave.end_date >= :periodStart',
      { periodStart: '2026-09-01' },
    );
  });

  it('trae los préstamos activos aunque su saldo sea inconsistente, para validarlos en el cálculo', async () => {
    await repository.findActiveLoans([1], '2026-09-30');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'loan.status = :status',
      { status: LoanStatus.ACTIVO },
    );
    expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
      'loan.pendingInstallments > 0',
    );
    expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
      'loan.outstandingBalance > 0',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'loan.grantedAt <= :periodEnd',
      { periodEnd: '2026-09-30' },
    );
  });

  it('busca las liquidaciones registradas que se cruzan con el período', async () => {
    await repository.findPayrollPeriods([1], '2026-09-16', '2026-09-30');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'payrollPeriod.period_start <= :periodEnd',
      { periodEnd: '2026-09-30' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'payrollPeriod.period_end >= :periodStart',
      { periodStart: '2026-09-16' },
    );
  });

  it('no consulta la base de datos cuando no hay empleados', async () => {
    await expect(
      repository.findAttendanceRecords([], new Date(), new Date()),
    ).resolves.toEqual([]);
    await expect(
      repository.findDisabilityLeaves([], '2026-09-01', '2026-09-30'),
    ).resolves.toEqual([]);
    await expect(repository.findActiveLoans([], '2026-09-30')).resolves.toEqual(
      [],
    );
    await expect(
      repository.findPayrollPeriods([], '2026-09-01', '2026-09-30'),
    ).resolves.toEqual([]);

    expect(queryBuilder.getMany).not.toHaveBeenCalled();
  });
});
