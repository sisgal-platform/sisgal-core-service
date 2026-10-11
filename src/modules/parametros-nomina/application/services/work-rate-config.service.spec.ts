import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { WorkRateConfigService } from './work-rate-config.service';

import { RegistrarRecargosCommand } from '../commands/work-rate-config.commands';
import { VigenciaSuperpuestaError } from '../../domain/errors/vigencia-superpuesta.error';
import { WORK_RATE_CONFIG_REPOSITORY_PORT } from '../../domain/ports/work-rate-config.repository.port';
import { aFechaCalendario, type CierreDeVersion } from '../../domain/vigencia';
import { WorkRateType } from '../../domain/work-rate-type.enum';

import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';

import { WorkRateConfig } from 'src/entities';

describe('WorkRateConfigService', () => {
  let service: WorkRateConfigService;

  const workRateConfigRepositoryMock: {
    findAll: jest.Mock;
    findVigentes: jest.Mock;
    findUltimas: jest.Mock;
    registrarVersiones: jest.Mock;
  } = {
    findAll: jest.fn(),
    findVigentes: jest.fn(),
    findUltimas: jest.fn(),
    registrarVersiones: jest.fn(),
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

    workRateConfigRepositoryMock.findUltimas.mockResolvedValue([
      crearVersion({ id: 3, type: WorkRateType.EXTRA_DIURNA }),
      crearVersion({
        id: 4,
        type: WorkRateType.EXTRA_NOCTURNA,
        multiplier: '1.75',
      }),
    ]);
    workRateConfigRepositoryMock.registrarVersiones.mockImplementation(
      (versiones: WorkRateConfig[]) =>
        Promise.resolve(
          versiones.map((version, indice) =>
            Object.assign(version, { id: 20 + indice }),
          ),
        ),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkRateConfigService,
        {
          provide: WORK_RATE_CONFIG_REPOSITORY_PORT,
          useValue: workRateConfigRepositoryMock,
        },
        {
          provide: AUDIT_PORT,
          useValue: auditPortMock,
        },
      ],
    }).compile();

    service = module.get<WorkRateConfigService>(WorkRateConfigService);
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
    it('debe agrupar las versiones por tipo de hora, de la más reciente a la más antigua', async () => {
      workRateConfigRepositoryMock.findAll.mockResolvedValue([
        crearVersion({
          id: 1,
          type: WorkRateType.EXTRA_DIURNA,
          valid_to: '2026-10-31',
        }),
        crearVersion({
          id: 2,
          type: WorkRateType.DOMINICAL_DIURNA,
          multiplier: '1.75',
        }),
        crearVersion({ id: 3, type: WorkRateType.ORDINARIA_DIURNA }),
        crearVersion({
          id: 4,
          type: WorkRateType.EXTRA_DIURNA,
          multiplier: '1.30',
          valid_from: '2026-11-01',
          valid_to: null,
        }),
      ]);

      const resultado = await service.obtenerHistorial();

      expect(resultado.map((version) => version.id)).toEqual([3, 4, 1, 2]);
    });
  });

  // =========================================================
  // obtenerVigentes (CA01, CA07)
  // =========================================================

  describe('obtenerVigentes', () => {
    it('debe consultar los recargos vigentes en la fecha actual de Colombia', async () => {
      workRateConfigRepositoryMock.findVigentes.mockResolvedValue([]);

      await service.obtenerVigentes();

      expect(workRateConfigRepositoryMock.findVigentes).toHaveBeenCalledWith(
        '2026-10-11',
      );
    });

    it('debe conservar el día de Colombia cuando en UTC ya es el día siguiente', async () => {
      // 10:00 p. m. del 11 de octubre en Colombia.
      jest.setSystemTime(new Date('2026-10-12T03:00:00.000Z'));

      workRateConfigRepositoryMock.findVigentes.mockResolvedValue([]);

      await service.obtenerVigentes();

      expect(workRateConfigRepositoryMock.findVigentes).toHaveBeenCalledWith(
        '2026-10-11',
      );
    });

    it('debe consultar los recargos que rigen en la fecha del cálculo, en el orden del catálogo', async () => {
      workRateConfigRepositoryMock.findVigentes.mockResolvedValue([
        crearVersion({ id: 2, type: WorkRateType.EXTRA_NOCTURNA }),
        crearVersion({ id: 1, type: WorkRateType.ORDINARIA_NOCTURNA }),
      ]);

      const resultado = await service.obtenerVigentes('2026-03-15');

      expect(resultado.map((version) => version.id)).toEqual([1, 2]);
      expect(workRateConfigRepositoryMock.findVigentes).toHaveBeenCalledWith(
        '2026-03-15',
      );
    });
  });

  // =========================================================
  // registrar (CA04, CA06, CA08, CA09)
  // =========================================================

  describe('registrar', () => {
    it('debe registrar una versión sin fecha de fin por cada recargo modificado', async () => {
      const resultado = await service.registrar(crearCommand(), actor);

      expect(resultado).toHaveLength(2);
      expect(resultado[0]).toMatchObject({
        id: 20,
        type: WorkRateType.EXTRA_DIURNA,
        multiplier: 1.3,
        valid_to: null,
      });
      expect(resultado[1]).toMatchObject({
        id: 21,
        type: WorkRateType.EXTRA_NOCTURNA,
        multiplier: 1.8,
        valid_to: null,
      });
      expect(aFechaCalendario(resultado[0].valid_from)).toBe('2026-11-01');
      expect(aFechaCalendario(resultado[1].valid_from)).toBe('2026-11-01');
    });

    it('debe consultar la última versión solo de los tipos de hora modificados', async () => {
      await service.registrar(crearCommand(), actor);

      expect(workRateConfigRepositoryMock.findUltimas).toHaveBeenCalledWith([
        WorkRateType.EXTRA_DIURNA,
        WorkRateType.EXTRA_NOCTURNA,
      ]);
    });

    it('debe guardar todos los cambios juntos y cerrar cada versión anterior el día previo', async () => {
      await service.registrar(crearCommand(), actor);

      expect(
        workRateConfigRepositoryMock.registrarVersiones,
      ).toHaveBeenCalledTimes(1);

      const [versiones, cierres] = workRateConfigRepositoryMock
        .registrarVersiones.mock.calls[0] as [
        WorkRateConfig[],
        CierreDeVersion[],
      ];

      expect(versiones).toHaveLength(2);
      expect(cierres.map((cierre) => cierre.id)).toEqual([3, 4]);
      expect(cierres.map((cierre) => aFechaCalendario(cierre.validTo))).toEqual(
        ['2026-10-31', '2026-10-31'],
      );
    });

    it('debe registrar la primera versión de un tipo de hora sin cerrar ninguna anterior', async () => {
      workRateConfigRepositoryMock.findUltimas.mockResolvedValue([
        crearVersion({ id: 3, type: WorkRateType.EXTRA_DIURNA }),
      ]);

      await service.registrar(crearCommand(), actor);

      const [, cierres] = workRateConfigRepositoryMock.registrarVersiones.mock
        .calls[0] as [WorkRateConfig[], CierreDeVersion[]];

      expect(cierres.map((cierre) => cierre.id)).toEqual([3]);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORK_RATE_CONFIG_VERSIONS_CREATED',
          metadata: expect.objectContaining({
            changes: {
              EXTRA_DIURNA: { anterior: 1.25, nuevo: 1.3 },
              EXTRA_NOCTURNA: { anterior: null, nuevo: 1.8 },
            },
          }),
        }),
      );
    });

    it('debe permitir que la vigencia inicie en la fecha actual', async () => {
      await service.registrar(crearCommand({ validFrom: '2026-10-11' }), actor);

      const [versiones, cierres] = workRateConfigRepositoryMock
        .registrarVersiones.mock.calls[0] as [
        WorkRateConfig[],
        CierreDeVersion[],
      ];

      expect(aFechaCalendario(versiones[0].valid_from)).toBe('2026-10-11');
      expect(aFechaCalendario(cierres[0].validTo)).toBe('2026-10-10');
    });

    it('no debe modificar los valores de las versiones anteriores', async () => {
      const anterior = crearVersion({ id: 3, type: WorkRateType.EXTRA_DIURNA });

      workRateConfigRepositoryMock.findUltimas.mockResolvedValue([anterior]);

      await service.registrar(
        crearCommand({
          rates: [{ type: WorkRateType.EXTRA_DIURNA, multiplier: 1.3 }],
        }),
        actor,
      );

      expect(anterior).toEqual(
        crearVersion({ id: 3, type: WorkRateType.EXTRA_DIURNA }),
      );
    });

    it('debe auditar el usuario responsable y el valor anterior y nuevo de cada recargo modificado', async () => {
      await service.registrar(crearCommand(), actor);

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORK_RATE_CONFIG_VERSIONS_CREATED',
          module: 'Parámetros de nómina',
          resource: 'WorkRateConfig',
          result: 'SUCCESS',
          metadata: {
            performedBy: 'a1b2c3d4-uuid-admin',
            performedByEmail: 'admin@sisgal.com',
            validFrom: '2026-11-01',
            versionIds: [20, 21],
            changes: {
              EXTRA_DIURNA: { anterior: 1.25, nuevo: 1.3 },
              EXTRA_NOCTURNA: { anterior: 1.75, nuevo: 1.8 },
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
        workRateConfigRepositoryMock.registrarVersiones,
      ).not.toHaveBeenCalled();
    });

    it.each(['2026-11-01', '2026-10-20'])(
      'no debe guardar ningún recargo cuando la vigencia %s se superpone con una versión programada de uno de ellos',
      async (validFrom) => {
        workRateConfigRepositoryMock.findUltimas.mockResolvedValue([
          crearVersion({ id: 3, type: WorkRateType.EXTRA_DIURNA }),
          crearVersion({
            id: 9,
            type: WorkRateType.EXTRA_NOCTURNA,
            multiplier: '1.75',
            valid_from: '2026-11-01',
            valid_to: null,
          }),
        ]);

        await expect(
          service.registrar(crearCommand({ validFrom }), actor),
        ).rejects.toThrow(
          new ConflictException(
            'Ya existe una versión del recargo de la hora extra nocturna con vigencia desde 2026-11-01. La nueva vigencia debe iniciar después de esa fecha para no superponerse.',
          ),
        );

        expect(
          workRateConfigRepositoryMock.registrarVersiones,
        ).not.toHaveBeenCalled();
      },
    );

    it('debe rechazar un recargo cuyo multiplicador no cambia', async () => {
      await expect(
        service.registrar(
          crearCommand({
            rates: [
              { type: WorkRateType.EXTRA_DIURNA, multiplier: 1.25 },
              { type: WorkRateType.EXTRA_NOCTURNA, multiplier: 1.8 },
            ],
          }),
          actor,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'El recargo de la hora extra diurna ya tiene el multiplicador 1.25: no hay cambios para guardar.',
        ),
      );

      expect(
        workRateConfigRepositoryMock.registrarVersiones,
      ).not.toHaveBeenCalled();
    });

    it('debe rechazar un tipo de hora repetido en la solicitud', async () => {
      await expect(
        service.registrar(
          crearCommand({
            rates: [
              { type: WorkRateType.EXTRA_DIURNA, multiplier: 1.3 },
              { type: WorkRateType.EXTRA_DIURNA, multiplier: 1.4 },
            ],
          }),
          actor,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'El recargo de la hora extra diurna está repetido en la solicitud.',
        ),
      );

      expect(workRateConfigRepositoryMock.findUltimas).not.toHaveBeenCalled();
    });

    it('debe auditar los intentos rechazados por validación', async () => {
      await expect(
        service.registrar(crearCommand({ validFrom: '2026-10-10' }), actor),
      ).rejects.toThrow(BadRequestException);

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORK_RATE_CONFIG_VERSIONS_CREATE_FAILED',
          result: 'FAILED',
          metadata: expect.objectContaining({
            performedBy: 'a1b2c3d4-uuid-admin',
            validFrom: '2026-10-10',
            types: [WorkRateType.EXTRA_DIURNA, WorkRateType.EXTRA_NOCTURNA],
          }),
        }),
      );
    });

    it('debe traducir la superposición detectada por la base de datos a ConflictException', async () => {
      workRateConfigRepositoryMock.registrarVersiones.mockRejectedValue(
        new VigenciaSuperpuestaError('los recargos laborales'),
      );

      await expect(service.registrar(crearCommand(), actor)).rejects.toThrow(
        new ConflictException(
          'El período de vigencia se superpone con el de otra versión de los recargos laborales.',
        ),
      );

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORK_RATE_CONFIG_VERSIONS_CREATE_FAILED',
          result: 'FAILED',
        }),
      );
    });

    it('debe registrar la auditoría de fallo y propagar errores inesperados', async () => {
      const error = new Error('Conexión perdida');

      workRateConfigRepositoryMock.registrarVersiones.mockRejectedValue(error);

      await expect(service.registrar(crearCommand(), actor)).rejects.toBe(
        error,
      );

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WORK_RATE_CONFIG_VERSIONS_CREATE_FAILED',
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

function crearCommand(
  datos: Partial<RegistrarRecargosCommand> = {},
): RegistrarRecargosCommand {
  return {
    validFrom: '2026-11-01',
    rates: [
      { type: WorkRateType.EXTRA_DIURNA, multiplier: 1.3 },
      { type: WorkRateType.EXTRA_NOCTURNA, multiplier: 1.8 },
    ],
    ...datos,
  };
}
