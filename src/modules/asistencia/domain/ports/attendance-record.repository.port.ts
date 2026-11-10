import { AttendanceRecord } from 'src/entities';
import { AttendanceRecordStatus } from '../value-objects/attendance-record-status.enum';

export const ATTENDANCE_RECORD_REPOSITORY_PORT = Symbol(
  'ATTENDANCE_RECORD_REPOSITORY_PORT',
);

export interface AttendanceHistoryFilters {
  empleadoId?: number;
  /** Inicio del rango sobre la hora de entrada (inclusivo). */
  desde?: Date;
  /** Fin del rango sobre la hora de entrada (exclusivo). */
  hasta?: Date;
  estado?: AttendanceRecordStatus;
  pagina: number;
  porPagina: number;
}

export interface AttendanceHistoryPage {
  records: AttendanceRecord[];
  /** Total de registros que cumplen los filtros, sin paginar. */
  total: number;
}

export interface AttendanceRecordRepositoryPort {
  findHistory(
    filters: AttendanceHistoryFilters,
  ): Promise<AttendanceHistoryPage>;

  findByIdAndEmployee(
    id: number,
    empleadoId: number,
  ): Promise<AttendanceRecord | null>;

  updateCheckOutIfIncomplete(
    id: number,
    empleadoId: number,
    checkOut: Date,
    workMinutes: number,
  ): Promise<boolean>;

  /**
   * Registros cuya entrada está en el rango [desde, hasta), con su empleado y
   * sucursal, ordenados por hora de entrada.
   */
  findCheckInsBetween(desde: Date, hasta: Date): Promise<AttendanceRecord[]>;
}
