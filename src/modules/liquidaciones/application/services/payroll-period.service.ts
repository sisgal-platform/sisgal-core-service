import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as payrollPeriodRepositoryPort from '../../domain/ports/payroll-period-repository.port';
import { ListPayrollPeriodQueryDto } from '../../infraestructure/http/dtos/list-payroll-period-query.dto';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { PayrollLine } from 'src/entities/payroll_line.model';
import {
  EMPLOYEE_REPOSITORY_PORT,
  type EmployeeRepositoryPort,
} from 'src/modules/empleados/domain/ports/employee-repository.port';
import { NominaService } from 'src/modules/nomina/application/services/nomina.service';
import { PreLiquidationRequestDto } from 'src/modules/nomina/infrastructure/http/dtos/pre-liquidation-request.dto';
import { PayrollPeriodDetailResponseDto } from '../../infraestructure/http/dtos/payroll-period-detail-response.dto';

@Injectable()
export class PayrollPeriodService {
  constructor(
    @Inject(payrollPeriodRepositoryPort.PAYROLL_PERIOD_REPOSITORY_PORT)
    private readonly payrollPeriodRepository: payrollPeriodRepositoryPort.PayrollPeriodRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY_PORT)
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly nominaService: NominaService,
  ) {}

  async generate(
    employeeId: number,
    period: PreLiquidationRequestDto,
  ): Promise<PayrollPeriodDetailResponseDto> {
    if (!Number.isInteger(employeeId) || employeeId < 1) {
      throw new BadRequestException(
        'El identificador del empleado debe ser positivo.',
      );
    }

    if (period.periodStart > period.periodEnd) {
      throw new BadRequestException(
        'El período inicial no puede ser posterior al período final.',
      );
    }

    const employee = await this.employeeRepository.findById(employeeId);
    if (!employee) {
      throw new NotFoundException(
        `No se encontró un empleado con el identificador ${employeeId}.`,
      );
    }

    const calculation = await this.nominaService.calculatePreLiquidation(
      employee,
      period.periodStart,
      period.periodEnd,
    );
    const payrollPeriod = Object.assign(new PayrollPeriod(), {
      period_start: new Date(`${period.periodStart}T00:00:00.000Z`),
      period_end: new Date(`${period.periodEnd}T00:00:00.000Z`),
      total_earnings: calculation.totalEarnings,
      total_deductions: calculation.totalDeductions,
      net_pay: calculation.netPay,
      config_snapshot: calculation.configSnapshot,
      employee,
      payroll_lines: [
        ...calculation.earnings.map((line) =>
          this.toPayrollLine(line, 'DEVENGADO'),
        ),
        ...calculation.deductions.map((line) =>
          this.toPayrollLine(line, 'DEDUCCION'),
        ),
      ],
    });

    const savedPayrollPeriod =
      await this.payrollPeriodRepository.save(payrollPeriod);

    return PayrollPeriodDetailResponseDto.fromEntity(savedPayrollPeriod);
  }

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

  private toPayrollLine(
    line: { conceptName: string; amount: number },
    type: 'DEVENGADO' | 'DEDUCCION',
  ): PayrollLine {
    return Object.assign(new PayrollLine(), {
      concept_name: line.conceptName,
      amount: line.amount,
      type,
    });
  }
}
