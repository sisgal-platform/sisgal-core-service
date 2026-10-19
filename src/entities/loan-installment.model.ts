import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { Employee } from './employee.model';
import { EmployeeLoan } from './employee_loan.model';
import { PayrollLine } from './payroll_line.model';
import { PayrollPeriod } from './payroll-period.model';

/**
 * Cuota de un préstamo descontada en una liquidación. Conserva el saldo y
 * las cuotas pendientes antes y después del descuento para la trazabilidad;
 * un préstamo solo puede tener una cuota por liquidación.
 */
@Entity('loan_installment')
@Unique('UQ_loan_installment_loan_payroll_period', [
  'loanId',
  'payrollPeriodId',
])
export class LoanInstallment {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => EmployeeLoan, { nullable: false })
  @JoinColumn({ name: 'loan_id' })
  loan!: EmployeeLoan;

  @Column({ name: 'loan_id', type: 'integer' })
  loanId!: number;

  @ManyToOne(() => Employee, { nullable: false })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'employee_id', type: 'integer' })
  employeeId!: number;

  @ManyToOne(
    () => PayrollPeriod,
    (payrollPeriod) => payrollPeriod.loan_installments,
    { nullable: false },
  )
  @JoinColumn({ name: 'payroll_period_id' })
  payrollPeriod!: PayrollPeriod;

  @Column({ name: 'payroll_period_id', type: 'integer' })
  payrollPeriodId!: number;

  /** Concepto de la liquidación que muestra el descuento. */
  @ManyToOne(() => PayrollLine, { nullable: false })
  @JoinColumn({ name: 'payroll_line_id' })
  payrollLine!: PayrollLine;

  @Column({ name: 'payroll_line_id', type: 'integer' })
  payrollLineId!: number;

  /** Cuotas que cubre el descuento: una por cada fecha de corte del período. */
  @Column({ name: 'installments_applied', type: 'integer' })
  installmentsApplied!: number;

  /** Lo que correspondía descontar antes de aplicar el límite de deducciones. */
  @Column({
    name: 'scheduled_amount',
    type: 'numeric',
    precision: 15,
    scale: 2,
  })
  scheduledAmount!: number;

  /** Valor efectivamente descontado. */
  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: number;

  @Column({
    name: 'previous_balance',
    type: 'numeric',
    precision: 15,
    scale: 2,
  })
  previousBalance!: number;

  @Column({ name: 'new_balance', type: 'numeric', precision: 15, scale: 2 })
  newBalance!: number;

  @Column({ name: 'previous_pending_installments', type: 'integer' })
  previousPendingInstallments!: number;

  @Column({ name: 'remaining_installments', type: 'integer' })
  remainingInstallments!: number;

  @CreateDateColumn({ name: 'applied_at', type: 'timestamptz' })
  appliedAt!: Date;
}
