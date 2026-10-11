import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as payrollPeriodRepositoryPort from '../../domain/ports/payroll-period-repository.port';
import { ListPayrollPeriodQueryDto } from '../../infraestructure/http/dtos/list-payroll-period-query.dto';
import { PayrollPeriod } from 'src/entities/payroll-period.model';

@Injectable()
export class PayrollPeriodService {
  constructor(
    @Inject(payrollPeriodRepositoryPort.PAYROLL_PERIOD_REPOSITORY_PORT)
    private readonly payrollPeriodRepository: payrollPeriodRepositoryPort.PayrollPeriodRepositoryPort,
  ) {}

  // Consulta de solo lectura: nunca recalcula, solo muestra lo ya liquidado
  async findAll(query: ListPayrollPeriodQueryDto): Promise<PayrollPeriod[]> {
    if (
      query.periodStart &&
      query.periodEnd &&
      query.periodStart > query.periodEnd
    ) {
      throw new BadRequestException(
        'El período inicial no puede ser posterior al período final.',
      );
    }

    return this.payrollPeriodRepository.findAll(query);
  }

  async findById(id: number): Promise<PayrollPeriod> {
    const payrollPeriod = await this.payrollPeriodRepository.findById(id);
    if (!payrollPeriod) {
      throw new NotFoundException(
        `No se encontró una liquidación con el identificador ${id}.`,
      );
    }

    return payrollPeriod;
  }
}
