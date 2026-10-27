import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AttendanceRecordLog } from './attendance-record-log.model';
import { Employee } from './employee.model';
import { BiometricDevice } from './biometric-device.model';

@Entity()
export class AttendanceLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('timestamp')
  event_time!: Date;

  // ENTRADA o SALIDA.
  @Column('varchar', { length: 40, nullable: false })
  event_type!: string;

  // Método con el que se marcó: HUELLA o QR.
  @Column('varchar', { length: 20, nullable: false })
  auth_method!: string;

  // Tiene índice único: un reintento con la misma clave no duplica la marcación.
  @Column('varchar', { length: 40, nullable: false })
  idempotency_key!: string;

  @ManyToOne(() => Employee, (employee) => employee.attendanceLogs)
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  // null en las marcaciones del lector simulado, que no es un dispositivo registrado.
  @ManyToOne(() => BiometricDevice, (device) => device.attendanceLogs, {
    nullable: true,
  })
  @JoinColumn({ name: 'device_id' })
  biometricDevice!: BiometricDevice | null;

  @OneToMany(() => AttendanceRecordLog, (attendanceRecordLog) => attendanceRecordLog.attendanceLog)
  attendanceRecordLogs!: AttendanceRecordLog[];
}
