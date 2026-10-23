import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { RegistrarMarcacionService } from './registrar-marcacion.service';

import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { Branch, Employee, EmployeeBranchAssignment } from 'src/entities';

import {
  LecturaBiometricaError,
  RegistroDuplicadoError,
} from '../../domain/errors/marcacion.errors';
import { LECTOR_BIOMETRICO_PORT } from '../../domain/ports/lector-biometrico.port';
import {
  MARCACION_REPOSITORY_PORT,
  MarcacionRegistrada,
} from '../../domain/ports/marcacion.repository.port';
import { MetodoMarcacion } from '../../domain/value-objects/metodo-marcacion.enum';
import { TipoMarcacion } from '../../domain/value-objects/tipo-marcacion.enum';

describe('RegistrarMarcacionService', () => {
  let service: RegistrarMarcacionService;

  const lectorBiometricoMock = {
    identificar: jest.fn(),
  };

  const marcacionRepositoryMock = {
    findEmpleadoPorDocumento: jest.fn(),
    registrar: jest.fn(),
  };

  const auditPortMock = {
    log: jest.fn(),
  };

  // 22 de octubre de 2026, 7:58 a. m. en Colombia.
  const ahora = new Date('2026-10-22T12:58:00.000Z');
  const idempotencyKey = '3f1c2a5e-8b7d-4c1e-9a6f-2d4b8e9c7a10';
  const lecturaDeAna = { capturaExitosa: true, huella: '1020304050' };

  const centro = Object.assign(new Branch(), {
    id: 3,
    name: 'Sucursal Centro',
  });
  const ana = crearEmpleado({ sucursal: centro });

  const entradaRegistrada: MarcacionRegistrada = {
    id: 10,
    tipo: TipoMarcacion.ENTRADA,
    metodo: MetodoMarcacion.HUELLA,
    fechaHora: ahora,
    registroAsistenciaId: 20,
    sucursalId: centro.id,
    sucursalNombre: centro.name,
    entrada: ahora,
    salida: null,
    minutosTrabajados: null,
    repetida: false,
  };

  beforeEach(async () => {
    jest.useFakeTimers({
      now: ahora,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    lectorBiometricoMock.identificar.mockImplementation((huella: string) =>
      Promise.resolve(huella),
    );
    marcacionRepositoryMock.findEmpleadoPorDocumento.mockResolvedValue(ana);
    marcacionRepositoryMock.registrar.mockResolvedValue(entradaRegistrada);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrarMarcacionService,
        { provide: LECTOR_BIOMETRICO_PORT, useValue: lectorBiometricoMock },
        {
          provide: MARCACION_REPOSITORY_PORT,
          useValue: marcacionRepositoryMock,
        },
        { provide: AUDIT_PORT, useValue: auditPortMock },
      ],
    }).compile();

    service = module.get<RegistrarMarcacionService>(RegistrarMarcacionService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('marcación válida', () => {
    it('registra la marcación con la hora del servidor, el método huella y el restaurante del empleado', async () => {
      await service.registrarMarcacionBiometrica(lecturaDeAna, idempotencyKey);

      expect(lectorBiometricoMock.identificar).toHaveBeenCalledWith(
        '1020304050',
      );
      expect(
        marcacionRepositoryMock.findEmpleadoPorDocumento,
      ).toHaveBeenCalledWith('1020304050');
      expect(marcacionRepositoryMock.registrar).toHaveBeenCalledWith({
        empleadoId: ana.id,
        sucursal: centro,
        metodo: MetodoMarcacion.HUELLA,
        idempotencyKey,
        fechaHora: ahora,
      });
    });

    it('responde con el tipo de marcación, el empleado y el restaurante', async () => {
      const respuesta = await service.registrarMarcacionBiometrica(
        lecturaDeAna,
        idempotencyKey,
      );

      expect(respuesta).toEqual(
        expect.objectContaining({
          id: 10,
          tipo: TipoMarcacion.ENTRADA,
          metodo: MetodoMarcacion.HUELLA,
          fechaHora: ahora,
          empleadoId: ana.id,
          empleadoNombre: 'Ana Ruiz',
          sucursalId: centro.id,
          sucursalNombre: 'Sucursal Centro',
          registroAsistenciaId: 20,
        }),
      );
    });

    it('responde la salida con los minutos trabajados de la jornada', async () => {
      const cincoPm = new Date('2026-10-22T22:00:00.000Z');
      marcacionRepositoryMock.registrar.mockResolvedValue({
        ...entradaRegistrada,
        id: 11,
        tipo: TipoMarcacion.SALIDA,
        fechaHora: cincoPm,
        salida: cincoPm,
        minutosTrabajados: 542,
      });

      const respuesta = await service.registrarMarcacionBiometrica(
        lecturaDeAna,
        idempotencyKey,
      );

      expect(respuesta).toEqual(
        expect.objectContaining({
          tipo: TipoMarcacion.SALIDA,
          entrada: ahora,
          salida: cincoPm,
          minutosTrabajados: 542,
        }),
      );
    });

    it('audita la marcación registrada', async () => {
      await service.registrarMarcacionBiometrica(lecturaDeAna, idempotencyKey);

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_MARK_REGISTERED',
          resourceId: 10,
          result: 'SUCCESS',
          metadata: expect.objectContaining({
            empleadoId: ana.id,
            tipo: TipoMarcacion.ENTRADA,
            metodo: MetodoMarcacion.HUELLA,
          }),
        }),
      );
    });

    it('no vuelve a auditar un reintento con la misma clave', async () => {
      marcacionRepositoryMock.registrar.mockResolvedValue({
        ...entradaRegistrada,
        repetida: true,
      });

      const respuesta = await service.registrarMarcacionBiometrica(
        lecturaDeAna,
        idempotencyKey,
      );

      expect(respuesta.id).toBe(10);
      expect(auditPortMock.log).not.toHaveBeenCalled();
    });
  });

  describe('errores del lector', () => {
    it('rechaza la marcación cuando el lector no captura la huella', async () => {
      const resultado = service.registrarMarcacionBiometrica(
        { capturaExitosa: false },
        idempotencyKey,
      );

      await expect(resultado).rejects.toThrow(ServiceUnavailableException);
      await expect(resultado).rejects.toThrow('Error en lectura biométrica');
      expect(lectorBiometricoMock.identificar).not.toHaveBeenCalled();
      expect(marcacionRepositoryMock.registrar).not.toHaveBeenCalled();
    });

    it('rechaza la marcación cuando el lector falla al comparar la huella', async () => {
      lectorBiometricoMock.identificar.mockRejectedValue(
        new LecturaBiometricaError('Sin respuesta del lector'),
      );

      await expect(
        service.registrarMarcacionBiometrica(lecturaDeAna, idempotencyKey),
      ).rejects.toThrow('Error en lectura biométrica');

      expect(marcacionRepositoryMock.registrar).not.toHaveBeenCalled();
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_MARK_REJECTED',
          result: 'FAILED',
          metadata: expect.objectContaining({
            motivo: 'LECTURA_FALLIDA',
            detalle: 'Sin respuesta del lector',
          }),
        }),
      );
    });
  });

  describe('identidad del empleado', () => {
    it('rechaza una huella que el lector no reconoce', async () => {
      lectorBiometricoMock.identificar.mockResolvedValue(null);

      const resultado = service.registrarMarcacionBiometrica(
        lecturaDeAna,
        idempotencyKey,
      );

      await expect(resultado).rejects.toThrow(NotFoundException);
      await expect(resultado).rejects.toThrow('Huella no reconocida');
      expect(
        marcacionRepositoryMock.findEmpleadoPorDocumento,
      ).not.toHaveBeenCalled();
      expect(marcacionRepositoryMock.registrar).not.toHaveBeenCalled();
    });

    it('rechaza una huella que no pertenece a ningún empleado registrado', async () => {
      marcacionRepositoryMock.findEmpleadoPorDocumento.mockResolvedValue(null);

      await expect(
        service.registrarMarcacionBiometrica(lecturaDeAna, idempotencyKey),
      ).rejects.toThrow('Huella no reconocida');

      expect(marcacionRepositoryMock.registrar).not.toHaveBeenCalled();
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_MARK_REJECTED',
          metadata: expect.objectContaining({
            motivo: 'HUELLA_NO_RECONOCIDA',
          }),
        }),
      );
    });

    it('rechaza la marcación de un empleado inactivo', async () => {
      marcacionRepositoryMock.findEmpleadoPorDocumento.mockResolvedValue(
        crearEmpleado({ sucursal: centro, status: 'INACTIVO' }),
      );

      const resultado = service.registrarMarcacionBiometrica(
        lecturaDeAna,
        idempotencyKey,
      );

      await expect(resultado).rejects.toThrow(BadRequestException);
      await expect(resultado).rejects.toThrow(
        'El empleado no se encuentra activo.',
      );
      expect(marcacionRepositoryMock.registrar).not.toHaveBeenCalled();
    });

    it('rechaza la marcación de un empleado sin restaurante asignado', async () => {
      marcacionRepositoryMock.findEmpleadoPorDocumento.mockResolvedValue(
        crearEmpleado({ sucursal: null }),
      );

      await expect(
        service.registrarMarcacionBiometrica(lecturaDeAna, idempotencyKey),
      ).rejects.toThrow('El empleado no tiene un restaurante asignado.');

      expect(marcacionRepositoryMock.registrar).not.toHaveBeenCalled();
    });
  });

  describe('persistencia', () => {
    it('rechaza una marcación duplicada', async () => {
      marcacionRepositoryMock.registrar.mockRejectedValue(
        new RegistroDuplicadoError(),
      );

      const resultado = service.registrarMarcacionBiometrica(
        lecturaDeAna,
        idempotencyKey,
      );

      await expect(resultado).rejects.toThrow(ConflictException);
      await expect(resultado).rejects.toThrow(
        'Registro duplicado no permitido',
      );
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_MARK_REJECTED',
          metadata: expect.objectContaining({
            motivo: 'REGISTRO_DUPLICADO',
            empleadoId: ana.id,
          }),
        }),
      );
    });

    it('audita y propaga un error al guardar la marcación', async () => {
      marcacionRepositoryMock.registrar.mockRejectedValue(
        new Error('Conexión perdida'),
      );

      await expect(
        service.registrarMarcacionBiometrica(lecturaDeAna, idempotencyKey),
      ).rejects.toThrow('Conexión perdida');

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_MARK_FAILED',
          result: 'FAILED',
          metadata: expect.objectContaining({
            empleadoId: ana.id,
            error: 'Conexión perdida',
          }),
        }),
      );
    });
  });
});

function crearEmpleado({
  sucursal,
  status = 'ACTIVO',
}: {
  sucursal: Branch | null;
  status?: string;
}): Employee {
  return Object.assign(new Employee(), {
    id: 7,
    firstName: 'Ana',
    lastName: 'Ruiz',
    document: '1020304050',
    status,
    employee_branch_assig: sucursal
      ? [
          Object.assign(new EmployeeBranchAssignment(), {
            id: 1,
            is_current: true,
            branch: sucursal,
          }),
        ]
      : [],
  });
}
