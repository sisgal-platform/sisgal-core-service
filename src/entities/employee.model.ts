import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Position } from './position.model';
import { EmployeeBranchAssignment } from './employee-branch-assignment.model';
import { PayrollPeriod } from './payroll-period.model';
import { DisabilityLeave } from './disability_leave.model';
import { AttendanceRecord } from './attendance-record.model';
import { AttendanceLog } from './attendance-log.model';
import { WorkdayConfig } from './workday-config.model';
import { EmployeeLoan } from './employee_loan.model';

@Entity()
export class Employee {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 40, nullable: false })
  firstName!: string;

  @Column('varchar', { length: 40, nullable: false })
  lastName!: string;

  @Column('varchar', { length: 40, unique: true, nullable: false })
  document!: string;

  @Column('varchar', { length: 40, nullable: false })
  document_type!: string;

  @Column('varchar', { length: 20, nullable: false })
  phone!: string;

  @Column('decimal', { precision: 13, scale: 2, nullable: false })
  salary_base!: number;

  /**
   * Fecha de ingreso (YYYY-MM-DD). Define el tiempo trabajado para la prima de
   * servicios; los empleados registrados antes de la HU16 no la tienen.
   */
  @Column('date', { nullable: true })
  hire_date!: string | null;

  /**
   * Nombre del cargo al momento del registro. Se conserva como texto para no
   * alterar la información histórica cuando el cargo del catálogo cambia.
   */
  @Column('varchar', { length: 40, nullable: false })
  position!: string;

  @ManyToOne(() => Position, (position) => position.employees, {
    nullable: true,
  })
  @JoinColumn({ name: 'position_id' })
  jobPosition?: Position | null;

  @Column('varchar', { length: 40, nullable: false })
  status!: string;

  // Historial de sedes del empleado; cascade insert crea la asignación junto con el
  // empleado, y cascade update permite cerrar (is_current/end_date) la asignación
  // vigente al reasignar de sucursal sin tener que guardarla aparte.
  @OneToMany(
    () => EmployeeBranchAssignment,
    (employee_branch_assig) => employee_branch_assig.employee,
    { cascade: ['insert', 'update'] },
  )
  employee_branch_assig!: EmployeeBranchAssignment[];

  @OneToMany(() => PayrollPeriod, (payroll_period) => payroll_period.employee)
  payroll_periods!: PayrollPeriod[];

  @OneToMany(
    () => DisabilityLeave,
    (disability_leave) => disability_leave.employee,
  )
  disability_leaves!: DisabilityLeave[];

  @OneToMany(
    () => AttendanceRecord,
    (attendance_record) => attendance_record.employee,
  )
  attendance_records!: AttendanceRecord[];

  @OneToMany(() => AttendanceLog, (attendanceLog) => attendanceLog.employee)
  attendanceLogs!: AttendanceLog[];

  @OneToMany(() => EmployeeLoan, (loan) => loan.employee)
  loans?: EmployeeLoan[];
}
