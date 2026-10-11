import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { WorkRateConfigController } from './work-rate-config.controller';
import { WorkRateConfigService } from '../../../application/services/work-rate-config.service';
import { RegisterWorkRatesDto } from '../dtos';
import { WorkRateType } from '../../../domain/work-rate-type.enum';

import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';

import { WorkRateConfig } from 'src/entities';

/** Clave con la que `@UseGuards` registra los guards en la metadata de Nest. */
const GUARDS_METADATA = '__guards__';

describe('WorkRateConfigController', () => {
  let controller: WorkRateConfigController;

  const workRateConfigServiceMock = {
    obtenerHistorial: jest.fn(),
    obtenerVigentes: jest.fn(),
    registrar: jest.fn(),
  };

  beforeEach(async () => {
    // 11 de octubre de 2026, 10:00 a. m. en Colombia.
    jest.useFakeTimers({
      now: new Date('2026-10-11T15:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkRateConfigController],
      providers: [
        {
          provide: WorkRateConfigService,
          useValue: workRateConfigServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<WorkRateConfigController>(WorkRateConfigController);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  // =========================================================
  // Control de acceso
  // =========================================================

  describe('control de acceso', () => {
    it('debe exigir autenticación y verificación de rol en todos los endpoints', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, WorkRateConfigController),
      ).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('debe permitir el acceso únicamente a administradores', () => {
      expect(Reflect.getMetadata(ROLES_KEY, WorkRateConfigController)).toEqual([
        Role.ADMINISTRADOR,
      ]);
    });
  });

  // =========================================================
  // GET /parametros-nomina/recargos
  // =========================================================

  describe('obtenerHistorial', () => {
    it('debe retornar las versiones con su período de vigencia y su estado', async () => {
      workRateConfigServiceMock.obtenerHistorial.mockResolvedValue([
        crearVersion({
          id: 3,
          multiplier: '1.30',
          valid_from: '2026-11-01',
          valid_to: null,
        }),
        crearVersion({
          id: 2,
          valid_from: '2026-07-01',
          valid_to: '2026-10-31',
        }),
        crearVersion({
          id: 1,
          multiplier: '1.20',
          valid_from: '2026-01-01',
          valid_to: '2026-06-30',
        }),
      ]);

      const resultado = await controller.obtenerHistorial();

      expect(resultado).toEqual([
        {
          id: 3,
          type: 'EXTRA_DIURNA',
          multiplier: 1.3,
          validFrom: '2026-11-01',
          validTo: null,
          status: 'PROGRAMADA',
        },
        {
          id: 2,
          type: 'EXTRA_DIURNA',
          multiplier: 1.25,
          validFrom: '2026-07-01',
          validTo: '2026-10-31',
          status: 'VIGENTE',
        },
        {
          id: 1,
          type: 'EXTRA_DIURNA',
          multiplier: 1.2,
          validFrom: '2026-01-01',
          validTo: '2026-06-30',
          status: 'HISTORICA',
        },
      ]);
    });

    it('debe retornar una lista vacía cuando no hay versiones', async () => {
      workRateConfigServiceMock.obtenerHistorial.mockResolvedValue([]);

      await expect(controller.obtenerHistorial()).resolves.toEqual([]);
    });
  });

  // =========================================================
  // GET /parametros-nomina/recargos/vigentes
  // =========================================================

  describe('obtenerVigentes', () => {
    it('debe consultar los recargos vigentes en la fecha actual cuando no se indica fecha', async () => {
      workRateConfigServiceMock.obtenerVigentes.mockResolvedValue([
        crearVersion({ id: 1 }),
      ]);

      const resultado = await controller.obtenerVigentes({});

      expect(resultado).toEqual([
        expect.objectContaining({ id: 1, multiplier: 1.25, status: 'VIGENTE' }),
      ]);
      expect(workRateConfigServiceMock.obtenerVigentes).toHaveBeenCalledWith(
        undefined,
      );
    });

    it('debe propagar al servicio la fecha consultada', async () => {
      workRateConfigServiceMock.obtenerVigentes.mockResolvedValue([]);

      await controller.obtenerVigentes({ fecha: '2026-03-15' });

      expect(workRateConfigServiceMock.obtenerVigentes).toHaveBeenCalledWith(
        '2026-03-15',
      );
    });
  });

  // =========================================================
  // POST /parametros-nomina/recargos
  // =========================================================

  describe('registrar', () => {
    it('debe registrar los recargos con el usuario autenticado y retornar las versiones creadas', async () => {
      const dto = crearDto();
      const request = crearRequest();

      workRateConfigServiceMock.registrar.mockResolvedValue([
        crearVersion({
          id: 20,
          multiplier: '1.30',
          valid_from: '2026-11-01',
          valid_to: null,
        }),
      ]);

      const resultado = await controller.registrar(dto, request);

      expect(resultado).toEqual([
        {
          id: 20,
          type: 'EXTRA_DIURNA',
          multiplier: 1.3,
          validFrom: '2026-11-01',
          validTo: null,
          status: 'PROGRAMADA',
        },
      ]);

      expect(workRateConfigServiceMock.registrar).toHaveBeenCalledTimes(1);
      expect(workRateConfigServiceMock.registrar).toHaveBeenCalledWith(
        dto,
        request.user,
      );
    });

    it('debe propagar los errores del servicio', async () => {
      const error = new Error('Fallo de base de datos');

      workRateConfigServiceMock.registrar.mockRejectedValue(error);

      await expect(
        controller.registrar(crearDto(), crearRequest()),
      ).rejects.toBe(error);
    });
  });
});

// =========================================================
// Utilidades
// =========================================================

/** TypeORM entrega las columnas `date` y `decimal` como texto. */
type DatosVersion = Partial<
  Omit<WorkRateConfig, 'multiplier' | 'valid_from' | 'valid_to'>
> & {
  multiplier?: string;
  valid_from?: string;
  valid_to?: string | null;
};

function crearVersion(datos: DatosVersion = {}): WorkRateConfig {
  return Object.assign(new WorkRateConfig(), {
    id: 1,
    type: WorkRateType.EXTRA_DIURNA,
    multiplier: '1.25',
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    ...datos,
  });
}

function crearRequest(): Request & { user: AuthUser } {
  return {
    user: {
      id: 'a1b2c3d4-uuid-admin',
      email: 'admin@sisgal.com',
      role: Role.ADMINISTRADOR,
    },
  } as Request & { user: AuthUser };
}

function crearDto(): RegisterWorkRatesDto {
  return {
    validFrom: '2026-11-01',
    rates: [{ type: WorkRateType.EXTRA_DIURNA, multiplier: 1.3 }],
  };
}
