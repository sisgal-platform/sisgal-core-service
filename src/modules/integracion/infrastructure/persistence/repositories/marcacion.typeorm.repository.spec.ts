import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { MarcacionTypeOrmRepository } from './marcacion.typeorm.repository';

import {
  AttendanceLog,
  AttendanceRecord,
  AttendanceRecordLog,
  Branch,
  Employee,
  Holiday,
} from 'src/entities';

import { RegistroDuplicadoError } from '../../../domain/errors/marcacion.errors';
import { NuevaMarcacion } from '../../../domain/ports/marcacion.repository.port';
import { MetodoMarcacion } from '../../../domain/value-objects/metodo-marcacion.enum';
import { TipoMarcacion } from '../../../domain/value-objects/tipo-marcacion.enum';

/** QueryBuilder encadenable; cada entidad tiene el suyo para simular sus resultados. */
function crearQueryBuilder() {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn(),
    setLock: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    limit: jest.fn(),
    getOne: jest.fn().mockResolvedValue(null),
    getExists: jest.fn().mockResolvedValue(false),
  };

  for (const metodo of [
    'leftJoinAndSelect',
    'setLock',
    'where',
    'orderBy',
    'addOrderBy',
    'limit',
  ] as const) {
    queryBuilder[metodo].mockReturnValue(queryBuilder);
  }

  return queryBuilder;
}

type QueryBuilderMock = ReturnType<typeof crearQueryBuilder>;

