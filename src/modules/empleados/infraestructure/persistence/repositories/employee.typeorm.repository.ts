import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from 'typeorm';
import { Employee } from "src/entities/employee.model";
import { AttendanceRecord } from "src/entities/attendance-record.model";
import { PayrollPeriod } from "src/entities/payroll-period.model";
import { DisabilityLeave } from "src/entities/disability_leave.model";
import { EmployeeRepositoryPort, EmployeeListFilters } from "src/modules/empleados/domain/ports/employee-repository.port";

@Injectable()
export class EmployeeTypeOrmRepository implements EmployeeRepositoryPort {
    constructor(
        @InjectRepository(Employee)
        private readonly repository: Repository<Employee>,

        @InjectRepository(AttendanceRecord)
        private readonly attendanceRecordRepository: Repository<AttendanceRecord>,

        @InjectRepository(PayrollPeriod)
        private readonly payrollPeriodRepository: Repository<PayrollPeriod>,

        @InjectRepository(DisabilityLeave)
        private readonly disabilityLeaveRepository: Repository<DisabilityLeave>,
    ) {}


    async save(employee: Employee): Promise<Employee> {
       return this.repository.save(employee);
    }


    async findByDocument(document: string): Promise<Employee | null> {
        return this.repository.findOne({where: {document} });
    }

    async findById(id: number): Promise<Employee | null> {
        return this.repository.findOne({
            where: { id },
            relations: {
                jobPosition: true,
                employee_branch_assig: { branch: true },
            },
        });
    }

    async findAll(filters: EmployeeListFilters): Promise<Employee[]> {
        const queryBuilder = this.repository
            .createQueryBuilder('employee')
            .leftJoinAndSelect('employee.jobPosition', 'jobPosition')
            .leftJoinAndSelect(
                'employee.employee_branch_assig',
                'currentAssignment',
                'currentAssignment.is_current = true',
            )
            .leftJoinAndSelect('currentAssignment.branch', 'branch')
            .orderBy('employee.id', 'ASC');

        if (filters.search) {
            queryBuilder.andWhere(
                '(employee."firstName" ILIKE :search OR employee."lastName" ILIKE :search OR employee.document ILIKE :search)',
                { search: `%${filters.search}%` },
            );
        }
        if (filters.branchId) {
            queryBuilder.andWhere('branch.id = :branchId', { branchId: filters.branchId });
        }
        if (filters.positionId) {
            queryBuilder.andWhere('jobPosition.id = :positionId', { positionId: filters.positionId });
        }
        if (filters.status) {
            queryBuilder.andWhere('employee.status = :status', { status: filters.status });
        }

        return queryBuilder.getMany();
    }

    async deactivate(id: number): Promise<void> {
        await this.repository.update({ id }, { status: 'INACTIVO' });
    }

    // Verifica si el empleado tiene registros de asistencia, nómina o
    // incapacidades asociados; si tiene alguno, no se le permite desactivar.
    async hasHistoricalRecords(id: number): Promise<boolean> {
        const [asistencias, nominas, incapacidades] = await Promise.all([
            this.attendanceRecordRepository.count({ where: { employee: { id } } }),
            this.payrollPeriodRepository.count({ where: { employee: { id } } }),
            this.disabilityLeaveRepository.count({ where: { employee: { id } } }),
        ]);

        return asistencias > 0 || nominas > 0 || incapacidades > 0;
    }
}