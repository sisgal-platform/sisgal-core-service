import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import { LoanService } from '../../../application/services/loan.service';
import { CreateLoanDto } from '../dtos/create-loan.dto';
import { LoanQueryDto } from '../dtos/loan-query.dto';
import { LoanController } from './loan.controller';

describe('LoanController', () => {
  let controller: LoanController;

  const loanServiceMock = {
    crear: jest.fn(),
    obtenerPorId: jest.fn(),
    obtenerTodos: jest.fn(),
    obtenerIndicadores: jest.fn(),
    actualizar: jest.fn(),
    eliminar: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoanController],
      providers: [
        {
          provide: LoanService,
          useValue: loanServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<LoanController>(LoanController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('crear', () => {
    it('delega los datos del préstamo al servicio', async () => {
      const dto = {
        employeeId: 7,
        totalAmount: 1000,
        totalInstallments: 4,
        grantedAt: '2026-03-10',
      } as CreateLoanDto;
      const loan = { id: 1 };
      loanServiceMock.crear.mockResolvedValue(loan);

      await expect(controller.crear(dto)).resolves.toBe(loan);
      expect(loanServiceMock.crear).toHaveBeenCalledWith(dto);
    });
  });

  describe('obtenerTodos', () => {
    it('delega los filtros al servicio y retorna los préstamos', async () => {
      const query = {
        empleadoId: 7,
        nombreEmpleado: 'María Pérez',
        documento: '123456789',
      } as LoanQueryDto;
      const loans = [{ id: 1 }, { id: 2 }];
      loanServiceMock.obtenerTodos.mockResolvedValue(loans);

      await expect(controller.obtenerTodos(query)).resolves.toBe(loans);

      expect(loanServiceMock.obtenerTodos).toHaveBeenCalledTimes(1);
      expect(loanServiceMock.obtenerTodos).toHaveBeenCalledWith(query);
    });

    it('retorna una lista vacía cuando el servicio no encuentra préstamos', async () => {
      loanServiceMock.obtenerTodos.mockResolvedValue([]);

      await expect(
        controller.obtenerTodos(new LoanQueryDto()),
      ).resolves.toEqual([]);
      expect(loanServiceMock.obtenerTodos).toHaveBeenCalledWith(
        new LoanQueryDto(),
      );
    });
  });

  describe('obtenerPorId', () => {
    it('delega el identificador al servicio y retorna el préstamo', async () => {
      const loan = { id: 3 };
      loanServiceMock.obtenerPorId.mockResolvedValue(loan);

      await expect(controller.obtenerPorId(3)).resolves.toBe(loan);
      expect(loanServiceMock.obtenerPorId).toHaveBeenCalledWith(3);
    });
  });

  describe('obtenerIndicadores', () => {
    it('delega la consulta al servicio y retorna los indicadores', async () => {
      const indicators = {
        cantidadPrestamosActivos: 3,
        montoTotalPrestamosActivos: 4500000,
      };
      loanServiceMock.obtenerIndicadores.mockResolvedValue(indicators);

      await expect(controller.obtenerIndicadores()).resolves.toBe(indicators);

      expect(loanServiceMock.obtenerIndicadores).toHaveBeenCalledTimes(1);
      expect(loanServiceMock.obtenerIndicadores).toHaveBeenCalledWith();
    });
  });

  it('delega la actualización y la eliminación al servicio', async () => {
    loanServiceMock.actualizar.mockResolvedValue({ id: 1 });

    await expect(
      controller.actualizar(1, { totalAmount: 500 }),
    ).resolves.toEqual({ id: 1 });
    await controller.eliminar(1);

    expect(loanServiceMock.actualizar).toHaveBeenCalledWith(1, {
      totalAmount: 500,
    });
    expect(loanServiceMock.eliminar).toHaveBeenCalledWith(1);
  });
});
