import { Test, TestingModule } from '@nestjs/testing';

import { AttendanceTodayService } from './attendance-today.service';

import { ATTENDANCE_RECORD_REPOSITORY_PORT } from '../../domain/ports/attendance-record.repository.port';
import { AttendanceTodayStatus } from '../../domain/value-objects/attendance-today-status.enum';

import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';

import {
  AttendanceRecord,
  Branch,
  Employee,
  EmployeeBranchAssignment,
  Position,
} from 'src/entities';

import { EMPLOYEE_REPOSITORY_PORT } from 'src/modules/empleados/domain/ports/employee-repository.port';

describe('AttendanceTodayService', () => {
  let service: AttendanceTodayService;

  const attendanceRecordRepositoryMock: {
    findCheckInsBetween: jest.Mock;
  } = {
    findCheckInsBetween: jest.fn(),
  };

  const employeeRepositoryMock: {
    findAll: jest.Mock;
  } = {
    findAll: jest.fn(),
  };

  const auditPortMock: {
    log: jest.Mock;
  } = {
    log: jest.fn(),
  };

  const centro = crearSucursal(1, 'Sucursal Centro');
  const norte = crearSucursal(2, 'Sucursal Norte');

  const ana = crearEmpleado({ id: 1, firstName: 'Ana', lastName: 'Ruiz' });
  const luis = crearEmpleado({ id: 2, firstName: 'Luis', lastName: 'Gómez' });
  const marta = crearEmpleado({ id: 3, firstName: 'Marta', lastName: 'Díaz' });

  beforeEach(async () => {
    // 4 de octubre de 2026, 10:00 a. m. en Colombia.
    jest.useFakeTimers({
      now: new Date('2026-10-04T15:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    employeeRepositoryMock.findAll.mockResolvedValue([ana, luis, marta]);
    attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceTodayService,
        {
          provide: ATTENDANCE_RECORD_REPOSITORY_PORT,
          useValue: attendanceRecordRepositoryMock,
        },
        {
          provide: EMPLOYEE_REPOSITORY_PORT,
          useValue: employeeRepositoryMock,
        },
        {
          provide: AUDIT_PORT,
          useValue: auditPortMock,
        },
      ],
    }).compile();

    service = module.get<AttendanceTodayService>(AttendanceTodayService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // Reglas de negocio: día actual y empleados activos
  // =========================================================

  describe('alcance de la consulta', () => {
    it('debe consultar únicamente las marcaciones del día actual', async () => {
      await service.consultarAsistenciaHoy();

      expect(
        attendanceRecordRepositoryMock.findCheckInsBetween,
      ).toHaveBeenCalledWith(
        new Date('2026-10-04T05:00:00.000Z'),
        new Date('2026-10-05T05:00:00.000Z'),
      );
    });

    it('debe tomar el día de Colombia y no el del servidor en UTC', async () => {
      // 10:00 p. m. del 4 de octubre en Colombia; en UTC ya es 5 de octubre.
      jest.setSystemTime(new Date('2026-10-05T03:00:00.000Z'));

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.fecha).toBe('2026-10-04');
      expect(
        attendanceRecordRepositoryMock.findCheckInsBetween,
      ).toHaveBeenCalledWith(
        new Date('2026-10-04T05:00:00.000Z'),
        new Date('2026-10-05T05:00:00.000Z'),
      );
    });

    it('debe considerar solo a los empleados activos', async () => {
      await service.consultarAsistenciaHoy();

      expect(employeeRepositoryMock.findAll).toHaveBeenCalledWith({
        status: 'ACTIVO',
      });
    });

    it('debe ignorar las marcaciones de empleados que no están activos', async () => {
      const inactivo = crearEmpleado({ id: 9, firstName: 'Julio' });

      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        crearRegistro(inactivo, '2026-10-04T13:00:00.000Z'),
      ]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.presentes).toBe(0);
      expect(resultado.data.map((empleado) => empleado.employeeId)).toEqual([
        1, 2, 3,
      ]);
    });
  });

  // =========================================================
  // CA01 – Información de la vista
  // =========================================================

  describe('información de la asistencia', () => {
    it('debe retornar la fecha, las cantidades y la hora de actualización', async () => {
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        crearRegistro(ana, '2026-10-04T13:00:00.000Z', centro),
        crearRegistro(luis, '2026-10-04T13:30:00.000Z', norte),
      ]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.fecha).toBe('2026-10-04');
      expect(resultado.actualizadoEn).toEqual(
        new Date('2026-10-04T15:00:00.000Z'),
      );
      expect(resultado.totalEmpleados).toBe(3);
      expect(resultado.presentes).toBe(2);
      expect(resultado.ausentes).toBe(1);
    });

    it('debe retornar el nombre, cargo, sucursal, hora de entrada y estado del empleado', async () => {
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        crearRegistro(ana, '2026-10-04T13:00:00.000Z', norte),
      ]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.data[0]).toEqual({
        employeeId: 1,
        firstName: 'Ana',
        lastName: 'Ruiz',
        positionName: 'Mesero',
        // Sucursal donde se registró la entrada, no la asignada.
        branchName: 'Sucursal Norte',
        checkIn: new Date('2026-10-04T13:00:00.000Z'),
        status: AttendanceTodayStatus.PRESENTE,
      });
    });

    it('debe usar la sucursal asignada cuando la marcación no tiene sucursal', async () => {
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        crearRegistro(ana, '2026-10-04T13:00:00.000Z'),
      ]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.data[0].branchName).toBe('Sucursal Centro');
    });

    it('debe usar el cargo guardado como texto cuando no hay cargo del catálogo', async () => {
      const sinCatalogo = crearEmpleado({ id: 4, firstName: 'Zoe' });
      sinCatalogo.jobPosition = null;
      sinCatalogo.position = 'Cajera';

      employeeRepositoryMock.findAll.mockResolvedValue([sinCatalogo]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.data[0].positionName).toBe('Cajera');
    });

    it('debe retornar la sucursal como null cuando el empleado no tiene ninguna', async () => {
      const sinSucursal = crearEmpleado({ id: 5, firstName: 'Iván' });
      sinSucursal.employee_branch_assig = [];

      employeeRepositoryMock.findAll.mockResolvedValue([sinSucursal]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.data[0].branchName).toBeNull();
    });
  });

  // =========================================================
  // CA02 / CA03 – Estado de asistencia
  // =========================================================

  describe('estado de asistencia', () => {
    it('debe marcar como presente a quien registró una entrada hoy', async () => {
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        crearRegistro(luis, '2026-10-04T13:30:00.000Z', centro),
      ]);

      const resultado = await service.consultarAsistenciaHoy();
      const empleado = resultado.data.find((e) => e.employeeId === 2);

      expect(empleado?.status).toBe(AttendanceTodayStatus.PRESENTE);
    });

    it('debe marcar como ausente y sin hora de entrada a quien no ha registrado entrada', async () => {
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        crearRegistro(luis, '2026-10-04T13:30:00.000Z', centro),
      ]);

      const resultado = await service.consultarAsistenciaHoy();
      const ausentes = resultado.data.filter(
        (e) => e.status === AttendanceTodayStatus.AUSENTE,
      );

      expect(ausentes.map((e) => e.employeeId)).toEqual([1, 3]);
      expect(ausentes.every((e) => e.checkIn === null)).toBe(true);
      // El ausente conserva su sucursal asignada.
      expect(ausentes[0].branchName).toBe('Sucursal Centro');
    });

    it('debe seguir presente quien ya registró la salida', async () => {
      const registro = crearRegistro(ana, '2026-10-04T13:00:00.000Z', centro);
      registro.check_out = new Date('2026-10-04T14:30:00.000Z');

      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        registro,
      ]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.data[0].status).toBe(AttendanceTodayStatus.PRESENTE);
    });
  });

  // =========================================================
  // CA04 – Primera entrada del día
  // =========================================================

  describe('hora de entrada', () => {
    it('debe mostrar la primera entrada cuando el empleado tiene varias en el día', async () => {
      // El repositorio entrega los registros ordenados por hora de entrada.
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        crearRegistro(ana, '2026-10-04T13:00:00.000Z', centro),
        crearRegistro(ana, '2026-10-04T19:00:00.000Z', norte),
      ]);

      const resultado = await service.consultarAsistenciaHoy();
      const empleado = resultado.data.find((e) => e.employeeId === 1);

      expect(empleado?.checkIn).toEqual(new Date('2026-10-04T13:00:00.000Z'));
      expect(empleado?.branchName).toBe('Sucursal Centro');
      expect(resultado.presentes).toBe(1);
    });
  });

  // =========================================================
  // CA10 – Orden de la lista
  // =========================================================

  describe('orden', () => {
    it('debe listar primero los presentes de la entrada más reciente a la más antigua y luego los ausentes por nombre', async () => {
      const carlos = crearEmpleado({ id: 6, firstName: 'Carlos' });
      const beatriz = crearEmpleado({ id: 7, firstName: 'Beatriz' });

      employeeRepositoryMock.findAll.mockResolvedValue([
        carlos,
        ana,
        beatriz,
        luis,
      ]);
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([
        crearRegistro(luis, '2026-10-04T12:45:00.000Z', centro),
        crearRegistro(ana, '2026-10-04T13:00:00.000Z', centro),
      ]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.data.map((e) => e.firstName)).toEqual([
        'Ana',
        'Luis',
        'Beatriz',
        'Carlos',
      ]);
    });
  });

  // =========================================================
  // CA08 – Sin entradas en el día
  // =========================================================

  describe('sin entradas', () => {
    it('debe retornar cero presentes cuando nadie ha registrado entrada', async () => {
      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado.presentes).toBe(0);
      expect(resultado.ausentes).toBe(3);
      expect(
        resultado.data.every((e) => e.status === AttendanceTodayStatus.AUSENTE),
      ).toBe(true);
    });

    it('debe retornar la lista vacía cuando no hay empleados activos', async () => {
      employeeRepositoryMock.findAll.mockResolvedValue([]);

      const resultado = await service.consultarAsistenciaHoy();

      expect(resultado).toEqual({
        fecha: '2026-10-04',
        actualizadoEn: new Date('2026-10-04T15:00:00.000Z'),
        totalEmpleados: 0,
        presentes: 0,
        ausentes: 0,
        data: [],
      });
    });
  });

  // =========================================================
  // Auditoría
  // =========================================================

  describe('auditoría', () => {
    it('no debe auditar las consultas exitosas, que se repiten con cada actualización automática', async () => {
      await service.consultarAsistenciaHoy();

      expect(auditPortMock.log).not.toHaveBeenCalled();
    });

    it('debe registrar el fallo y propagar el error', async () => {
      const error = new Error('Conexión perdida');
      attendanceRecordRepositoryMock.findCheckInsBetween.mockRejectedValue(
        error,
      );

      await expect(service.consultarAsistenciaHoy()).rejects.toBe(error);

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith({
        action: 'ATTENDANCE_TODAY_CONSULT_FAILED',
        module: 'Asistencia',
        resource: 'AttendanceRecord',
        result: 'FAILED',
        message: 'Falló la consulta de la asistencia del día.',
        metadata: {
          fecha: '2026-10-04',
          error: 'Conexión perdida',
        },
      });
    });

    it('debe registrar el fallo cuando el error no es una instancia de Error', async () => {
      employeeRepositoryMock.findAll.mockRejectedValue('timeout');

      await expect(service.consultarAsistenciaHoy()).rejects.toBe('timeout');

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'FAILED',
          metadata: expect.objectContaining({ error: 'timeout' }),
        }),
      );
    });
  });

  function crearSucursal(id: number, name: string): Branch {
    return Object.assign(new Branch(), { id, name });
  }

  function crearEmpleado(datos: Partial<Employee>): Employee {
    const asignacion = Object.assign(new EmployeeBranchAssignment(), {
      is_current: true,
      branch: centro,
    });

    return Object.assign(new Employee(), {
      lastName: 'Prueba',
      position: 'Mesero',
      status: 'ACTIVO',
      jobPosition: Object.assign(new Position(), { id: 1, name: 'Mesero' }),
      employee_branch_assig: [asignacion],
      ...datos,
    });
  }

  function crearRegistro(
    employee: Employee,
    entrada: string,
    branch?: Branch,
  ): AttendanceRecord {
    return Object.assign(new AttendanceRecord(), {
      check_in: new Date(entrada),
      check_out: null,
      employee,
      branch,
    });
  }
});
