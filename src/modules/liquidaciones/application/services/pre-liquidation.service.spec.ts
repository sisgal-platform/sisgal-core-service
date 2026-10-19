import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Employee } from 'src/entities/employee.model';
import { EmployeeRepositoryPort } from 'src/modules/empleados/domain/ports/employee-repository.port';
import { NominaService } from 'src/modules/nomina/application/services/nomina.service';
import { PreLiquidationRequestDto } from 'src/modules/nomina/infrastructure/http/dtos/pre-liquidation-request.dto';
import { PreLiquidationService } from './pre-liquidation.service';

describe('PreLiquidationService', () => {
  const employeeRepository: jest.Mocked<
    Pick<EmployeeRepositoryPort, 'findById'>
  > = {
    findById: jest.fn(),
  };
  const nominaService: jest.Mocked<
    Pick<NominaService, 'calculatePreLiquidation'>
  > = {
    calculatePreLiquidation: jest.fn(),
  };
  const service = new PreLiquidationService(
    employeeRepository as EmployeeRepositoryPort,
    nominaService as unknown as NominaService,
  );
  const employee = {
    id: 1,
    firstName: 'Juan',
    lastName: 'Pérez',
    document_type: 'CC',
    document: '1020304050',
    jobPosition: { name: 'Mesero' },
  } as Employee;
  const period: PreLiquidationRequestDto = {
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('valida al empleado y delega el cálculo sin crear una liquidación', async () => {
    employeeRepository.findById.mockResolvedValue(employee);
    nominaService.calculatePreLiquidation.mockResolvedValue({
      totalEarnings: 1800000,
      totalDeductions: 150000,
      netPay: 1650000,
      configSnapshot: {},
      earnings: [{ conceptName: 'Salario base', amount: 1800000 }],
      deductions: [{ conceptName: 'Deducciones legales', amount: 150000 }],
    });

    await expect(service.generate(1, period)).resolves.toMatchObject({
      id: null,
      employeeId: 1,
      employeeName: 'Juan Pérez',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T00:00:00.000Z'),
      settlementDate: null,
      status: 'Preliquidación',
      totalEarnings: 1800000,
      totalDeductions: 150000,
      netPay: 1650000,
    });
    expect(nominaService.calculatePreLiquidation).toHaveBeenCalledWith(
      employee,
      '2026-09-01',
      '2026-09-30',
    );
  });

  it('rechaza un rango invertido antes de consultar al empleado', async () => {
    await expect(
      service.generate(1, {
        periodStart: '2026-09-30',
        periodEnd: '2026-09-01',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(employeeRepository.findById).not.toHaveBeenCalled();
    expect(nominaService.calculatePreLiquidation).not.toHaveBeenCalled();
  });

  it('responde no encontrado cuando el empleado no existe', async () => {
    employeeRepository.findById.mockResolvedValue(null);

    await expect(service.generate(99, period)).rejects.toThrow(
      NotFoundException,
    );
    expect(nominaService.calculatePreLiquidation).not.toHaveBeenCalled();
  });
});
