import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Employee } from './employee.model';
import { LoanInstallment } from './loan-installment.model';
import { PayrollLine } from './payroll_line.model';

@Entity()
export class PayrollPeriod {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('date')
  period_start!: Date;

  @Column('date')
  period_end!: Date;

  @Column('decimal', { precision: 12, scale: 2 })
  total_earnings!: number;

  @Column('decimal', { precision: 12, scale: 2 })
  total_deductions!: number;

  @Column('decimal', { precision: 12, scale: 2 })
  net_pay!: number;

  @Column('json')
  config_snapshot!: Record<string, unknown>;

  @ManyToOne(() => Employee, (employee) => employee.payroll_periods) // relacion hacia la tabla EMPLOYEE
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @OneToMany(() => PayrollLine, (payrollLine) => payrollLine.payroll_period, {
    cascade: ['insert'],
  })
  payroll_lines!: PayrollLine[];

  /** Cuotas de préstamos descontadas en esta liquidación. */
  @OneToMany(
    () => LoanInstallment,
    (loanInstallment) => loanInstallment.payrollPeriod,
  )
  loan_installments?: LoanInstallment[];
}
