import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmployeeLoan } from 'src/entities';
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
          grantedAt: new Date('2026-03-10T00:00:00.000Z'),
          periodicity: LoanPeriodicity.MENSUAL,
          status: LoanStatus.ACTIVO,
        }),
      );
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
});
