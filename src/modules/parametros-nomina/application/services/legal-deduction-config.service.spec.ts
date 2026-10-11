import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { LegalDeductionConfigService } from './legal-deduction-config.service';

import { RegistrarDescuentosLegalesCommand } from '../commands/legal-deduction-config.commands';
import { VigenciaSuperpuestaError } from '../../domain/errors/vigencia-superpuesta.error';
import { LegalDeductionType } from '../../domain/legal-deduction-type.enum';
import { LEGAL_DEDUCTION_CONFIG_REPOSITORY_PORT } from '../../domain/ports/legal-deduction-config.repository.port';
import { aFechaCalendario, type CierreDeVersion } from '../../domain/vigencia';

import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';

import { SystemConfig } from 'src/entities';

describe('LegalDeductionConfigService', () => {
  let service: LegalDeductionConfigService;

  const legalDeductionConfigRepositoryMock: {
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

  const CLAVES = [
    LegalDeductionType.HEALTH_RATE,
    LegalDeductionType.PENSION_RATE,
  ];

  beforeEach(async () => {
    // 11 de octubre de 2026, 10:00 a. m. en Colombia.
    jest.useFakeTimers({
      now: new Date('2026-10-11T15:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    legalDeductionConfigRepositoryMock.findUltimas.mockResolvedValue([
      crearVersion({ id: 1, key: LegalDeductionType.HEALTH_RATE }),
      crearVersion({ id: 2, key: LegalDeductionType.PENSION_RATE }),
    ]);
    legalDeductionConfigRepositoryMock.registrarVersiones.mockImplementation(
      (versiones: SystemConfig[]) =>
        Promise.resolve(
          versiones.map((version, indice) =>
            Object.assign(version, { id: 20 + indice }),
          ),
        ),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalDeductionConfigService,
        {
          provide: LEGAL_DEDUCTION_CONFIG_REPOSITORY_PORT,
          useValue: legalDeductionConfigRepositoryMock,
        },
        {
          provide: AUDIT_PORT,
          useValue: auditPortMock,
        },
      ],
    }).compile();

    service = module.get<LegalDeductionConfigService>(
      LegalDeductionConfigService,
    );
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
    it('debe consultar solo los descuentos legales y agruparlos, de la versión más reciente a la más antigua', async () => {
      legalDeductionConfigRepositoryMock.findAll.mockResolvedValue([
        crearVersion({ id: 3, key: LegalDeductionType.PENSION_RATE }),
        crearVersion({
          id: 1,
          key: LegalDeductionType.HEALTH_RATE,
          valid_to: '2026-10-31',
        }),
        crearVersion({
          id: 2,
          key: LegalDeductionType.HEALTH_RATE,
          value: '4.50',
          valid_from: '2026-11-01',
          valid_to: null,
        }),
      ]);

      const resultado = await service.obtenerHistorial();

      expect(resultado.map((version) => version.id)).toEqual([2, 1, 3]);
      // `system_config` guarda también otros parámetros, como el salario mínimo.
      expect(legalDeductionConfigRepositoryMock.findAll).toHaveBeenCalledWith(
        CLAVES,
      );
    });
  });

  // =========================================================
  // obtenerVigentes (CA01, CA07)
  // =========================================================

  describe('obtenerVigentes', () => {
    it('debe consultar los descuentos vigentes en la fecha actual de Colombia', async () => {
      legalDeductionConfigRepositoryMock.findVigentes.mockResolvedValue([]);

      await service.obtenerVigentes();

      expect(
        legalDeductionConfigRepositoryMock.findVigentes,
      ).toHaveBeenCalledWith(CLAVES, '2026-10-11');
    });

    it('debe conservar el día de Colombia cuando en UTC ya es el día siguiente', async () => {
      // 10:00 p. m. del 11 de octubre en Colombia.
      jest.setSystemTime(new Date('2026-10-12T03:00:00.000Z'));

      legalDeductionConfigRepositoryMock.findVigentes.mockResolvedValue([]);

      await service.obtenerVigentes();

      expect(
        legalDeductionConfigRepositoryMock.findVigentes,
      ).toHaveBeenCalledWith(CLAVES, '2026-10-11');
    });

    it('debe consultar los descuentos que rigen en la fecha de la liquidación, en el orden del catálogo', async () => {
      legalDeductionConfigRepositoryMock.findVigentes.mockResolvedValue([
        crearVersion({ id: 2, key: LegalDeductionType.PENSION_RATE }),
        crearVersion({ id: 1, key: LegalDeductionType.HEALTH_RATE }),
      ]);

      const resultado = await service.obtenerVigentes('2026-03-15');

      expect(resultado.map((version) => version.id)).toEqual([1, 2]);
      expect(
        legalDeductionConfigRepositoryMock.findVigentes,
      ).toHaveBeenCalledWith(CLAVES, '2026-03-15');
    });
  });

  // =========================================================
  // registrar (CA05, CA06, CA08, CA09)
  // =========================================================

  describe('registrar', () => {
    it('debe registrar una versión sin fecha de fin por cada descuento modificado', async () => {
      const resultado = await service.registrar(crearCommand(), actor);

      expect(resultado).toHaveLength(2);
      expect(resultado[0]).toMatchObject({
        id: 20,
        key: LegalDeductionType.HEALTH_RATE,
        value: 4.5,
        valid_to: null,
      });
      expect(resultado[1]).toMatchObject({
        id: 21,
        key: LegalDeductionType.PENSION_RATE,
        value: 5,
        valid_to: null,
      });
      expect(aFechaCalendario(resultado[0].valid_from)).toBe('2026-11-01');
      expect(aFechaCalendario(resultado[1].valid_from)).toBe('2026-11-01');
    });

    it('debe consultar la última versión solo de los descuentos modificados', async () => {
      await service.registrar(
        crearCommand({
          deductions: [
            { type: LegalDeductionType.PENSION_RATE, percentage: 5 },
          ],
        }),
        actor,
      );

      expect(
        legalDeductionConfigRepositoryMock.findUltimas,
      ).toHaveBeenCalledWith([LegalDeductionType.PENSION_RATE]);
    });

    it('debe guardar todos los cambios juntos y cerrar cada versión anterior el día previo', async () => {
      await service.registrar(crearCommand(), actor);

      expect(
        legalDeductionConfigRepositoryMock.registrarVersiones,
      ).toHaveBeenCalledTimes(1);

      const [versiones, cierres] = legalDeductionConfigRepositoryMock
        .registrarVersiones.mock.calls[0] as [
        SystemConfig[],
        CierreDeVersion[],
      ];

      expect(versiones).toHaveLength(2);
      expect(cierres.map((cierre) => cierre.id)).toEqual([1, 2]);
      expect(cierres.map((cierre) => aFechaCalendario(cierre.validTo))).toEqual(
        ['2026-10-31', '2026-10-31'],
      );
    });

    it('debe registrar la primera versión de un descuento sin cerrar ninguna anterior', async () => {
      legalDeductionConfigRepositoryMock.findUltimas.mockResolvedValue([
        crearVersion({ id: 1, key: LegalDeductionType.HEALTH_RATE }),
      ]);

      await service.registrar(crearCommand(), actor);

      const [, cierres] = legalDeductionConfigRepositoryMock.registrarVersiones
        .mock.calls[0] as [SystemConfig[], CierreDeVersion[]];

      expect(cierres.map((cierre) => cierre.id)).toEqual([1]);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEGAL_DEDUCTION_CONFIG_VERSIONS_CREATED',
          metadata: expect.objectContaining({
            changes: {
              HEALTH_RATE: { anterior: 4, nuevo: 4.5 },
              PENSION_RATE: { anterior: null, nuevo: 5 },
            },
          }),
        }),
      );
    });

    it('debe permitir que la vigencia inicie en la fecha actual', async () => {
      await service.registrar(crearCommand({ validFrom: '2026-10-11' }), actor);

      const [versiones, cierres] = legalDeductionConfigRepositoryMock
        .registrarVersiones.mock.calls[0] as [
        SystemConfig[],
        CierreDeVersion[],
      ];

      expect(aFechaCalendario(versiones[0].valid_from)).toBe('2026-10-11');
      expect(aFechaCalendario(cierres[0].validTo)).toBe('2026-10-10');
    });

    it('no debe modificar los valores de las versiones anteriores', async () => {
      const anterior = crearVersion({
        id: 1,
        key: LegalDeductionType.HEALTH_RATE,
      });

      legalDeductionConfigRepositoryMock.findUltimas.mockResolvedValue([
        anterior,
      ]);

      await service.registrar(
        crearCommand({
          deductions: [
            { type: LegalDeductionType.HEALTH_RATE, percentage: 4.5 },
          ],
        }),
        actor,
      );

      expect(anterior).toEqual(
        crearVersion({ id: 1, key: LegalDeductionType.HEALTH_RATE }),
      );
    });

    it('debe auditar el usuario responsable y el valor anterior y nuevo de cada descuento modificado', async () => {
      await service.registrar(crearCommand(), actor);

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEGAL_DEDUCTION_CONFIG_VERSIONS_CREATED',
          module: 'Parámetros de nómina',
          resource: 'SystemConfig',
          result: 'SUCCESS',
          metadata: {
            performedBy: 'a1b2c3d4-uuid-admin',
            performedByEmail: 'admin@sisgal.com',
            validFrom: '2026-11-01',
            versionIds: [20, 21],
            changes: {
              HEALTH_RATE: { anterior: 4, nuevo: 4.5 },
              PENSION_RATE: { anterior: 4, nuevo: 5 },
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
        legalDeductionConfigRepositoryMock.registrarVersiones,
      ).not.toHaveBeenCalled();
    });

    it.each(['2026-11-01', '2026-10-20'])(
      'no debe guardar ningún descuento cuando la vigencia %s se superpone con una versión programada de uno de ellos',
      async (validFrom) => {
        legalDeductionConfigRepositoryMock.findUltimas.mockResolvedValue([
          crearVersion({ id: 1, key: LegalDeductionType.HEALTH_RATE }),
          crearVersion({
            id: 9,
            key: LegalDeductionType.PENSION_RATE,
            valid_from: '2026-11-01',
            valid_to: null,
          }),
        ]);

        await expect(
          service.registrar(crearCommand({ validFrom }), actor),
        ).rejects.toThrow(
          new ConflictException(
            'Ya existe una versión del descuento de pensión con vigencia desde 2026-11-01. La nueva vigencia debe iniciar después de esa fecha para no superponerse.',
          ),
        );

        expect(
          legalDeductionConfigRepositoryMock.registrarVersiones,
        ).not.toHaveBeenCalled();
      },
    );

    it('debe rechazar un descuento cuyo porcentaje no cambia', async () => {
      await expect(
        service.registrar(
          crearCommand({
            deductions: [
              { type: LegalDeductionType.HEALTH_RATE, percentage: 4 },
              { type: LegalDeductionType.PENSION_RATE, percentage: 5 },
            ],
          }),
          actor,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'El descuento de salud ya tiene el porcentaje 4 %: no hay cambios para guardar.',
        ),
      );

      expect(
        legalDeductionConfigRepositoryMock.registrarVersiones,
      ).not.toHaveBeenCalled();
    });

    it('debe rechazar un descuento repetido en la solicitud', async () => {
      await expect(
        service.registrar(
          crearCommand({
            deductions: [
              { type: LegalDeductionType.HEALTH_RATE, percentage: 4.5 },
              { type: LegalDeductionType.HEALTH_RATE, percentage: 5 },
            ],
          }),
          actor,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'El descuento de salud está repetido en la solicitud.',
        ),
      );

      expect(
        legalDeductionConfigRepositoryMock.findUltimas,
      ).not.toHaveBeenCalled();
    });

    it('debe auditar los intentos rechazados por validación', async () => {
      await expect(
        service.registrar(crearCommand({ validFrom: '2026-10-10' }), actor),
      ).rejects.toThrow(BadRequestException);

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEGAL_DEDUCTION_CONFIG_VERSIONS_CREATE_FAILED',
          result: 'FAILED',
          metadata: expect.objectContaining({
            performedBy: 'a1b2c3d4-uuid-admin',
            validFrom: '2026-10-10',
            types: CLAVES,
          }),
        }),
      );
    });

    it('debe traducir la superposición detectada por la base de datos a ConflictException', async () => {
      legalDeductionConfigRepositoryMock.registrarVersiones.mockRejectedValue(
        new VigenciaSuperpuestaError('los descuentos legales'),
      );

      await expect(service.registrar(crearCommand(), actor)).rejects.toThrow(
        new ConflictException(
          'El período de vigencia se superpone con el de otra versión de los descuentos legales.',
        ),
      );

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEGAL_DEDUCTION_CONFIG_VERSIONS_CREATE_FAILED',
          result: 'FAILED',
        }),
      );
    });

    it('debe registrar la auditoría de fallo y propagar errores inesperados', async () => {
      const error = new Error('Conexión perdida');

      legalDeductionConfigRepositoryMock.registrarVersiones.mockRejectedValue(
        error,
      );

      await expect(service.registrar(crearCommand(), actor)).rejects.toBe(
        error,
      );

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEGAL_DEDUCTION_CONFIG_VERSIONS_CREATE_FAILED',
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

function crearCommand(
  datos: Partial<RegistrarDescuentosLegalesCommand> = {},
): RegistrarDescuentosLegalesCommand {
  return {
    validFrom: '2026-11-01',
    deductions: [
      { type: LegalDeductionType.HEALTH_RATE, percentage: 4.5 },
      { type: LegalDeductionType.PENSION_RATE, percentage: 5 },
    ],
    ...datos,
  };
}
