import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecord } from 'src/entities';
import {
  AttendanceHistoryFilters,
  AttendanceHistoryPage,
  AttendanceRecordRepositoryPort,
} from '../../../domain/ports/attendance-record.repository.port';
import { AttendanceRecordStatus } from '../../../domain/value-objects/attendance-record-status.enum';

@Injectable()
export class AttendanceRecordTypeOrmRepository implements AttendanceRecordRepositoryPort {
  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly repository: Repository<AttendanceRecord>,
  ) {}

  async findHistory(
    filters: AttendanceHistoryFilters,
  ): Promise<AttendanceHistoryPage> {
    const query = this.repository
      .createQueryBuilder('record')
      .innerJoinAndSelect('record.employee', 'employee')
      .leftJoinAndSelect('record.branch', 'branch');

    if (filters.empleadoId !== undefined) {
      query.andWhere('employee.id = :empleadoId', {
        empleadoId: filters.empleadoId,
      });
    }

    if (filters.desde !== undefined) {
      query.andWhere('record.check_in >= :desde', { desde: filters.desde });
    }

    if (filters.hasta !== undefined) {
      query.andWhere('record.check_in < :hasta', { hasta: filters.hasta });
    }

    // Un registro es incompleto mientras no tenga hora de salida.
    if (filters.estado === AttendanceRecordStatus.INCOMPLETO) {
      query.andWhere('record.check_out IS NULL');
    } else if (filters.estado === AttendanceRecordStatus.COMPLETO) {
      query.andWhere('record.check_out IS NOT NULL');
    }

    // Las relaciones son de muchos a uno, así que no multiplican filas y la
    // paginación puede resolverse en la misma consulta con LIMIT/OFFSET.
    const [records, total] = await query
      .orderBy('record.check_in', 'DESC')
      .addOrderBy('record.id', 'DESC')
      .offset((filters.pagina - 1) * filters.porPagina)
      .limit(filters.porPagina)
      .getManyAndCount();

    return { records, total };
  }

  findByIdAndEmployee(
    id: number,
    empleadoId: number,
  ): Promise<AttendanceRecord | null> {
    return this.repository
      .createQueryBuilder('record')
      .innerJoin('record.employee', 'employee')
      .where('record.id = :id', { id })
      .andWhere('employee.id = :empleadoId', { empleadoId })
      .getOne();
  }

  async updateCheckOutIfIncomplete(
    id: number,
    empleadoId: number,
    checkOut: Date,
    workMinutes: number,
  ): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(AttendanceRecord)
      .set({ check_out: checkOut, work_minutes: workMinutes })
      .where('id = :id', { id })
      .andWhere('employee_id = :empleadoId', { empleadoId })
      .andWhere('check_out IS NULL')
      .execute();

    return (result.affected ?? 0) === 1;
  }

  async findCheckInsBetween(
    desde: Date,
    hasta: Date,
  ): Promise<AttendanceRecord[]> {
    return this.repository
      .createQueryBuilder('record')
      .innerJoinAndSelect('record.employee', 'employee')
      .leftJoinAndSelect('record.branch', 'branch')
      .where('record.check_in >= :desde', { desde })
      .andWhere('record.check_in < :hasta', { hasta })
      .orderBy('record.check_in', 'ASC')
      .addOrderBy('record.id', 'ASC')
      .getMany();
  }
}
