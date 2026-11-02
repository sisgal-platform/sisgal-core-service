import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import { AttendanceRecord } from 'src/entities';
import {
  EMPLOYEE_REPOSITORY_PORT,
  type EmployeeRepositoryPort,
} from 'src/modules/empleados/domain/ports/employee-repository.port';
import {
  fechaActual,
  inicioDelDia,
  inicioDelDiaSiguiente,
} from '../../domain/business-day';
import {
  ATTENDANCE_RECORD_REPOSITORY_PORT,
  type AttendanceRecordRepositoryPort,
} from '../../domain/ports/attendance-record.repository.port';
import { AttendanceTodayStatus } from '../../domain/value-objects/attendance-today-status.enum';
import {
  AttendanceTodayEmployeeDto,
  AttendanceTodayResponseDto,
} from '../../infrastructure/http/dtos';

@Injectable()
export class AttendanceTodayService {
  constructor(
    @Inject(ATTENDANCE_RECORD_REPOSITORY_PORT)
    private readonly attendanceRecordRepository: AttendanceRecordRepositoryPort,

    @Inject(EMPLOYEE_REPOSITORY_PORT)
    private readonly employeeRepository: EmployeeRepositoryPort,

    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
  ) {}

  async consultarAsistenciaHoy(): Promise<AttendanceTodayResponseDto> {
    const fecha = fechaActual();

    try {
      // Solo los empleados activos determinan el estado de asistencia.
      const [empleados, registros] = await Promise.all([
        this.employeeRepository.findAll({ status: 'ACTIVO' }),
        this.attendanceRecordRepository.findCheckInsBetween(
          inicioDelDia(fecha),
          inicioDelDiaSiguiente(fecha),
        ),
      ]);

      const primeraEntrada = this.primeraEntradaPorEmpleado(registros);

      const data = empleados
        .map((empleado) =>
          AttendanceTodayEmployeeDto.fromEmployee(
            empleado,
            primeraEntrada.get(empleado.id),
          ),
        )
        .sort((a, b) => this.compararEmpleados(a, b));

      const presentes = data.filter(
        (empleado) => empleado.status === AttendanceTodayStatus.PRESENTE,
      ).length;

      const respuesta = new AttendanceTodayResponseDto();
      respuesta.fecha = fecha;
      respuesta.actualizadoEn = new Date();
      respuesta.totalEmpleados = data.length;
      respuesta.presentes = presentes;
      respuesta.ausentes = data.length - presentes;
      respuesta.data = data;

      // La vista se actualiza sola cada pocos segundos: auditar cada consulta
      // exitosa llenaría el registro, así que solo se auditan los fallos.
      return respuesta;
    } catch (error) {
      this.auditPort.log({
        action: 'ATTENDANCE_TODAY_CONSULT_FAILED',
        module: 'Asistencia',
        resource: 'AttendanceRecord',
        result: 'FAILED',
        message: 'Falló la consulta de la asistencia del día.',
        metadata: {
          fecha,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /** Los registros llegan ordenados por entrada: el primero de cada empleado es su primera entrada. */
  private primeraEntradaPorEmpleado(
    registros: AttendanceRecord[],
  ): Map<number, AttendanceRecord> {
    const primeraEntrada = new Map<number, AttendanceRecord>();

    for (const registro of registros) {
      if (!primeraEntrada.has(registro.employee.id)) {
        primeraEntrada.set(registro.employee.id, registro);
      }
    }

    return primeraEntrada;
  }

  /** Primero los presentes, de la entrada más reciente a la más antigua; después los ausentes por nombre. */
  private compararEmpleados(
    a: AttendanceTodayEmployeeDto,
    b: AttendanceTodayEmployeeDto,
  ): number {
    if (a.checkIn && b.checkIn) {
      return b.checkIn.getTime() - a.checkIn.getTime();
    }

    if (a.checkIn) return -1;
    if (b.checkIn) return 1;

    return `${a.firstName} ${a.lastName}`.localeCompare(
      `${b.firstName} ${b.lastName}`,
      'es',
    );
  }
}
