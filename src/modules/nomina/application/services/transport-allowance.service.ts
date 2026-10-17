
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  SYSTEM_CONFIG_REPOSITORY_PORT,
} from '../../domain/ports/system-config-repository.port';

import type {
  SystemConfigRepositoryPort,
} from '../../domain/ports/system-config-repository.port';

import { TransportAllowanceResult } from '../../domain/interfaces/transport-allowance-result.interface';

@Injectable()
export class TransportAllowanceService {
  constructor(
    @Inject(SYSTEM_CONFIG_REPOSITORY_PORT)
    private readonly configRepository: SystemConfigRepositoryPort,
  ) {}

  async calculate(
    salaryBase: number,
    payrollDate: Date,
  ): Promise<TransportAllowanceResult> {
    if (!Number.isFinite(salaryBase) || salaryBase < 0) {
      throw new BadRequestException(
        'El salario base del empleado debe ser un valor válido no negativo.',
      );
    }

    if (
      !(payrollDate instanceof Date) ||
      Number.isNaN(payrollDate.getTime())
    ) {
      throw new BadRequestException(
        'La fecha de liquidación no es válida.',
      );
    }

    const [minimumWage, configuredAllowance] = await Promise.all([
      this.configRepository.getValue('MINIMUM_WAGE', payrollDate),
      this.configRepository.getValue(
        'TRANSPORT_ALLOWANCE',
        payrollDate,
      ),
    ]);

    if (minimumWage === null || configuredAllowance === null) {
      throw new InternalServerErrorException(
        'No existe una configuración vigente para el salario mínimo o el auxilio de transporte en la fecha de liquidación.',
      );
    }

    if (!Number.isFinite(minimumWage) || minimumWage <= 0) {
      throw new InternalServerErrorException(
        'El salario mínimo configurado no es válido.',
      );
    }

    if (
      !Number.isFinite(configuredAllowance) ||
      configuredAllowance < 0
    ) {
      throw new InternalServerErrorException(
        'El valor configurado para el auxilio de transporte no es válido.',
      );
    }

    const salaryLimit = this.roundCurrency(minimumWage * 2);
    const isEligible = salaryBase <= salaryLimit;

    return {
      isEligible,
      minimumWage,
      salaryLimit,
      configuredAllowance,
      allowanceAmount: isEligible
        ? this.roundCurrency(configuredAllowance)
        : 0,
      payrollDate,
    };
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