describe('MarcacionTypeOrmRepository', () => {
  let repository: MarcacionTypeOrmRepository;
  let queryBuilders: Map<unknown, QueryBuilderMock>;
  let empleadosQueryBuilder: QueryBuilderMock;

  const managerMock = {
    getRepository: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const employeeRepositoryMock = {
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };

  const centro = Object.assign(new Branch(), {
    id: 3,
    name: 'Sucursal Centro',
  });

  // 22 de octubre de 2026 en Colombia (UTC-5).
  const ochoAm = new Date('2026-10-22T13:00:00.000Z');
  const cincoPm = new Date('2026-10-22T22:00:00.000Z');

  const marcacion: NuevaMarcacion = {
    empleadoId: 7,
    sucursal: centro,
    metodo: MetodoMarcacion.HUELLA,
    idempotencyKey: '3f1c2a5e-8b7d-4c1e-9a6f-2d4b8e9c7a10',
    fechaHora: ochoAm,
  };

  /** QueryBuilder que usa la transacción para consultar la entidad. */
  function consultasDe(entidad: unknown): QueryBuilderMock {
    let queryBuilder = queryBuilders.get(entidad);

    if (!queryBuilder) {
      queryBuilder = crearQueryBuilder();
      queryBuilders.set(entidad, queryBuilder);
    }

    return queryBuilder;
  }

  function guardados<T>(entidad: new () => T): T[] {
    return managerMock.save.mock.calls
      .map(([guardado]) => guardado as unknown)
      .filter((guardado): guardado is T => guardado instanceof entidad);
  }

  beforeEach(async () => {
    queryBuilders = new Map();
    empleadosQueryBuilder = crearQueryBuilder();

    employeeRepositoryMock.createQueryBuilder.mockReturnValue(
      empleadosQueryBuilder,
    );
    employeeRepositoryMock.manager.transaction.mockImplementation(
      (trabajo: (manager: typeof managerMock) => Promise<unknown>) =>
        trabajo(managerMock),
    );
    managerMock.getRepository.mockImplementation((entidad: unknown) => ({
      createQueryBuilder: () => consultasDe(entidad),
    }));
    managerMock.update.mockResolvedValue({ affected: 1 });

    // Simula los ids que asigna la base de datos al guardar.
    let siguienteId = 100;
    managerMock.save.mockImplementation((entidad: { id?: number }) => {
      entidad.id ??= siguienteId++;
      return Promise.resolve(entidad);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarcacionTypeOrmRepository,
        {
          provide: getRepositoryToken(Employee),
          useValue: employeeRepositoryMock,
        },
      ],
    }).compile();

    repository = module.get<MarcacionTypeOrmRepository>(
      MarcacionTypeOrmRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findEmpleadoPorDocumento', () => {
    it('busca al empleado por documento con su asignación de sucursal vigente', async () => {
      await repository.findEmpleadoPorDocumento('1020304050');

      expect(empleadosQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'employee.employee_branch_assig',
        'currentAssignment',
        'currentAssignment.is_current = true',
      );
      expect(empleadosQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'currentAssignment.branch',
        'branch',
      );
      expect(empleadosQueryBuilder.where).toHaveBeenCalledWith(
        'employee.document = :documento',
        { documento: '1020304050' },
      );
    });
  });

  describe('registrar', () => {
    it('bloquea al empleado dentro de la transacción antes de decidir', async () => {
      await repository.registrar(marcacion);

      expect(employeeRepositoryMock.manager.transaction).toHaveBeenCalled();
      expect(consultasDe(Employee).setLock).toHaveBeenCalledWith(
        'pessimistic_write',
      );
      expect(consultasDe(Employee).where).toHaveBeenCalledWith(
        'employee.id = :id',
        { id: 7 },
      );
    });

    it('consulta solo la última jornada del empleado', async () => {
      await repository.registrar(marcacion);

      const ultimaJornada = consultasDe(AttendanceRecord);
      expect(ultimaJornada.where).toHaveBeenCalledWith(
        'record.employee_id = :empleadoId',
        { empleadoId: 7 },
      );
      expect(ultimaJornada.orderBy).toHaveBeenCalledWith(
        'record.check_in',
        'DESC',
      );
      expect(ultimaJornada.limit).toHaveBeenCalledWith(1);
    });

    it('registra una entrada: abre la jornada y guarda la marcación con su método', async () => {
      const resultado = await repository.registrar(marcacion);

      const [registro] = guardados(AttendanceRecord);
      expect(registro).toEqual(
        expect.objectContaining({
          check_in: ochoAm,
          check_out: null,
          work_minutes: 0,
          is_holiday: false,
          employee: { id: 7 },
          branch: centro,
        }),
      );

      const [log] = guardados(AttendanceLog);
      expect(log).toEqual(
        expect.objectContaining({
          event_time: ochoAm,
          event_type: TipoMarcacion.ENTRADA,
          auth_method: MetodoMarcacion.HUELLA,
          idempotency_key: marcacion.idempotencyKey,
          employee: { id: 7 },
          biometricDevice: null,
        }),
      );

      expect(resultado).toEqual(
        expect.objectContaining({
          tipo: TipoMarcacion.ENTRADA,
          registroAsistenciaId: registro.id,
          sucursalNombre: 'Sucursal Centro',
          salida: null,
          minutosTrabajados: null,
          repetida: false,
        }),
      );
    });

    it('relaciona la marcación con el registro de asistencia', async () => {
      await repository.registrar(marcacion);

      const [registro] = guardados(AttendanceRecord);
      const [log] = guardados(AttendanceLog);
      const [relacion] = guardados(AttendanceRecordLog);

      expect(relacion.attendanceRecord).toBe(registro);
      expect(relacion.attendanceLog).toBe(log);
    });

    it('marca la jornada como festiva cuando la entrada cae en un festivo', async () => {
      consultasDe(Holiday).getExists.mockResolvedValue(true);

      await repository.registrar(marcacion);

      expect(consultasDe(Holiday).where).toHaveBeenCalledWith(
        'holiday.date = CAST(:date AS date)',
        { date: '2026-10-22' },
      );
      expect(guardados(AttendanceRecord)[0].is_holiday).toBe(true);
    });

    it('registra una salida: cierra la entrada abierta con los minutos trabajados', async () => {
      consultasDe(AttendanceRecord).getOne.mockResolvedValue(
        Object.assign(new AttendanceRecord(), {
          id: 20,
          check_in: ochoAm,
          check_out: null,
          work_minutes: 0,
          branch: centro,
        }),
      );

      const resultado = await repository.registrar({
        ...marcacion,
        fechaHora: cincoPm,
      });

      expect(managerMock.update).toHaveBeenCalledWith(
        AttendanceRecord,
        { id: 20 },
        { check_out: cincoPm, work_minutes: 540 },
      );
      expect(guardados(AttendanceRecord)).toEqual([]);
      expect(guardados(AttendanceLog)[0].event_type).toBe(TipoMarcacion.SALIDA);
      expect(resultado).toEqual(
        expect.objectContaining({
          tipo: TipoMarcacion.SALIDA,
          registroAsistenciaId: 20,
          entrada: ochoAm,
          salida: cincoPm,
          minutosTrabajados: 540,
        }),
      );
    });

    it('rechaza una marcación duplicada sin guardar nada', async () => {
      consultasDe(AttendanceRecord).getOne.mockResolvedValue(
        Object.assign(new AttendanceRecord(), {
          id: 20,
          check_in: ochoAm,
          check_out: null,
        }),
      );

      await expect(
        repository.registrar({
          ...marcacion,
          fechaHora: new Date(ochoAm.getTime() + 30_000),
        }),
      ).rejects.toThrow(RegistroDuplicadoError);

      expect(managerMock.save).not.toHaveBeenCalled();
      expect(managerMock.update).not.toHaveBeenCalled();
    });

    it('devuelve la marcación original cuando la clave de idempotencia ya existe', async () => {
      const registro = Object.assign(new AttendanceRecord(), {
        id: 20,
        check_in: ochoAm,
        check_out: cincoPm,
        work_minutes: 540,
        branch: centro,
      });
      consultasDe(AttendanceLog).getOne.mockResolvedValue(
        Object.assign(new AttendanceLog(), {
          id: 10,
          event_time: ochoAm,
          event_type: TipoMarcacion.ENTRADA,
          auth_method: MetodoMarcacion.HUELLA,
          attendanceRecordLogs: [
            Object.assign(new AttendanceRecordLog(), {
              attendanceRecord: registro,
            }),
          ],
        }),
      );

      const resultado = await repository.registrar(marcacion);

      expect(consultasDe(AttendanceLog).where).toHaveBeenCalledWith(
        'log.idempotency_key = :idempotencyKey',
        { idempotencyKey: marcacion.idempotencyKey },
      );
      expect(managerMock.save).not.toHaveBeenCalled();
      expect(resultado).toEqual(
        expect.objectContaining({
          id: 10,
          tipo: TipoMarcacion.ENTRADA,
          registroAsistenciaId: 20,
          salida: null,
          repetida: true,
        }),
      );
    });

    it('propaga el error de la base para que la transacción se revierta', async () => {
      managerMock.save.mockRejectedValueOnce(new Error('Conexión perdida'));

      await expect(repository.registrar(marcacion)).rejects.toThrow(
        'Conexión perdida',
      );
    });
  });
});
