import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Employee } from './employee.model';
import { Branch } from './branch.model';

@Entity()
export class EmployeeBranchAssignment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('date')
  start_date!: Date;

  // null indica asignación vigente (aún sin fecha de fin)
  @Column('date', { nullable: true })
  end_date!: Date | null;


  @Column('boolean')
  is_current!: boolean;

  @ManyToOne(() => Employee, (employee) => employee.employee_branch_assig) // relacion hacia la tabla EMPLOYEE
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @ManyToOne(() => Branch, (branch) => branch.employeeAssignments) // relacion hacia la tabla BRANCH
  @JoinColumn({ name: 'branch_id' })
  branch!: Branch;
}
