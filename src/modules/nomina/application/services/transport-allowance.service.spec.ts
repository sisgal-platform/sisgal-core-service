
import { jest } from '@jest/globals';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { TransportAllowanceService } from './transport-allowance.service';
import { SystemConfigRepositoryPort } from '../../domain/ports/system-config-repository.port';

describe('TransportAllowanceService', () => {
  let service: TransportAllowanceService;

  let configRepository: {
    getValue: jest.Mock<
      (key: string, payrollDate: Date) => Promise<number | null>
    >;
  };

  const payrollDate = new Date('2026-10-01T12:00:00-05:00');

  const minimumWage = 1_750_000;
  const configuredAllowance = 200_000;
  const salaryLimit = minimumWage * 2;

  beforeEach(() => {
    configRepository = {
      getValue: jest.fn(
        async (key: string): Promise<number | null> => {
          if (key === 'MINIMUM_WAGE') return minimumWage;
          if (key === 'TRANSPORT_ALLOWANCE') {
            return configuredAllowance;
          }

          return null;
        },
      ),
    };

    service = new TransportAllowanceService(
      configRepository as unknown as SystemConfigRepositoryPort,
    );
  });

  it('debe calcular el auxilio para un empleado elegible', async () => {
    const result = await service.calculate(2_000_000, payrollDate);

    expect(result.isEligible).toBe(true);
    expect(result.minimumWage).toBe(minimumWage);
    expect(result.salaryLimit).toBe(salaryLimit);
    expect(result.configuredAllowance).toBe(configuredAllowance);
    expect(result.allowanceAmount).toBe(configuredAllowance);
  });

  it('debe incluir el auxilio cuando el salario es exactamente dos salarios mínimos', async () => {
    const result = await service.calculate(salaryLimit, payrollDate);

    expect(result.isEligible).toBe(true);
    expect(result.allowanceAmount).toBe(configuredAllowance);
  });

  it('no debe incluir el auxilio cuando el salario supera el límite', async () => {
    const result = await service.calculate(salaryLimit + 1, payrollDate);

    expect(result.isEligible).toBe(false);
    expect(result.configuredAllowance).toBe(configuredAllowance);
    expect(result.allowanceAmount).toBe(0);
  });

  it('debe consultar ambas configuraciones para la fecha de liquidación', async () => {
    await service.calculate(2_000_000, payrollDate);

    expect(configRepository.getValue).toHaveBeenCalledWith(
      'MINIMUM_WAGE',
      payrollDate,
    );

    expect(configRepository.getValue).toHaveBeenCalledWith(
      'TRANSPORT_ALLOWANCE',
      payrollDate,
    );
  });

  it('debe rechazar un salario negativo', async () => {
    await expect(
      service.calculate(-1, payrollDate),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe rechazar una fecha inválida', async () => {
    await expect(
      service.calculate(2_000_000, new Date('fecha inválida')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe fallar si falta el salario mínimo configurado', async () => {
    configRepository.getValue.mockImplementation(
      async (key: string): Promise<number | null> =>
        key === 'TRANSPORT_ALLOWANCE' ? configuredAllowance : null,
    );

    await expect(
      service.calculate(2_000_000, payrollDate),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('debe fallar si falta el valor del auxilio configurado', async () => {
    configRepository.getValue.mockImplementation(
      async (key: string): Promise<number | null> =>
        key === 'MINIMUM_WAGE' ? minimumWage : null,
    );

    await expect(
      service.calculate(2_000_000, payrollDate),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('debe rechazar un salario mínimo configurado en cero', async () => {
    configRepository.getValue.mockImplementation(
      async (key: string): Promise<number | null> =>
        key === 'MINIMUM_WAGE' ? 0 : configuredAllowance,
    );

    await expect(
      service.calculate(2_000_000, payrollDate),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('debe rechazar un valor negativo del auxilio', async () => {
    configRepository.getValue.mockImplementation(
      async (key: string): Promise<number | null> =>
        key === 'MINIMUM_WAGE' ? minimumWage : -1,
    );

    await expect(
      service.calculate(2_000_000, payrollDate),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
