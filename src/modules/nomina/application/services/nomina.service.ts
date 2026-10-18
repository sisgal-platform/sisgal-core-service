import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Employee } from 'src/entities/employee.model';
import type { PayrollLineResponseDto } from 'src/modules/liquidaciones/infraestructure/http/dtos/payroll-line-response.dto';
import { PayrollHoursService } from './payroll-hours.service';

export interface PreLiquidationCalculation {
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  earnings: PayrollLineResponseDto[];
  deductions: PayrollLineResponseDto[];
}

@Injectable()
export class NominaService {
  constructor(private readonly payrollHoursService: PayrollHoursService) {}

  async calculatePreLiquidation(
    _employee: Employee,
    _periodStart: string,
    _periodEnd: string,
  ): Promise<PreLiquidationCalculation> {
    throw new NotImplementedException(
      'El cálculo integral de preliquidación aún no está implementado.',
    );
  }
}
