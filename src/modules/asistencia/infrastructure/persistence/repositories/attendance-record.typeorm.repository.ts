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
