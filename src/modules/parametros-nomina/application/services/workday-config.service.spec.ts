import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { WorkdayConfigService } from './workday-config.service';

import { RegistrarJornadaLaboralCommand } from '../commands/workday-config.commands';
import { VigenciaSuperpuestaError } from '../../domain/errors/vigencia-superpuesta.error';
import { WORKDAY_CONFIG_REPOSITORY_PORT } from '../../domain/ports/workday-config.repository.port';
import { aFechaCalendario, type CierreDeVersion } from '../../domain/vigencia';

import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';

import { WorkdayConfig } from 'src/entities';

describe('WorkdayConfigService', () => {
  let service: WorkdayConfigService;

  const workdayConfigRepositoryMock: {
    findAll: jest.Mock;
    findVigente: jest.Mock;
    findUltima: jest.Mock;
    registrarVersion: jest.Mock;
  } = {
    findAll: jest.fn(),
    findVigente: jest.fn(),
    findUltima: jest.fn(),
    registrarVersion: jest.fn(),
  };

  const auditPortMock: {
    log: jest.Mock;
  } = {
    log: jest.fn(),
  };

  const actor: AuthUser = {
    id: 'a1b2c3d4-uuid-admin',
    email: 'admin@sisgal.com',
    role: Role.ADMINISTRADOR,
  };

  beforeEach(async () => {
    // 11 de octubre de 2026, 10:00 a. m. en Colombia.
    jest.useFakeTimers({
      now: new Date('2026-10-11T15:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    workdayConfigRepositoryMock.findUltima.mockResolvedValue(
      crearVersion({ id: 1 }),
    );
    workdayConfigRepositoryMock.registrarVersion.mockImplementation(
      (version: WorkdayConfig) =>
        Promise.resolve(Object.assign(version, { id: 2 })),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkdayConfigService,
        {
          provide: WORKDAY_CONFIG_REPOSITORY_PORT,
          useValue: workdayConfigRepositoryMock,
        },
        {
          provide: AUDIT_PORT,
          useValue: auditPortMock,
        },
      ],
    }).compile();

    service = module.get<WorkdayConfigService>(WorkdayConfigService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // obtenerHistorial (CA01, CA10)
  // =========================================================

  describe('obtenerHistorial', () => {
    it('debe retornar todas las versiones de la jornada laboral', async () => {
      const versiones = [
        crearVersion({ id: 2, valid_from: '2026-11-01', valid_to: null }),
        crearVersion({ id: 1, valid_to: '2026-10-31' }),
      ];

      workdayConfigRepositoryMock.findAll.mockResolvedValue(versiones);

      await expect(service.obtenerHistorial()).resolves.toEqual(versiones);
    });
  });

  // =========================================================
  // obtenerVigente (CA01, CA07)
  // =========================================================

  describe('obtenerVigente', () => {
    it('debe consultar la versión vigente en la fecha actual de Colombia', async () => {
      const version = crearVersion({ id: 1 });

      workdayConfigRepositoryMock.findVigente.mockResolvedValue(version);

      await expect(service.obtenerVigente()).resolves.toBe(version);

      expect(workdayConfigRepositoryMock.findVigente).toHaveBeenCalledWith(
        '2026-10-11',
      );
    });

    it('debe conservar el día de Colombia cuando en UTC ya es el día siguiente', async () => {
      // 10:00 p. m. del 11 de octubre en Colombia.
      jest.setSystemTime(new Date('2026-10-12T03:00:00.000Z'));

      workdayConfigRepositoryMock.findVigente.mockResolvedValue(
        crearVersion({ id: 1 }),
      );

      await service.obtenerVigente();

      expect(workdayConfigRepositoryMock.findVigente).toHaveBeenCalledWith(
        '2026-10-11',
      );
    });

    it('debe consultar la versión que rige en la fecha del cálculo', async () => {
      const version = crearVersion({ id: 1 });

      workdayConfigRepositoryMock.findVigente.mockResolvedValue(version);

      await expect(service.obtenerVigente('2026-03-15')).resolves.toBe(version);

      expect(workdayConfigRepositoryMock.findVigente).toHaveBeenCalledWith(
        '2026-03-15',
      );
    });

    it('debe lanzar NotFoundException cuando ninguna versión rige en la fecha', async () => {
      workdayConfigRepositoryMock.findVigente.mockResolvedValue(null);

      await expect(service.obtenerVigente('2025-06-01')).rejects.toThrow(
        new NotFoundException(
          'No existe una configuración de jornada laboral vigente para la fecha 2025-06-01.',
        ),
      );
    });
  });

  // =========================================================
  // registrar (CA02, CA06, CA08, CA09)
  // =========================================================

  describe('registrar', () => {
    it('debe registrar la nueva versión sin fecha de fin', async () => {
      const resultado = await service.registrar(crearCommand(), actor);

      expect(resultado).toMatchObject({
        id: 2,
        max_week_hours: 42,
        max_day_hours: 8,
        day_start: '06:00',
        day_end: '19:00',
        night_start: '19:00',
        night_end: '06:00',
        valid_to: null,
      });
      expect(aFechaCalendario(resultado.valid_from)).toBe('2026-11-01');
    });

    it('debe cerrar la versión anterior el día previo al inicio de la nueva', async () => {
      await service.registrar(crearCommand(), actor);

      expect(
        workdayConfigRepositoryMock.registrarVersion,
      ).toHaveBeenCalledTimes(1);

      const [, cierre] = workdayConfigRepositoryMock.registrarVersion.mock
        .calls[0] as [WorkdayConfig, CierreDeVersion];

      expect(cierre.id).toBe(1);
      expect(aFechaCalendario(cierre.validTo)).toBe('2026-10-31');
    });

    it('debe cerrar la versión anterior aunque su vigencia terminara antes', async () => {
      workdayConfigRepositoryMock.findUltima.mockResolvedValue(
        crearVersion({ id: 1, valid_to: '2026-12-31' }),
      );

      await service.registrar(crearCommand({ validFrom: '2027-02-01' }), actor);

      const [, cierre] = workdayConfigRepositoryMock.registrarVersion.mock
        .calls[0] as [WorkdayConfig, CierreDeVersion];

      // No queda ningún día sin jornada entre una versión y la siguiente.
      expect(aFechaCalendario(cierre.validTo)).toBe('2027-01-31');
    });

    it('debe registrar la primera versión sin cerrar ninguna anterior', async () => {
      workdayConfigRepositoryMock.findUltima.mockResolvedValue(null);

      await service.registrar(crearCommand(), actor);

      expect(workdayConfigRepositoryMock.registrarVersion).toHaveBeenCalledWith(
        expect.any(WorkdayConfig),
        undefined,
      );
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORKDAY_CONFIG_VERSION_CREATED',
          metadata: expect.objectContaining({
            previousVersionId: null,
            changes: expect.objectContaining({
              maxWeekHours: { anterior: null, nuevo: 42 },
            }),
          }),
        }),
      );
    });

    it('debe permitir que la vigencia inicie en la fecha actual', async () => {
      await service.registrar(crearCommand({ validFrom: '2026-10-11' }), actor);

      const [version, cierre] = workdayConfigRepositoryMock.registrarVersion
        .mock.calls[0] as [WorkdayConfig, CierreDeVersion];

      expect(aFechaCalendario(version.valid_from)).toBe('2026-10-11');
      expect(aFechaCalendario(cierre.validTo)).toBe('2026-10-10');
    });

    it('no debe modificar los valores de la versión anterior', async () => {
      const anterior = crearVersion({ id: 1 });

      workdayConfigRepositoryMock.findUltima.mockResolvedValue(anterior);

      await service.registrar(crearCommand(), actor);

      expect(anterior).toEqual(crearVersion({ id: 1 }));
    });

    it('debe auditar el usuario responsable y el valor anterior y nuevo de cada parámetro modificado', async () => {
      await service.registrar(crearCommand(), actor);

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORKDAY_CONFIG_VERSION_CREATED',
          module: 'Parámetros de nómina',
          resource: 'WorkdayConfig',
          resourceId: 2,
          result: 'SUCCESS',
          metadata: {
            performedBy: 'a1b2c3d4-uuid-admin',
            performedByEmail: 'admin@sisgal.com',
            validFrom: '2026-11-01',
            previousVersionId: 1,
            changes: {
              maxWeekHours: { anterior: 44, nuevo: 42 },
              dayEnd: { anterior: '21:00', nuevo: '19:00' },
              nightStart: { anterior: '21:00', nuevo: '19:00' },
            },
          },
        }),
      );
    });

    it('debe rechazar una fecha de vigencia anterior a la actual', async () => {
      await expect(
        service.registrar(crearCommand({ validFrom: '2026-10-10' }), actor),
      ).rejects.toThrow(
        new BadRequestException(
          'La fecha de inicio de vigencia no puede ser anterior a la fecha actual (2026-10-11).',
        ),
      );

      expect(
        workdayConfigRepositoryMock.registrarVersion,
      ).not.toHaveBeenCalled();
    });

    it.each(['2026-11-01', '2026-10-20'])(
      'debe rechazar la vigencia %s cuando se superpone con una versión programada',
      async (validFrom) => {
        workdayConfigRepositoryMock.findUltima.mockResolvedValue(
          crearVersion({ id: 3, valid_from: '2026-11-01', valid_to: null }),
        );

        await expect(
          service.registrar(crearCommand({ validFrom }), actor),
        ).rejects.toThrow(
          new ConflictException(
            'Ya existe una versión de la jornada laboral con vigencia desde 2026-11-01. La nueva vigencia debe iniciar después de esa fecha para no superponerse.',
          ),
        );

        expect(
          workdayConfigRepositoryMock.registrarVersion,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        'la jornada semanal es menor que la diaria',
        { maxWeekHours: 6, maxDayHours: 8 },
        'La jornada máxima semanal no puede ser menor que la jornada máxima diaria.',
      ],
      [
        'la jornada semanal supera siete jornadas diarias',
        { maxWeekHours: 44, maxDayHours: 4 },
        'La jornada máxima semanal no puede superar siete veces la jornada máxima diaria.',
      ],
      [
        'la jornada diurna termina antes de iniciar',
        { dayStart: '19:00', dayEnd: '06:00' },
        'La jornada diurna debe terminar después de iniciar.',
      ],
      [
        'queda una franja sin clasificar entre la jornada diurna y la nocturna',
        { nightStart: '20:00' },
        'La jornada nocturna debe iniciar cuando termina la diurna y terminar cuando esta inicia, para que todas las horas del día queden clasificadas.',
      ],
      [
        'la jornada nocturna se cruza con la diurna',
        { nightEnd: '07:00' },
        'La jornada nocturna debe iniciar cuando termina la diurna y terminar cuando esta inicia, para que todas las horas del día queden clasificadas.',
      ],
    ])(
      'debe rechazar la jornada cuando %s',
      async (
        _caso,
        datos: Partial<RegistrarJornadaLaboralCommand>,
        mensaje,
      ) => {
        await expect(
          service.registrar(crearCommand(datos), actor),
        ).rejects.toThrow(new BadRequestException(mensaje));

        expect(
          workdayConfigRepositoryMock.registrarVersion,
        ).not.toHaveBeenCalled();
      },
    );

    it('debe rechazar el registro cuando los valores no cambian', async () => {
      await expect(
        service.registrar(
          crearCommand({
            maxWeekHours: 44,
            dayEnd: '21:00',
            nightStart: '21:00',
          }),
          actor,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Los valores indicados son iguales a los de la última versión de la jornada laboral: no hay cambios para guardar.',
        ),
      );

      expect(
        workdayConfigRepositoryMock.registrarVersion,
      ).not.toHaveBeenCalled();
    });

    it('debe auditar los intentos rechazados por validación', async () => {
      await expect(
        service.registrar(crearCommand({ validFrom: '2026-10-10' }), actor),
      ).rejects.toThrow(BadRequestException);

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORKDAY_CONFIG_VERSION_CREATE_FAILED',
          result: 'FAILED',
          metadata: expect.objectContaining({
            performedBy: 'a1b2c3d4-uuid-admin',
            validFrom: '2026-10-10',
          }),
        }),
      );
    });

    it('debe traducir la superposición detectada por la base de datos a ConflictException', async () => {
      workdayConfigRepositoryMock.registrarVersion.mockRejectedValue(
        new VigenciaSuperpuestaError('la jornada laboral'),
      );

      await expect(service.registrar(crearCommand(), actor)).rejects.toThrow(
        new ConflictException(
          'El período de vigencia se superpone con el de otra versión de la jornada laboral.',
        ),
      );

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORKDAY_CONFIG_VERSION_CREATE_FAILED',
          result: 'FAILED',
        }),
      );
    });

    it('debe registrar la auditoría de fallo y propagar errores inesperados', async () => {
      const error = new Error('Conexión perdida');

      workdayConfigRepositoryMock.registrarVersion.mockRejectedValue(error);

      await expect(service.registrar(crearCommand(), actor)).rejects.toBe(
        error,
      );

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORKDAY_CONFIG_VERSION_CREATE_FAILED',
          result: 'FAILED',
          metadata: expect.objectContaining({
            error: 'Conexión perdida',
          }),
        }),
      );
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

function crearCommand(
  datos: Partial<RegistrarJornadaLaboralCommand> = {},
): RegistrarJornadaLaboralCommand {
  return {
    maxWeekHours: 42,
    maxDayHours: 8,
    dayStart: '06:00',
    dayEnd: '19:00',
    nightStart: '19:00',
    nightEnd: '06:00',
    validFrom: '2026-11-01',
    ...datos,
  };
}
