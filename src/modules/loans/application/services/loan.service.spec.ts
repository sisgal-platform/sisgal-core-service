import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeLoan } from 'src/entities';
import { aFechaCalendario } from 'src/modules/parametros-nomina/domain/vigencia';
import { CreateLoanDto } from '../../infrastructure/http/dtos/create-loan.dto';
import { LoanPeriodicity } from '../../enums/loan-periodicity.enum';
import { LoanStatus } from '../../enums/loan-status.enum';
import { LoanRepositoryPort } from '../../domain/ports/loan.repository.port';
import { LoanService } from './loan.service';

describe('LoanService', () => {
  const loanRepository: jest.Mocked<LoanRepositoryPort> = {
    findEmployeeById: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    findAll: jest.fn(),
    getIndicators: jest.fn(),
    countInstallments: jest.fn(),
    delete: jest.fn(),
  };
  let service: LoanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LoanService(loanRepository);
  });

  describe('crear', () => {
    const dto: CreateLoanDto = {
      employeeId: 7,
      totalAmount: 1000,
      totalInstallments: 3,
      grantedAt: '2026-03-10',
    };

    it('calcula los campos del préstamo y lo guarda', async () => {
      const employee = {
        id: 7,
        firstName: 'María',
        lastName: 'Pérez',
        document_type: 'CC',
        document: '123456789',
      } as any;
      const now = new Date('2026-03-10T12:00:00.000Z');
      loanRepository.findEmployeeById.mockResolvedValue(employee);
      loanRepository.save.mockImplementation(async (loan) =>
        Object.assign(loan, { id: 22, createdAt: now, updatedAt: now }),
      );

      const result = await service.crear(dto);

      expect(loanRepository.findEmployeeById).toHaveBeenCalledWith(7);
      expect(loanRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          employee,
          employeeId: 7,
          totalAmount: 1000,
          // 1.000 / 3 redondeado al peso; la última cuota descuenta el saldo restante.
          installmentAmount: 333,
          totalInstallments: 3,
          pendingInstallments: 3,
          outstandingBalance: 1000,
          periodicity: LoanPeriodicity.MENSUAL,
          status: LoanStatus.ACTIVO,
        }),
      );
      // TypeORM guarda las columnas `date` con el día local de la fecha.
      expect(
        aFechaCalendario(loanRepository.save.mock.calls[0][0].grantedAt),
      ).toBe('2026-03-10');
      expect(result).toMatchObject({
        id: 22,
        employee: { id: 7, documentType: 'CC' },
        installmentAmount: 333,
        pendingInstallments: 3,
        outstandingBalance: 1000,
        periodicity: LoanPeriodicity.MENSUAL,
      });
    });

    it('guarda la periodicidad indicada y redondea la cuota al peso más cercano', async () => {
      loanRepository.findEmployeeById.mockResolvedValue({ id: 7 } as any);
      loanRepository.save.mockImplementation(async (loan) => loan);

      await service.crear({
        ...dto,
        totalAmount: 1000,
        totalInstallments: 6,
        periodicity: LoanPeriodicity.QUINCENAL,
      });

      expect(loanRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          installmentAmount: 167,
          periodicity: LoanPeriodicity.QUINCENAL,
        }),
      );
    });

    it('rechaza un préstamo cuya cuota sería menor que un peso', async () => {
      loanRepository.findEmployeeById.mockResolvedValue({ id: 7 } as any);

      await expect(
        service.crear({ ...dto, totalAmount: 1, totalInstallments: 3 }),
      ).rejects.toThrow(
        new BadRequestException(
          'El valor de cada cuota debe ser de al menos un peso.',
        ),
      );
      expect(loanRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza la creación cuando el empleado no existe', async () => {
      loanRepository.findEmployeeById.mockResolvedValue(null);

      await expect(service.crear(dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(loanRepository.save).not.toHaveBeenCalled();
    });
  });

  it('consulta préstamos con todos los filtros y transforma la respuesta', async () => {
    const employeeLoan = {
      id: 1,
      employee: {
        id: 7,
        firstName: 'María',
        lastName: 'Pérez',
        document_type: 'CC',
        document: '123456789',
      },
      totalAmount: '2500000.00',
      installmentAmount: '250000.00',
      totalInstallments: 10,
      pendingInstallments: 8,
      outstandingBalance: '2000000.00',
      grantedAt: new Date('2026-03-10T00:00:00.000Z'),
      status: LoanStatus.ACTIVO,
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-10T00:00:00.000Z'),
    } as any;
    const filters = {
      empleadoId: 7,
      documento: '123456789',
      estado: LoanStatus.ACTIVO,
      fechaDesde: '2026-03-01',
      fechaHasta: '2026-03-31',
    };
    loanRepository.findAll.mockResolvedValue([employeeLoan]);

    const result = await service.obtenerTodos(filters);

    expect(loanRepository.findAll).toHaveBeenCalledWith(filters);
    expect(result[0]).toMatchObject({
      id: 1,
      employee: {
        id: 7,
        documentType: 'CC',
        document: '123456789',
      },
      totalAmount: 2500000,
      status: LoanStatus.ACTIVO,
    });
  });

  it('rechaza un rango donde la fecha inicial es posterior a la final', async () => {
    await expect(
      service.obtenerTodos({
        fechaDesde: '2026-04-01',
        fechaHasta: '2026-03-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(loanRepository.findAll).not.toHaveBeenCalled();
  });

  describe('obtenerPorId', () => {
    it('retorna el préstamo usando el mismo mapeo de la lista', async () => {
      const loan = {
        id: 3,
        employee: {
          id: 7,
          firstName: 'María',
          lastName: 'Pérez',
          document_type: 'CC',
          document: '123456789',
        },
        totalAmount: '1000.00',
        installmentAmount: '250.00',
        totalInstallments: 4,
        pendingInstallments: 4,
        outstandingBalance: '1000.00',
        grantedAt: new Date('2026-03-10T00:00:00.000Z'),
        status: LoanStatus.ACTIVO,
        createdAt: new Date('2026-03-10T12:00:00.000Z'),
        updatedAt: new Date('2026-03-10T12:00:00.000Z'),
      } as any;
      loanRepository.findById.mockResolvedValue(loan);

      await expect(service.obtenerPorId(3)).resolves.toMatchObject({
        id: 3,
        employee: {
          id: 7,
          documentType: 'CC',
          document: '123456789',
        },
        totalAmount: 1000,
        installmentAmount: 250,
      });
      expect(loanRepository.findById).toHaveBeenCalledWith(3);
    });

    it('retorna 404 cuando no existe el préstamo', async () => {
      loanRepository.findById.mockResolvedValue(null);

      await expect(service.obtenerPorId(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('retorna los indicadores consolidados de préstamos activos', async () => {
    loanRepository.getIndicators.mockResolvedValue({
      cantidadPrestamosActivos: 3,
      montoTotalPrestamosActivos: 4500000,
    });

    await expect(service.obtenerIndicadores()).resolves.toEqual({
      cantidadPrestamosActivos: 3,
      montoTotalPrestamosActivos: 4500000,
    });
    expect(loanRepository.getIndicators).toHaveBeenCalledTimes(1);
  });

  describe('actualizar', () => {
    const employee = {
      id: 7,
      firstName: 'María',
      lastName: 'Pérez',
      document_type: 'CC',
      document: '123456789',
    };
    const storedLoan = (overrides: Partial<Record<string, unknown>> = {}) =>
      ({
        id: 22,
        employee,
        // TypeORM entrega las columnas numeric y bigint como texto.
        employeeId: '7',
        totalAmount: '1000.00',
        installmentAmount: '333',
        totalInstallments: 3,
        pendingInstallments: 3,
        outstandingBalance: '1000.00',
        grantedAt: '2026-03-10',
        periodicity: LoanPeriodicity.MENSUAL,
        status: LoanStatus.ACTIVO,
        ...overrides,
      }) as unknown as EmployeeLoan;

    beforeEach(() => {
      loanRepository.save.mockImplementation(async (loan) => loan);
    });

    it('recalcula la cuota y el saldo si aún no tiene descuentos', async () => {
      loanRepository.findById.mockResolvedValue(storedLoan());
      loanRepository.findEmployeeById.mockResolvedValue(employee as never);

      const result = await service.actualizar(22, {
        totalAmount: 1200,
        totalInstallments: 4,
        grantedAt: '2026-04-01',
        periodicity: LoanPeriodicity.SEMANAL,
      });

      expect(result).toMatchObject({
        totalAmount: 1200,
        installmentAmount: 300,
        totalInstallments: 4,
        pendingInstallments: 4,
        outstandingBalance: 1200,
        periodicity: LoanPeriodicity.SEMANAL,
        hasDiscounts: false,
      });
      expect(
        aFechaCalendario(loanRepository.save.mock.calls[0][0].grantedAt),
      ).toBe('2026-04-01');
    });

    it('permite cambiar la periodicidad de un préstamo con descuentos', async () => {
      loanRepository.findById.mockResolvedValue(
        storedLoan({ pendingInstallments: 2, outstandingBalance: '667.00' }),
      );

      const result = await service.actualizar(22, {
        employeeId: 7,
        totalAmount: 1000,
        totalInstallments: 3,
        grantedAt: '2026-03-10',
        periodicity: LoanPeriodicity.QUINCENAL,
      });

      expect(result).toMatchObject({
        periodicity: LoanPeriodicity.QUINCENAL,
        pendingInstallments: 2,
        outstandingBalance: 667,
        hasDiscounts: true,
      });
    });

    it.each([
      ['el monto', { totalAmount: 2000 }],
      ['las cuotas', { totalInstallments: 5 }],
      ['la fecha', { grantedAt: '2026-05-01' }],
      ['el empleado', { employeeId: 8 }],
    ])('no permite cambiar %s si ya tiene descuentos', async (_caso, dto) => {
      loanRepository.findById.mockResolvedValue(
        storedLoan({ pendingInstallments: 2, outstandingBalance: '667.00' }),
      );

      await expect(service.actualizar(22, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(loanRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza el cambio a un empleado que no existe', async () => {
      loanRepository.findById.mockResolvedValue(storedLoan());
      loanRepository.findEmployeeById.mockResolvedValue(null);

      await expect(
        service.actualizar(22, { employeeId: 99 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza actualizar un préstamo que no existe', async () => {
      loanRepository.findById.mockResolvedValue(null);

      await expect(
        service.actualizar(99, { totalAmount: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('eliminar', () => {
    it('elimina un préstamo sin cuotas descontadas', async () => {
      loanRepository.findById.mockResolvedValue({ id: 22 } as EmployeeLoan);
      loanRepository.countInstallments.mockResolvedValue(0);

      await service.eliminar(22);

      expect(loanRepository.delete).toHaveBeenCalledWith(22);
    });

    it('no elimina un préstamo con cuotas descontadas', async () => {
      loanRepository.findById.mockResolvedValue({ id: 22 } as EmployeeLoan);
      loanRepository.countInstallments.mockResolvedValue(1);

      await expect(service.eliminar(22)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(loanRepository.delete).not.toHaveBeenCalled();
    });

    it('rechaza eliminar un préstamo que no existe', async () => {
      loanRepository.findById.mockResolvedValue(null);

      await expect(service.eliminar(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
