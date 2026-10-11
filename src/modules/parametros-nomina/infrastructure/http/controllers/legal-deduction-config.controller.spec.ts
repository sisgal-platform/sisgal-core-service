import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { LegalDeductionConfigController } from './legal-deduction-config.controller';
import { LegalDeductionConfigService } from '../../../application/services/legal-deduction-config.service';
import { RegisterLegalDeductionsDto } from '../dtos';
import { LegalDeductionType } from '../../../domain/legal-deduction-type.enum';

import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';

import { SystemConfig } from 'src/entities';

/** Clave con la que `@UseGuards` registra los guards en la metadata de Nest. */
const GUARDS_METADATA = '__guards__';

describe('LegalDeductionConfigController', () => {
  let controller: LegalDeductionConfigController;

  const legalDeductionConfigServiceMock = {
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
      controllers: [LegalDeductionConfigController],
      providers: [
        {
          provide: LegalDeductionConfigService,
          useValue: legalDeductionConfigServiceMock,
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

    controller = module.get<LegalDeductionConfigController>(
      LegalDeductionConfigController,
    );
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
        Reflect.getMetadata(GUARDS_METADATA, LegalDeductionConfigController),
      ).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('debe permitir el acceso únicamente a administradores', () => {
      expect(
        Reflect.getMetadata(ROLES_KEY, LegalDeductionConfigController),
      ).toEqual([Role.ADMINISTRADOR]);
    });
  });

  // =========================================================
  // GET /parametros-nomina/descuentos-legales
  // =========================================================

  describe('obtenerHistorial', () => {
    it('debe retornar las versiones con su período de vigencia y su estado', async () => {
      legalDeductionConfigServiceMock.obtenerHistorial.mockResolvedValue([
        crearVersion({
          id: 3,
          value: '4.50',
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
          value: '3.50',
          valid_from: '2026-01-01',
          valid_to: '2026-06-30',
        }),
      ]);

      const resultado = await controller.obtenerHistorial();

      expect(resultado).toEqual([
        {
          id: 3,
          type: 'HEALTH_RATE',
          percentage: 4.5,
          validFrom: '2026-11-01',
          validTo: null,
          status: 'PROGRAMADA',
        },
        {
          id: 2,
          type: 'HEALTH_RATE',
          percentage: 4,
          validFrom: '2026-07-01',
          validTo: '2026-10-31',
          status: 'VIGENTE',
        },
        {
          id: 1,
          type: 'HEALTH_RATE',
          percentage: 3.5,
          validFrom: '2026-01-01',
          validTo: '2026-06-30',
          status: 'HISTORICA',
        },
      ]);
    });

    it('debe retornar una lista vacía cuando no hay versiones', async () => {
      legalDeductionConfigServiceMock.obtenerHistorial.mockResolvedValue([]);

      await expect(controller.obtenerHistorial()).resolves.toEqual([]);
    });
  });

  // =========================================================
  // GET /parametros-nomina/descuentos-legales/vigentes
  // =========================================================

  describe('obtenerVigentes', () => {
    it('debe consultar los descuentos vigentes en la fecha actual cuando no se indica fecha', async () => {
      legalDeductionConfigServiceMock.obtenerVigentes.mockResolvedValue([
        crearVersion({ id: 1 }),
      ]);

      const resultado = await controller.obtenerVigentes({});

      expect(resultado).toEqual([
        expect.objectContaining({ id: 1, percentage: 4, status: 'VIGENTE' }),
      ]);
      expect(
        legalDeductionConfigServiceMock.obtenerVigentes,
      ).toHaveBeenCalledWith(undefined);
    });

    it('debe propagar al servicio la fecha consultada', async () => {
      legalDeductionConfigServiceMock.obtenerVigentes.mockResolvedValue([]);

      await controller.obtenerVigentes({ fecha: '2026-03-15' });

      expect(
        legalDeductionConfigServiceMock.obtenerVigentes,
      ).toHaveBeenCalledWith('2026-03-15');
    });
  });

  // =========================================================
  // POST /parametros-nomina/descuentos-legales
  // =========================================================

  describe('registrar', () => {
    it('debe registrar los descuentos con el usuario autenticado y retornar las versiones creadas', async () => {
      const dto = crearDto();
      const request = crearRequest();

      legalDeductionConfigServiceMock.registrar.mockResolvedValue([
        crearVersion({
          id: 20,
          value: '4.50',
          valid_from: '2026-11-01',
          valid_to: null,
        }),
      ]);

      const resultado = await controller.registrar(dto, request);

      expect(resultado).toEqual([
        {
          id: 20,
          type: 'HEALTH_RATE',
          percentage: 4.5,
          validFrom: '2026-11-01',
          validTo: null,
          status: 'PROGRAMADA',
        },
      ]);

      expect(legalDeductionConfigServiceMock.registrar).toHaveBeenCalledTimes(
        1,
      );
      expect(legalDeductionConfigServiceMock.registrar).toHaveBeenCalledWith(
        dto,
        request.user,
      );
    });

    it('debe propagar los errores del servicio', async () => {
      const error = new Error('Fallo de base de datos');

      legalDeductionConfigServiceMock.registrar.mockRejectedValue(error);

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
  Omit<SystemConfig, 'value' | 'valid_from' | 'valid_to'>
> & {
  value?: string;
  valid_from?: string;
  valid_to?: string | null;
};

function crearVersion(datos: DatosVersion = {}): SystemConfig {
  return Object.assign(new SystemConfig(), {
    id: 1,
    key: LegalDeductionType.HEALTH_RATE,
    value: '4.00',
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

function crearDto(): RegisterLegalDeductionsDto {
  return {
    validFrom: '2026-11-01',
    deductions: [{ type: LegalDeductionType.HEALTH_RATE, percentage: 4.5 }],
  };
}
