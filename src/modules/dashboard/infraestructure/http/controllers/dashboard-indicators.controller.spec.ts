import { Test, TestingModule } from '@nestjs/testing';

import { DashboardIndicatorsController } from './dashboard-indicators.controller';
import { DashboardIndicatorsService } from 'src/modules/dashboard/application/services/dashboard-indicators.service';
import { DashboardIndicators } from 'src/modules/dashboard/domain/dashboard-indicators';
import { today } from 'src/modules/dashboard/domain/period-range';

import { Role } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';

describe('DashboardIndicatorsController', () => {
  let controller: DashboardIndicatorsController;

  const dashboardIndicatorsServiceMock = {
    getIndicators: jest.fn(),
  };

  const indicadores: DashboardIndicators = {
    attendance: { averagePercentage: 89, changeVsPreviousPeriod: 3.2, weeklyDistribution: [] },
    workedHours: { total: 1750, changeVsPreviousPeriod: 2.9, trend: [] },
    laborCosts: { total: 190000, changeVsPreviousPeriod: -1.5, distribution: [] },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardIndicatorsController],
      providers: [
        {
          provide: DashboardIndicatorsService,
          useValue: dashboardIndicatorsServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<DashboardIndicatorsController>(
      DashboardIndicatorsController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('seguridad', () => {
    it('debe exigir autenticación y validación de roles', () => {
      const guards = Reflect.getMetadata('__guards__', DashboardIndicatorsController);

      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('debe estar restringido al rol administrador', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, DashboardIndicatorsController);

      expect(roles).toEqual([Role.ADMINISTRADOR]);
    });
  });

  describe('getIndicators', () => {
    it('debe retornar los indicadores mapeados al DTO de respuesta', async () => {
      dashboardIndicatorsServiceMock.getIndicators.mockResolvedValue(indicadores);

      const resultado = await controller.getIndicators({
        periodoDesde: '2026-10-01',
        periodoHasta: '2026-10-31',
      });

      expect(resultado).toEqual(
        expect.objectContaining({
          attendance: expect.objectContaining({ averagePercentage: 89 }),
          workedHours: expect.objectContaining({ total: 1750 }),
          laborCosts: expect.objectContaining({ total: 190000 }),
        }),
      );
    });

    it('debe enviar al servicio el período recibido', async () => {
      dashboardIndicatorsServiceMock.getIndicators.mockResolvedValue(indicadores);

      await controller.getIndicators({
        periodoDesde: '2026-10-01',
        periodoHasta: '2026-10-31',
      });

      expect(dashboardIndicatorsServiceMock.getIndicators).toHaveBeenCalledWith(
        '2026-10-01',
        '2026-10-31',
      );
    });

    it('debe usar el día de hoy como fin del período cuando no se indica', async () => {
      dashboardIndicatorsServiceMock.getIndicators.mockResolvedValue(indicadores);

      await controller.getIndicators({});

      const [, hasta] = dashboardIndicatorsServiceMock.getIndicators.mock.calls[0];
      expect(hasta).toBe(today());
    });

    it('debe usar el primer día del mes del fin del período cuando no se indica el inicio', async () => {
      dashboardIndicatorsServiceMock.getIndicators.mockResolvedValue(indicadores);

      await controller.getIndicators({ periodoHasta: '2026-10-15' });

      expect(dashboardIndicatorsServiceMock.getIndicators).toHaveBeenCalledWith(
        '2026-10-01',
        '2026-10-15',
      );
    });

    it('debe propagar los errores del servicio', async () => {
      const error = new Error('Período inválido');
      dashboardIndicatorsServiceMock.getIndicators.mockRejectedValue(error);

      await expect(controller.getIndicators({})).rejects.toBe(error);
    });
  });
});
