import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee } from 'src/entities/employee.model';
import {
  EMPLOYEE_REPOSITORY_PORT,
  type EmployeeRepositoryPort,
} from 'src/modules/empleados/domain/ports/employee-repository.port';
import {
  NominaService,
  type PreLiquidationCalculation,
} from 'src/modules/nomina/application/services/nomina.service';
import { PreLiquidationRequestDto } from 'src/modules/nomina/infrastructure/http/dtos/pre-liquidation-request.dto';
import { PayrollPeriodDetailResponseDto } from '../../infraestructure/http/dtos/payroll-period-detail-response.dto';
import { PayrollPeriodService } from './payroll-period.service';

@Injectable()
export class PreLiquidationService {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY_PORT)
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly nominaService: NominaService,
    private readonly payrollPeriodService: PayrollPeriodService,
  ) {}

  /** Vista previa de cómo quedaría una liquidación guardada, sin modificarla. */
  async generateForUpdate(
    payrollPeriodId: number,
    period: PreLiquidationRequestDto,
  ): Promise<PayrollPeriodDetailResponseDto> {
    if (period.periodStart > period.periodEnd) {
      throw new BadRequestException(
        'El período inicial no puede ser posterior al período final.',
      );
    }

    const current = await this.payrollPeriodService.findById(payrollPeriodId);
    const calculation = await this.nominaService.calculatePreLiquidation(
      current.employee,
      period.periodStart,
      period.periodEnd,
      current,
    );

    return PayrollPeriodDetailResponseDto.fromPreLiquidation(
      current.employee,
      period,
      calculation,
    );
  }

  async generate(
    employeeId: number,
    period: PreLiquidationRequestDto,
  ): Promise<PayrollPeriodDetailResponseDto> {
    if (employeeId < 1) {
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

    return PayrollPeriodDetailResponseDto.fromPreLiquidation(
      employee,
      period,
      calculation,
    );
  }
}
