import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { WorkdayConfigController } from './workday-config.controller';
import { WorkdayConfigService } from '../../../application/services/workday-config.service';
import { RegisterWorkdayConfigDto } from '../dtos';

import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';

import { WorkdayConfig } from 'src/entities';

/** Clave con la que `@UseGuards` registra los guards en la metadata de Nest. */
const GUARDS_METADATA = '__guards__';

describe('WorkdayConfigController', () => {
  let controller: WorkdayConfigController;

  const workdayConfigServiceMock = {
    obtenerHistorial: jest.fn(),
    obtenerVigente: jest.fn(),
    registrar: jest.fn(),
  };

  beforeEach(async () => {
    // 11 de octubre de 2026, 10:00 a. m. en Colombia.
    jest.useFakeTimers({
      now: new Date('2026-10-11T15:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkdayConfigController],
      providers: [
        {
          provide: WorkdayConfigService,
          useValue: workdayConfigServiceMock,
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

    controller = module.get<WorkdayConfigController>(WorkdayConfigController);
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
        Reflect.getMetadata(GUARDS_METADATA, WorkdayConfigController),
      ).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('debe permitir el acceso únicamente a administradores', () => {
      expect(Reflect.getMetadata(ROLES_KEY, WorkdayConfigController)).toEqual([
        Role.ADMINISTRADOR,
      ]);
    });
  });

  // =========================================================
  // GET /parametros-nomina/jornada-laboral
  // =========================================================

  describe('obtenerHistorial', () => {
    it('debe retornar las versiones con su período de vigencia y su estado', async () => {
      workdayConfigServiceMock.obtenerHistorial.mockResolvedValue([
        crearVersion({ id: 3, valid_from: '2026-11-01', valid_to: null }),
        crearVersion({
          id: 2,
          valid_from: '2026-07-01',
          valid_to: '2026-10-31',
        }),
        crearVersion({
          id: 1,
          max_week_hours: 46,
          valid_from: '2026-01-01',
          valid_to: '2026-06-30',
        }),
      ]);

      const resultado = await controller.obtenerHistorial();

      expect(resultado).toEqual([
        {
          id: 3,
          maxWeekHours: 44,
          maxDayHours: 8,
          dayStart: '06:00',
          dayEnd: '21:00',
          nightStart: '21:00',
          nightEnd: '06:00',
          validFrom: '2026-11-01',
          validTo: null,
          status: 'PROGRAMADA',
        },
        {
          id: 2,
          maxWeekHours: 44,
          maxDayHours: 8,
          dayStart: '06:00',
          dayEnd: '21:00',
          nightStart: '21:00',
          nightEnd: '06:00',
          validFrom: '2026-07-01',
          validTo: '2026-10-31',
          status: 'VIGENTE',
        },
        {
          id: 1,
          maxWeekHours: 46,
          maxDayHours: 8,
          dayStart: '06:00',
          dayEnd: '21:00',
          nightStart: '21:00',
          nightEnd: '06:00',
          validFrom: '2026-01-01',
          validTo: '2026-06-30',
          status: 'HISTORICA',
        },
      ]);
    });

    it('debe retornar una lista vacía cuando no hay versiones', async () => {
      workdayConfigServiceMock.obtenerHistorial.mockResolvedValue([]);

      await expect(controller.obtenerHistorial()).resolves.toEqual([]);
    });
  });

  // =========================================================
  // GET /parametros-nomina/jornada-laboral/vigente
  // =========================================================

  describe('obtenerVigente', () => {
    it('debe consultar la versión vigente en la fecha actual cuando no se indica fecha', async () => {
      workdayConfigServiceMock.obtenerVigente.mockResolvedValue(
        crearVersion({ id: 1 }),
      );

      const resultado = await controller.obtenerVigente({});

      expect(resultado).toMatchObject({ id: 1, status: 'VIGENTE' });
      expect(workdayConfigServiceMock.obtenerVigente).toHaveBeenCalledWith(
        undefined,
      );
    });

    it('debe propagar al servicio la fecha consultada', async () => {
      workdayConfigServiceMock.obtenerVigente.mockResolvedValue(
        crearVersion({ id: 1 }),
      );

      await controller.obtenerVigente({ fecha: '2026-03-15' });

      expect(workdayConfigServiceMock.obtenerVigente).toHaveBeenCalledWith(
        '2026-03-15',
      );
    });
  });

  // =========================================================
  // POST /parametros-nomina/jornada-laboral
  // =========================================================

  describe('registrar', () => {
    it('debe registrar la versión con el usuario autenticado y retornar el DTO de respuesta', async () => {
      const dto = crearDto();
      const request = crearRequest();

      workdayConfigServiceMock.registrar.mockResolvedValue(
        crearVersion({
          id: 2,
          max_week_hours: 42,
          day_start: '06:00',
          day_end: '19:00',
          night_start: '19:00',
          night_end: '06:00',
          valid_from: '2026-11-01',
          valid_to: null,
        }),
      );

      const resultado = await controller.registrar(dto, request);

      expect(resultado).toEqual({
        id: 2,
        maxWeekHours: 42,
        maxDayHours: 8,
        dayStart: '06:00',
        dayEnd: '19:00',
        nightStart: '19:00',
        nightEnd: '06:00',
        validFrom: '2026-11-01',
        validTo: null,
        status: 'PROGRAMADA',
      });

      expect(workdayConfigServiceMock.registrar).toHaveBeenCalledTimes(1);
      expect(workdayConfigServiceMock.registrar).toHaveBeenCalledWith(
        dto,
        request.user,
      );
    });

    it('debe propagar los errores del servicio', async () => {
      const error = new Error('Fallo de base de datos');

      workdayConfigServiceMock.registrar.mockRejectedValue(error);

      await expect(
        controller.registrar(crearDto(), crearRequest()),
      ).rejects.toBe(error);
    });
  });
});

// =========================================================
// Utilidades
// =========================================================

/** TypeORM entrega las columnas `date` como texto y las `time` como HH:mm:ss. */
type DatosVersion = Partial<Omit<WorkdayConfig, 'valid_from' | 'valid_to'>> & {
  valid_from?: string;
  valid_to?: string | null;
};

function crearVersion(datos: DatosVersion = {}): WorkdayConfig {
  return Object.assign(new WorkdayConfig(), {
    id: 1,
    max_week_hours: 44,
    max_day_hours: 8,
    day_start: '06:00:00',
    day_end: '21:00:00',
    night_start: '21:00:00',
    night_end: '06:00:00',
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

function crearDto(): RegisterWorkdayConfigDto {
  return {
    maxWeekHours: 42,
    maxDayHours: 8,
    dayStart: '06:00',
    dayEnd: '19:00',
    nightStart: '19:00',
    nightEnd: '06:00',
    validFrom: '2026-11-01',
  };
}
