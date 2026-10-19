import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Employee } from './employee.model';
import { LoanPeriodicity } from 'src/modules/loans/enums/loan-periodicity.enum';
import { LoanStatus } from 'src/modules/loans/enums/loan-status.enum';

@Entity('employee_loans')
export class EmployeeLoan {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Employee, (employee) => employee.loans, {
    nullable: false,
  })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({
    name: 'employee_id',
    type: 'bigint',
  })
  employeeId!: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 15,
    scale: 2,
  })
  totalAmount!: number;

  @Column({
    name: 'installment_amount',
    type: 'numeric',
    precision: 15,
    scale: 2,
  })
  installmentAmount!: number;

  @Column({
    name: 'total_installments',
    type: 'integer',
  })
  totalInstallments!: number;

  @Column({
    name: 'pending_installments',
    type: 'integer',
  })
  pendingInstallments!: number;

  @Column({
    name: 'outstanding_balance',
    type: 'numeric',
    precision: 15,
    scale: 2,
  })
  outstandingBalance!: number;

  @Column({
    name: 'granted_at',
    type: 'date',
  })
  grantedAt!: Date;

  /** Cada cuánto se descuenta una cuota en la liquidación. */
  @Column({
    type: 'varchar',
    length: 20,
    default: LoanPeriodicity.MENSUAL,
  })
  periodicity!: LoanPeriodicity;

  @Column({
    type: 'enum',
    enum: LoanStatus,
    default: LoanStatus.ACTIVO,
  })
  status!: LoanStatus;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;
}