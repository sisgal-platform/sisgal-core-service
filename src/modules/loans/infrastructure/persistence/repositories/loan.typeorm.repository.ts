import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee, EmployeeLoan, LoanInstallment } from 'src/entities';
import {
  LoanFilters,
  LoanIndicators,
  LoanRepositoryPort,
} from '../../../domain/ports/loan.repository.port';
import { LoanStatus } from '../../../enums/loan-status.enum';

@Injectable()
export class LoanTypeOrmRepository implements LoanRepositoryPort {
  constructor(
    @InjectRepository(EmployeeLoan)
    private readonly repository: Repository<EmployeeLoan>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LoanInstallment)
    private readonly installmentRepository: Repository<LoanInstallment>,
  ) {}

  findEmployeeById(employeeId: number): Promise<Employee | null> {
    return this.employeeRepository.findOneBy({ id: employeeId });
  }

  save(loan: EmployeeLoan): Promise<EmployeeLoan> {
    return this.repository.save(loan);
  }

  countInstallments(loanId: number): Promise<number> {
    return this.installmentRepository.countBy({ loanId });
  }

  async delete(loanId: number): Promise<void> {
    await this.repository.delete({ id: loanId });
  }

  findById(loanId: number): Promise<EmployeeLoan | null> {
    return this.repository
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.employee', 'employee')
      .where('loan.id = :loanId', { loanId })
      .getOne();
  }

  async findAll(filters: LoanFilters): Promise<EmployeeLoan[]> {
    const query = this.repository
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.employee', 'employee');

    if (filters.empleadoId !== undefined) {
      query.andWhere('loan.employeeId = :empleadoId', {
        empleadoId: filters.empleadoId,
      });
    }

    if (filters.nombreEmpleado !== undefined) {
      query.andWhere(
        "CONCAT(employee.firstName, ' ', employee.lastName) ILIKE :nombreEmpleado",
        { nombreEmpleado: `%${filters.nombreEmpleado}%` },
      );
    }

    if (filters.documento !== undefined) {
      query.andWhere('employee.document = :documento', {
        documento: filters.documento,
      });
    }

    if (filters.estado !== undefined) {
      query.andWhere('loan.status = :estado', { estado: filters.estado });
    }

    if (filters.fechaDesde !== undefined) {
      query.andWhere('loan.grantedAt >= :fechaDesde', {
        fechaDesde: filters.fechaDesde,
      });
    }

    if (filters.fechaHasta !== undefined) {
      query.andWhere('loan.grantedAt <= :fechaHasta', {
        fechaHasta: filters.fechaHasta,
      });
    }

    return query
      .orderBy('loan.grantedAt', 'DESC')
      .addOrderBy('loan.id', 'DESC')
      .getMany();
  }

  async getIndicators(): Promise<LoanIndicators> {
    const result = await this.repository
      .createQueryBuilder('loan')
      .select('COUNT(loan.id)', 'cantidadPrestamosActivos')
      .addSelect(
        'COALESCE(SUM(loan.totalAmount), 0)',
        'montoTotalPrestamosActivos',
      )
      .where('loan.status = :estado', { estado: LoanStatus.ACTIVO })
      .getRawOne<{
        cantidadPrestamosActivos: string;
        montoTotalPrestamosActivos: string;
      }>();

    return {
      cantidadPrestamosActivos: Number(result?.cantidadPrestamosActivos ?? 0),
      montoTotalPrestamosActivos: Number(
        result?.montoTotalPrestamosActivos ?? 0,
      ),
    };
  }
}
