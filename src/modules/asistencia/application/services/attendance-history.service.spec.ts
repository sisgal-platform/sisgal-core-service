import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AttendanceHistoryService } from './attendance-history.service';

import { ATTENDANCE_RECORD_REPOSITORY_PORT } from '../../domain/ports/attendance-record.repository.port';
import { AttendanceRecordStatus } from '../../domain/value-objects/attendance-record-status.enum';

import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';

import { AttendanceRecord, Branch, Employee } from 'src/entities';

describe('AttendanceHistoryService', () => {
  let service: AttendanceHistoryService;

  const attendanceRecordRepositoryMock: {
    findHistory: jest.Mock;
    findByIdAndEmployee: jest.Mock;
    updateCheckOutIfIncomplete: jest.Mock;
  } = {
    findHistory: jest.fn(),
    findByIdAndEmployee: jest.fn(),
    updateCheckOutIfIncomplete: jest.fn(),
  };

  const auditPortMock: {
    log: jest.Mock;
  } = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    // 4 de octubre de 2026, 10:00 a. m. en Colombia.
    jest.useFakeTimers({
      now: new Date('2026-10-04T15:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    attendanceRecordRepositoryMock.findHistory.mockResolvedValue({
      records: [],
      total: 0,
    });
    attendanceRecordRepositoryMock.updateCheckOutIfIncomplete.mockResolvedValue(
      true,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceHistoryService,
        {
          provide: ATTENDANCE_RECORD_REPOSITORY_PORT,
          useValue: attendanceRecordRepositoryMock,
        },
        {
          provide: AUDIT_PORT,
          useValue: auditPortMock,
        },
      ],
    }).compile();

    service = module.get<AttendanceHistoryService>(AttendanceHistoryService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // =========================================================
  // Inicialización
  // =========================================================

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // Actualización de hora de salida
  // =========================================================

  describe('actualizarHoraSalida', () => {
    it('debe completar la salida para el empleado y actualizar los minutos', async () => {
      const registro = crearRegistro({
        id: 15,
        check_in: new Date('2026-09-15T13:00:00.000Z'), // 08:00 Colombia
        check_out: null,
      });
      attendanceRecordRepositoryMock.findByIdAndEmployee.mockResolvedValue(
        registro,
      );

      const resultado = await service.actualizarHoraSalida(15, {
        empleadoId: 7,
        horaSalida: '17:30',
      });

      expect(
        attendanceRecordRepositoryMock.updateCheckOutIfIncomplete,
      ).toHaveBeenCalledWith(15, 7, new Date('2026-09-15T22:30:00.000Z'), 570);
      expect(resultado).toMatchObject({
        id: 15,
        empleadoId: 7,
        checkOut: new Date('2026-09-15T22:30:00.000Z'),
        workedMinutes: 570,
        status: AttendanceRecordStatus.COMPLETO,
      });
    });

    it('debe interpretar una salida anterior como el día siguiente en Colombia', async () => {
      const registro = crearRegistro({
        id: 15,
        check_in: new Date('2026-09-16T02:00:00.000Z'), // 21:00 del 15 en Colombia
        check_out: null,
      });
      attendanceRecordRepositoryMock.findByIdAndEmployee.mockResolvedValue(
        registro,
      );

      await service.actualizarHoraSalida(15, {
        empleadoId: 7,
        horaSalida: '02:00',
      });

      expect(
        attendanceRecordRepositoryMock.updateCheckOutIfIncomplete,
      ).toHaveBeenCalledWith(15, 7, new Date('2026-09-16T07:00:00.000Z'), 300);
    });

    it('debe rechazar un registro que no corresponde al empleado', async () => {
      attendanceRecordRepositoryMock.findByIdAndEmployee.mockResolvedValue(
        null,
      );
      await expect(
        service.actualizarHoraSalida(15, {
          empleadoId: 8,
          horaSalida: '17:30',
        }),
      ).rejects.toThrow(
        'No se encontró la asistencia para el empleado indicado.',
      );
      expect(
        attendanceRecordRepositoryMock.updateCheckOutIfIncomplete,
      ).not.toHaveBeenCalled();
    });

    it('debe rechazar una asistencia que ya tiene salida', async () => {
      attendanceRecordRepositoryMock.findByIdAndEmployee.mockResolvedValue(
        crearRegistro({ check_out: new Date('2026-09-15T21:00:00.000Z') }),
      );
      await expect(
        service.actualizarHoraSalida(15, {
          empleadoId: 7,
          horaSalida: '17:30',
        }),
      ).rejects.toThrow('La asistencia ya tiene una hora de salida marcada.');
      expect(
        attendanceRecordRepositoryMock.updateCheckOutIfIncomplete,
      ).not.toHaveBeenCalled();
    });

    it('debe rechazar una salida igual a la hora de entrada', async () => {
      attendanceRecordRepositoryMock.findByIdAndEmployee.mockResolvedValue(
        crearRegistro({
          check_in: new Date('2026-09-15T13:00:00.000Z'),
          check_out: null,
        }),
      );
      await expect(
        service.actualizarHoraSalida(15, {
          empleadoId: 7,
          horaSalida: '08:00',
        }),
      ).rejects.toThrow(
        'La hora de salida debe ser posterior a la hora de entrada.',
      );
    });

    it('debe rechazar la actualización si el registro se cerró en paralelo', async () => {
      attendanceRecordRepositoryMock.findByIdAndEmployee.mockResolvedValue(
        crearRegistro({ check_out: null }),
      );
      attendanceRecordRepositoryMock.updateCheckOutIfIncomplete.mockResolvedValue(
        false,
      );
      await expect(
        service.actualizarHoraSalida(15, {
          empleadoId: 7,
          horaSalida: '17:30',
        }),
      ).rejects.toThrow('La asistencia ya tiene una hora de salida marcada.');
    });
  });

  // =========================================================
  // Filtros (CA01, CA02, CA04)
  // =========================================================

  describe('filtros', () => {
    it('debe consultar sin filtros la primera página de 10 resultados', async () => {
      await service.consultarHistorial({});

      expect(attendanceRecordRepositoryMock.findHistory).toHaveBeenCalledWith({
        empleadoId: undefined,
        desde: undefined,
        hasta: undefined,
        pagina: 1,
        porPagina: 10,
      });
    });

    it('debe filtrar por empleado', async () => {
      await service.consultarHistorial({ empleadoId: 7 });

      expect(attendanceRecordRepositoryMock.findHistory).toHaveBeenCalledWith(
        expect.objectContaining({ empleadoId: 7 }),
      );
    });

    it('debe convertir el rango de fechas a los límites del día en Colombia', async () => {
      await service.consultarHistorial({
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
      });

      expect(attendanceRecordRepositoryMock.findHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          desde: new Date('2026-09-01T05:00:00.000Z'),
          // Límite exclusivo: incluye todo el 30 de septiembre.
          hasta: new Date('2026-10-01T05:00:00.000Z'),
        }),
      );
    });

    it.each([
      [AttendanceRecordStatus.COMPLETO],
      [AttendanceRecordStatus.INCOMPLETO],
    ])('debe filtrar por el estado %s', async (estado) => {
      await service.consultarHistorial({ estado });

      expect(attendanceRecordRepositoryMock.findHistory).toHaveBeenCalledWith(
        expect.objectContaining({ estado }),
      );
    });

    it('debe combinar el empleado, el rango de fechas, el estado y la paginación', async () => {
      await service.consultarHistorial({
        empleadoId: 7,
        fechaDesde: '2026-09-15',
        fechaHasta: '2026-09-15',
        estado: AttendanceRecordStatus.INCOMPLETO,
        pagina: 3,
        porPagina: 25,
      });

      expect(attendanceRecordRepositoryMock.findHistory).toHaveBeenCalledWith({
        empleadoId: 7,
        desde: new Date('2026-09-15T05:00:00.000Z'),
        hasta: new Date('2026-09-16T05:00:00.000Z'),
        estado: AttendanceRecordStatus.INCOMPLETO,
        pagina: 3,
        porPagina: 25,
      });
    });
  });

  // =========================================================
  // Validación del rango de fechas (CA02, CA03)
  // =========================================================

  describe('validación del rango de fechas', () => {
    it('debe rechazar una fecha inicial posterior a la fecha final', async () => {
      const consulta = service.consultarHistorial({
        fechaDesde: '2026-09-30',
        fechaHasta: '2026-09-01',
      });

      await expect(consulta).rejects.toBeInstanceOf(BadRequestException);
      await expect(consulta).rejects.toThrow(
        'El rango de fechas seleccionado no es válido: la fecha inicial no puede ser posterior a la fecha final.',
      );

      expect(attendanceRecordRepositoryMock.findHistory).not.toHaveBeenCalled();
      expect(auditPortMock.log).not.toHaveBeenCalled();
    });

    it('debe rechazar una fecha inicial anterior al 1 de enero de 1900', async () => {
      await expect(
        service.consultarHistorial({ fechaDesde: '1899-12-31' }),
      ).rejects.toThrow(
        'La fecha inicial no puede ser anterior al 1 de enero de 1900.',
      );

      expect(attendanceRecordRepositoryMock.findHistory).not.toHaveBeenCalled();
    });

    it('debe aceptar el 1 de enero de 1900 como fecha inicial', async () => {
      await expect(
        service.consultarHistorial({ fechaDesde: '1900-01-01' }),
      ).resolves.toBeDefined();
    });

    it('debe rechazar una fecha final posterior a la fecha actual', async () => {
      await expect(
        service.consultarHistorial({ fechaHasta: '2026-10-05' }),
      ).rejects.toThrow(
        'La fecha final no puede ser posterior a la fecha actual.',
      );

      expect(attendanceRecordRepositoryMock.findHistory).not.toHaveBeenCalled();
    });

    it('debe aceptar la fecha actual como fecha final', async () => {
      await expect(
        service.consultarHistorial({ fechaHasta: '2026-10-04' }),
      ).resolves.toBeDefined();
    });

    it('debe tomar la fecha actual de Colombia y no la del servidor en UTC', async () => {
      // 10:00 p. m. del 4 de octubre en Colombia; en UTC ya es 5 de octubre.
      jest.setSystemTime(new Date('2026-10-05T03:00:00.000Z'));

      await expect(
        service.consultarHistorial({ fechaHasta: '2026-10-05' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.consultarHistorial({ fechaHasta: '2026-10-04' }),
      ).resolves.toBeDefined();
    });
  });

  // =========================================================
  // Resultados (CA05, CA06, CA07, CA09, CA10)
  // =========================================================

  describe('resultados', () => {
    it('debe retornar la información de cada marcación con las horas trabajadas', async () => {
      const registro = crearRegistro({
        id: 15,
        check_in: new Date('2026-09-15T13:00:00.000Z'),
        check_out: new Date('2026-09-15T21:30:00.000Z'),
      });

      attendanceRecordRepositoryMock.findHistory.mockResolvedValue({
        records: [registro],
        total: 1,
      });

      const resultado = await service.consultarHistorial({ empleadoId: 7 });

      expect(resultado.data).toEqual([
        {
          id: 15,
          employee: {
            id: 7,
            firstName: 'María',
            lastName: 'Pérez',
            documentType: 'CC',
            document: '123456789',
          },
          branchId: 1,
          branchName: 'Sucursal Centro',
          checkIn: new Date('2026-09-15T13:00:00.000Z'),
          checkOut: new Date('2026-09-15T21:30:00.000Z'),
          workedMinutes: 510,
          status: AttendanceRecordStatus.COMPLETO,
        },
      ]);
    });

    it('debe identificar el registro sin salida como incompleto y no calcular sus horas', async () => {
      attendanceRecordRepositoryMock.findHistory.mockResolvedValue({
        records: [crearRegistro({ check_out: null, work_minutes: 0 })],
        total: 1,
      });

      const resultado = await service.consultarHistorial({});

      expect(resultado.data[0].status).toBe(AttendanceRecordStatus.INCOMPLETO);
      expect(resultado.data[0].checkOut).toBeNull();
      expect(resultado.data[0].workedMinutes).toBeNull();
    });

    it('debe retornar la sucursal como null cuando el registro no la tiene', async () => {
      const registro = crearRegistro({});
      registro.branch = undefined as unknown as Branch;

      attendanceRecordRepositoryMock.findHistory.mockResolvedValue({
        records: [registro],
        total: 1,
      });

      const resultado = await service.consultarHistorial({});

      expect(resultado.data[0].branchId).toBeNull();
      expect(resultado.data[0].branchName).toBeNull();
    });

    it('debe conservar el orden cronológico entregado por el repositorio', async () => {
      attendanceRecordRepositoryMock.findHistory.mockResolvedValue({
        records: [
          crearRegistro({ id: 1 }),
          crearRegistro({ id: 2 }),
          crearRegistro({ id: 3 }),
        ],
        total: 3,
      });

      const resultado = await service.consultarHistorial({});

      expect(resultado.data.map((registro) => registro.id)).toEqual([1, 2, 3]);
    });

    it('debe retornar los datos de paginación', async () => {
      attendanceRecordRepositoryMock.findHistory.mockResolvedValue({
        records: [crearRegistro({})],
        total: 57,
      });

      const resultado = await service.consultarHistorial({
        pagina: 2,
        porPagina: 25,
      });

      expect(resultado.total).toBe(57);
      expect(resultado.pagina).toBe(2);
      expect(resultado.porPagina).toBe(25);
      expect(resultado.totalPaginas).toBe(3);
    });

    it('debe retornar una página vacía cuando no existen marcaciones', async () => {
      const resultado = await service.consultarHistorial({ empleadoId: 99 });

      expect(resultado).toEqual({
        data: [],
        total: 0,
        pagina: 1,
        porPagina: 10,
        totalPaginas: 0,
      });
    });
  });

  // =========================================================
  // Auditoría
  // =========================================================

  describe('auditoría', () => {
    it('debe registrar la consulta exitosa con los filtros y el total', async () => {
      attendanceRecordRepositoryMock.findHistory.mockResolvedValue({
        records: [crearRegistro({})],
        total: 1,
      });

      await service.consultarHistorial({
        empleadoId: 7,
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
        estado: AttendanceRecordStatus.INCOMPLETO,
      });

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith({
        action: 'ATTENDANCE_HISTORY_CONSULTED',
        module: 'Asistencia',
        resource: 'AttendanceRecord',
        result: 'SUCCESS',
        message: 'Se consultó el historial de asistencia.',
        metadata: {
          empleadoId: 7,
          fechaDesde: '2026-09-01',
          fechaHasta: '2026-09-30',
          estado: 'INCOMPLETO',
          pagina: 1,
          porPagina: 10,
          total: 1,
        },
      });
    });

    it('debe registrar el fallo y propagar el error del repositorio', async () => {
      const error = new Error('Conexión perdida');
      attendanceRecordRepositoryMock.findHistory.mockRejectedValue(error);

      await expect(service.consultarHistorial({ empleadoId: 7 })).rejects.toBe(
        error,
      );

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_HISTORY_CONSULT_FAILED',
          module: 'Asistencia',
          resource: 'AttendanceRecord',
          result: 'FAILED',
          metadata: expect.objectContaining({
            empleadoId: 7,
            error: 'Conexión perdida',
          }),
        }),
      );
    });

    it('debe registrar el fallo cuando el error no es una instancia de Error', async () => {
      attendanceRecordRepositoryMock.findHistory.mockRejectedValue('timeout');

      await expect(service.consultarHistorial({})).rejects.toBe('timeout');

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'FAILED',
          metadata: expect.objectContaining({ error: 'timeout' }),
        }),
      );
    });
  });
});

function crearRegistro(datos: Partial<AttendanceRecord>): AttendanceRecord {
  const employee = Object.assign(new Employee(), {
    id: 7,
    firstName: 'María',
    lastName: 'Pérez',
    document_type: 'CC',
    document: '123456789',
  });

  const branch = Object.assign(new Branch(), {
    id: 1,
    name: 'Sucursal Centro',
  });

  return Object.assign(new AttendanceRecord(), {
    id: 1,
    check_in: new Date('2026-09-15T13:00:00.000Z'),
    check_out: new Date('2026-09-15T21:00:00.000Z'),
    work_minutes: 480,
    employee,
    branch,
    ...datos,
  });
}
