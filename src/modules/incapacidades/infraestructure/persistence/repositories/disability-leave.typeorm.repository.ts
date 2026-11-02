import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from 'typeorm';
import { DisabilityLeave } from "src/entities/disability_leave.model";
import {
    DisabilityLeaveRepositoryPort,
    DisabilityLeaveListFilters,
} from "src/modules/incapacidades/domain/ports/disability-leave-repository.port";

@Injectable()
export class DisabilityLeaveTypeOrmRepository implements DisabilityLeaveRepositoryPort {
    constructor(
        @InjectRepository(DisabilityLeave)
        private readonly repository: Repository<DisabilityLeave>,
    ) {}

    async save(disabilityLeave: DisabilityLeave): Promise<DisabilityLeave> {
        return this.repository.save(disabilityLeave);
    }

    async findAll(filters: DisabilityLeaveListFilters): Promise<DisabilityLeave[]> {
        const queryBuilder = this.repository
            .createQueryBuilder('disabilityLeave')
            .leftJoinAndSelect('disabilityLeave.employee', 'employee')
            .leftJoinAndSelect('employee.jobPosition', 'jobPosition')
            .orderBy('disabilityLeave.start_date', 'DESC')
            .addOrderBy('disabilityLeave.id', 'DESC');

        if (filters.employeeId) {
            queryBuilder.andWhere('employee.id = :employeeId', { employeeId: filters.employeeId });
        }
        if (filters.employeeName) {
            queryBuilder.andWhere(
                "CONCAT(employee.\"firstName\", ' ', employee.\"lastName\") ILIKE :employeeName",
                { employeeName: `%${filters.employeeName}%` },
            );
        }
        if (filters.document) {
            queryBuilder.andWhere('employee.document = :document', { document: filters.document });
        }
        if (filters.positionId) {
            queryBuilder.andWhere('jobPosition.id = :positionId', { positionId: filters.positionId });
        }
        if (filters.status === 'Activo') {
            queryBuilder.andWhere('disabilityLeave.end_date >= CURRENT_DATE');
        }
        if (filters.status === 'Finalizado') {
            queryBuilder.andWhere('disabilityLeave.end_date < CURRENT_DATE');
        }
        // El rango de fechas filtra por la fecha de inicio de la incapacidad
        // (criterio documentado en la HU, no por traslape de período)
        if (filters.startDate) {
            queryBuilder.andWhere('disabilityLeave.start_date >= :startDate', { startDate: filters.startDate });
        }
        if (filters.endDate) {
            queryBuilder.andWhere('disabilityLeave.start_date <= :endDate', { endDate: filters.endDate });
        }

        return queryBuilder.getMany();
    }

    // Dos períodos se cruzan si uno empieza antes de que el otro termine y
    // termina después de que el otro empiece (comparación estándar de rangos)
    async findOverlapping(
        employeeId: number,
        startDate: string,
        endDate: string,
    ): Promise<DisabilityLeave[]> {
        return this.repository
            .createQueryBuilder('disabilityLeave')
            .innerJoin('disabilityLeave.employee', 'employee')
            .where('employee.id = :employeeId', { employeeId })
            .andWhere('disabilityLeave.start_date <= :endDate', { endDate })
            .andWhere('disabilityLeave.end_date >= :startDate', { startDate })
            .getMany();
    }

}
