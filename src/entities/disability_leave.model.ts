import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Employee } from './employee.model';

@Entity()
export class DisabilityLeave {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('date')
  start_date!: Date;

  @Column('date')
  end_date!: Date;

  @Column('int')
  total_days!: number;

  @Column('int')
  employee_days!: number;

  @Column('int')
  eps_days!: number;

  @Column('varchar', { length: 40, nullable: false })
  type!: string;

  @Column('varchar', { length: 200, nullable: true })
  other_type_description!: string | null;

  @ManyToOne(() => Employee, (employee) => employee.disability_leaves)
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;
}
