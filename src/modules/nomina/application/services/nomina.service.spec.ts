import {
  BadRequestException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AttendanceRecord,
  DisabilityLeave,
  Employee,
  EmployeeLoan,
  PayrollPeriod,
  WorkRateConfig,
  WorkdayConfig,
} from 'src/entities';
import type { PayrollHoursRepositoryPort } from '../../domain/ports/payroll-hours.repository.port';
import type { PayrollInputsRepositoryPort } from '../../domain/ports/payroll-inputs.repository.port';
import type { SystemConfigRepositoryPort } from '../../domain/ports/system-config-repository.port';
import { NominaService } from './nomina.service';

describe('NominaService', () => {
  const systemConfigRepository: jest.Mocked<SystemConfigRepositoryPort> = {
    getValue: jest.fn(),
  };
  const payrollHoursRepository: jest.Mocked<PayrollHoursRepositoryPort> = {
    findWorkdayConfig: jest.fn(),
    findWorkRateConfig: jest.fn(),
    isHoliday: jest.fn(),
  };
  const payrollInputsRepository: jest.Mocked<PayrollInputsRepositoryPort> = {
    findActiveEmployees: jest.fn(),
    findAttendanceRecords: jest.fn(),
    findDisabilityLeaves: jest.fn(),
    findActiveLoans: jest.fn(),
    findPayrollPeriods: jest.fn(),
  };

  const service = new NominaService(
    systemConfigRepository,
    payrollHoursRepository,
    payrollInputsRepository,
  );

  // TypeORM entrega las columnas decimal como texto.
  const ana = {
    id: 1,
    firstName: 'Ana',
    lastName: 'Gómez',
    document: '1020304050',
    document_type: 'CC',
    salary_base: '1500000.00',
    status: 'ACTIVO',
  } as unknown as Employee;
  const luis = {
    id: 2,
    firstName: 'Luis',
    lastName: 'Mora',
    document: '9080706050',
    document_type: 'CC',
    salary_base: '3000000.00',
    status: 'ACTIVO',
  } as unknown as Employee;

  function attendance(
    id: number,
    employee: Employee,
    checkIn: string,
    checkOut: string | null,
  ): AttendanceRecord {
    return {
      id,
      employee,
      check_in: new Date(checkIn),
      check_out: checkOut ? new Date(checkOut) : null,
    } as AttendanceRecord;
  }

  // Jornada diurna de 06:00 a 19:00 con un máximo de 8 horas ordinarias al día.
  const workdayConfig = {
    max_day_hours: 8,
    max_week_hours: 42,
    day_start: '06:00:00',
    day_end: '19:00:00',
    night_start: '19:00:00',
    night_end: '06:00:00',
  } as WorkdayConfig;
  const multipliers: Record<string, number> = {
    ORDINARIA_DIURNA: 1,
    ORDINARIA_NOCTURNA: 1.35,
    EXTRA_DIURNA: 1.25,
    EXTRA_NOCTURNA: 1.75,
    DOMINICAL_DIURNA: 1.75,
    DOMINICAL_NOCTURNA: 2.1,
    EXTRA_DOMINICAL_DIURNA: 2,
    EXTRA_DOMINICAL_NOCTURNA: 2.5,
  };

  const systemConfig: Record<string, number> = {
    MINIMUM_WAGE: 1_750_905,
    TRANSPORT_ALLOWANCE: 249_095,
    HEALTH_RATE: 4,
    PENSION_RATE: 4,
  };
  const liquidationDate = new Date(2026, 8, 30, 12);

  beforeEach(() => {
    jest.clearAllMocks();
    payrollHoursRepository.findWorkdayConfig.mockResolvedValue(workdayConfig);
    payrollHoursRepository.findWorkRateConfig.mockImplementation(
      async (type) =>
        ({ type, multiplier: multipliers[type] }) as WorkRateConfig,
    );
    payrollHoursRepository.isHoliday.mockResolvedValue(false);
    payrollInputsRepository.findActiveEmployees.mockResolvedValue([ana, luis]);
    payrollInputsRepository.findAttendanceRecords.mockResolvedValue([
      attendance(
        10,
        ana,
        '2026-09-07T08:00:00-05:00',
        '2026-09-07T18:00:00-05:00',
      ),
    ]);
    payrollInputsRepository.findDisabilityLeaves.mockResolvedValue([
      {
        employee: ana,
        type: 'Enfermedad general',
        start_date: '2026-09-09',
        end_date: '2026-09-10',
      } as unknown as DisabilityLeave,
    ]);
    payrollInputsRepository.findActiveLoans.mockResolvedValue([
      {
        id: 4,
        employeeId: '1',
        installmentAmount: 250_000,
        outstandingBalance: '1000000.00',
        pendingInstallments: 4,
      } as unknown as EmployeeLoan,
    ]);
    payrollInputsRepository.findPayrollPeriods.mockResolvedValue([]);
    systemConfigRepository.getValue.mockImplementation(
      async (key) => systemConfig[key] ?? null,
    );
  });

  describe('calculatePreLiquidation', () => {
    it('integra asistencia, incapacidades, auxilio, deducciones legales y préstamos', async () => {
      const result = await service.calculatePreLiquidation(
        ana,
        '2026-09-01',
        '2026-09-30',
      );

      // 28 días de salario (2 de incapacidad), 2 horas extra diurnas a 6.250 x 1,25.
      expect(result.earnings).toEqual([
        { conceptName: 'Salario base', amount: 1_400_000 },
        { conceptName: 'Incapacidad enfermedad general', amount: 100_000 },
        { conceptName: 'Horas extra diurnas', amount: 15_625 },
        { conceptName: 'Auxilio de transporte', amount: 232_488.67 },
      ]);
      expect(result.deductions).toEqual([
        { conceptName: 'Salud', amount: 60_625 },
        { conceptName: 'Pensión', amount: 60_625 },
        { conceptName: 'Cuota préstamo #4', amount: 250_000 },
      ]);
      expect(result.totalEarnings).toBe(1_748_113.67);
      expect(result.totalDeductions).toBe(371_250);
      expect(result.netPay).toBe(1_376_863.67);
      expect(result.workedHours).toEqual([
        {
          type: 'ORDINARIA_DIURNA',
          label: 'Horas ordinarias diurnas',
          hours: 8,
        },
        { type: 'EXTRA_DIURNA', label: 'Horas extra diurnas', hours: 2 },
      ]);
      expect(result.configSnapshot).toMatchObject({
        liquidationDate: '2026-09-30',
        salaryBase: 1_500_000,
        hourValue: 6_250,
        workedDays: 28,
        disabilityDays: 2,
        contributionBase: 1_515_625,
        healthRate: 4,
        pensionRate: 4,
      });
    });

    it('calcula salud y pensión sobre el devengado salarial, sin el auxilio de transporte', async () => {
      const result = await service.calculatePreLiquidation(
        ana,
        '2026-09-01',
        '2026-09-30',
      );

      // 4% de 1.515.625 (sin el auxilio) y no de 1.748.113,67.
      expect(result.deductions).toEqual(
        expect.arrayContaining([
          { conceptName: 'Salud', amount: 60_625 },
          { conceptName: 'Pensión', amount: 60_625 },
        ]),
      );
      expect(systemConfigRepository.getValue).toHaveBeenCalledWith(
        'HEALTH_RATE',
        liquidationDate,
      );
    });

    it('consulta la información del período y los parámetros vigentes al último día', async () => {
      await service.calculatePreLiquidation(ana, '2026-09-01', '2026-09-30');

      expect(
        payrollInputsRepository.findAttendanceRecords,
      ).toHaveBeenCalledWith(
        [1],
        new Date('2026-09-01T00:00:00-05:00'),
        new Date('2026-10-01T00:00:00-05:00'),
      );
      expect(payrollInputsRepository.findDisabilityLeaves).toHaveBeenCalledWith(
        [1],
        '2026-09-01',
        '2026-09-30',
      );
      expect(payrollInputsRepository.findActiveLoans).toHaveBeenCalledWith(
        [1],
        '2026-09-30',
      );
      expect(payrollHoursRepository.findWorkdayConfig).toHaveBeenCalledWith(
        new Date(2026, 8, 30, 12),
      );
      expect(systemConfigRepository.getValue).toHaveBeenCalledWith(
        'MINIMUM_WAGE',
        liquidationDate,
      );
      // Las 2 horas extra empiezan a las 16:00, después de las 8 ordinarias.
      expect(payrollHoursRepository.findWorkRateConfig).toHaveBeenCalledWith(
        'EXTRA_DIURNA',
        new Date('2026-09-07T16:00:00-05:00'),
      );
    });

    it('informa al empleado y la causa cuando una marcación no tiene salida', async () => {
      payrollInputsRepository.findAttendanceRecords.mockResolvedValue([
        attendance(11, ana, '2026-09-08T08:00:00-05:00', null),
      ]);

      await expect(
        service.calculatePreLiquidation(ana, '2026-09-01', '2026-09-30'),
      ).rejects.toThrow(
        new UnprocessableEntityException(
          'No es posible calcular la nómina de Ana Gómez: La marcación del 08/09/2026 no tiene hora de salida.',
        ),
      );
      expect(systemConfigRepository.getValue).not.toHaveBeenCalled();
    });

    it('no vuelve a liquidar un período que ya tiene una liquidación registrada', async () => {
      payrollInputsRepository.findPayrollPeriods.mockResolvedValue([
        {
          employee: ana,
          period_start: '2026-09-01',
          period_end: '2026-09-30',
        } as unknown as PayrollPeriod,
      ]);

      await expect(
        service.calculatePreLiquidation(ana, '2026-09-16', '2026-09-30'),
      ).rejects.toThrow(
        'Ya tiene una liquidación registrada del 01/09/2026 al 30/09/2026.',
      );
    });

    it('convierte en causa el error al clasificar una marcación', async () => {
      payrollHoursRepository.findWorkRateConfig.mockImplementation(
        async (type) =>
          type === 'EXTRA_DIURNA'
            ? null
            : ({ type, multiplier: multipliers[type] } as WorkRateConfig),
      );

      await expect(
        service.calculatePreLiquidation(ana, '2026-09-01', '2026-09-30'),
      ).rejects.toThrow(
        'La marcación del 07/09/2026 no se pudo clasificar: No existe multiplicador para EXTRA_DIURNA vigente para 2026-09-07T21:00:00.000Z',
      );
    });

    it('clasifica las horas nocturnas y dominicales con su recargo', async () => {
      // Domingo 6 de septiembre de 15:00 a 21:00: 4 horas diurnas y 2 nocturnas.
      payrollInputsRepository.findAttendanceRecords.mockResolvedValue([
        attendance(
          14,
          ana,
          '2026-09-06T15:00:00-05:00',
          '2026-09-06T21:00:00-05:00',
        ),
      ]);
      payrollInputsRepository.findDisabilityLeaves.mockResolvedValue([]);

      const result = await service.calculatePreLiquidation(
        ana,
        '2026-09-01',
        '2026-09-30',
      );

      expect(result.workedHours).toEqual([
        {
          type: 'DOMINICAL_DIURNA',
          label: 'Horas dominicales o festivas diurnas',
          hours: 4,
        },
        {
          type: 'DOMINICAL_NOCTURNA',
          label: 'Horas dominicales o festivas nocturnas',
          hours: 2,
        },
      ]);
      // 4 h x 6.250 x 0,75 y 2 h x 6.250 x 1,10.
      expect(result.earnings).toEqual(
        expect.arrayContaining([
          { conceptName: 'Recargo dominical diurno', amount: 18_750 },
          { conceptName: 'Recargo dominical nocturno', amount: 13_750 },
        ]),
      );
    });

    it('identifica un salario base inválido sin consultar el auxilio de transporte', async () => {
      await expect(
        service.calculatePreLiquidation(
          { ...ana, salary_base: 0 } as Employee,
          '2026-09-01',
          '2026-09-30',
        ),
      ).rejects.toThrow('El salario base registrado no es válido.');
      expect(systemConfigRepository.getValue).not.toHaveBeenCalled();
    });

    it('identifica deducciones que superan el devengado', async () => {
      payrollInputsRepository.findActiveLoans.mockResolvedValue([
        {
          id: 9,
          employeeId: '1',
          installmentAmount: 5_000_000,
          outstandingBalance: 5_000_000,
          pendingInstallments: 1,
        } as unknown as EmployeeLoan,
      ]);

      await expect(
        service.calculatePreLiquidation(ana, '2026-09-01', '2026-09-30'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rechaza el cálculo cuando no existe una jornada laboral vigente', async () => {
      payrollHoursRepository.findWorkdayConfig.mockResolvedValue(null);

      await expect(
        service.calculatePreLiquidation(ana, '2026-09-01', '2026-09-30'),
      ).rejects.toThrow(
        'No existe una jornada laboral vigente con horas diarias válidas al 30/09/2026.',
      );
      expect(
        payrollInputsRepository.findAttendanceRecords,
      ).not.toHaveBeenCalled();
    });

    it('propaga los errores de configuración global de las deducciones legales', async () => {
      systemConfigRepository.getValue.mockImplementation(async (key) =>
        key === 'HEALTH_RATE' ? null : systemConfig[key],
      );

      await expect(
        service.calculatePreLiquidation(ana, '2026-09-01', '2026-09-30'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('no modifica marcaciones, incapacidades ni préstamos', async () => {
      const loans = await payrollInputsRepository.findActiveLoans(
        [1],
        '2026-09-30',
      );
      const before = JSON.stringify(loans);

      await service.calculatePreLiquidation(ana, '2026-09-01', '2026-09-30');

      expect(JSON.stringify(loans)).toBe(before);
    });
  });

  describe('calculatePayroll', () => {
    it('calcula a todos los empleados activos con una sola consulta por fuente', async () => {
      const result = await service.calculatePayroll('2026-09-01', '2026-09-30');

      expect(result.status).toBe('COMPLETADO');
      expect(result.errors).toEqual([]);
      expect(result.results.map((item) => item.employee.id)).toEqual([1, 2]);
      expect(
        payrollInputsRepository.findAttendanceRecords,
      ).toHaveBeenCalledTimes(1);
      expect(
        payrollInputsRepository.findAttendanceRecords,
      ).toHaveBeenCalledWith([1, 2], expect.any(Date), expect.any(Date));
    });

    it('no incluye a los empleados inactivos aunque hayan trabajado en el período', async () => {
      const inactive = {
        id: 6,
        firstName: 'Diomenes',
        lastName: 'Aristizabal',
        salary_base: '1200000.00',
        status: 'INACTIVO',
      } as unknown as Employee;
      payrollInputsRepository.findAttendanceRecords.mockResolvedValue([
        attendance(
          68,
          inactive,
          '2026-09-01T09:00:00-05:00',
          '2026-09-01T17:00:00-05:00',
        ),
      ]);

      const result = await service.calculatePayroll('2026-09-01', '2026-09-30');

      expect(payrollInputsRepository.findActiveEmployees).toHaveBeenCalled();
      expect(
        [...result.results, ...result.errors].map((item) => item.employee.id),
      ).toEqual([1, 2]);
    });

    it('consulta cada parámetro una sola vez en todo el lote', async () => {
      payrollInputsRepository.findAttendanceRecords.mockResolvedValue([
        attendance(
          10,
          ana,
          '2026-09-07T08:00:00-05:00',
          '2026-09-07T18:00:00-05:00',
        ),
        attendance(
          11,
          luis,
          '2026-09-07T07:00:00-05:00',
          '2026-09-07T17:00:00-05:00',
        ),
      ]);

      await service.calculatePayroll('2026-09-01', '2026-09-30');

      // Jornada del 30 (liquidación) y del 7; ORDINARIA_DIURNA y EXTRA_DIURNA del 7.
      expect(payrollHoursRepository.findWorkdayConfig).toHaveBeenCalledTimes(2);
      expect(payrollHoursRepository.findWorkRateConfig).toHaveBeenCalledTimes(
        2,
      );
      expect(payrollHoursRepository.isHoliday).toHaveBeenCalledTimes(1);
      // Salario mínimo, auxilio, salud y pensión: una vez para los dos empleados.
      expect(systemConfigRepository.getValue).toHaveBeenCalledTimes(4);

      await service.calculatePayroll('2026-09-01', '2026-09-30');

      expect(payrollHoursRepository.findWorkdayConfig).toHaveBeenCalledTimes(4);
      expect(systemConfigRepository.getValue).toHaveBeenCalledTimes(8);
    });

    it('asigna a cada empleado solo su propia información', async () => {
      const result = await service.calculatePayroll('2026-09-01', '2026-09-30');
      const luisResult = result.results.find((item) => item.employee.id === 2);

      expect(luisResult?.calculation.earnings).toEqual([
        { conceptName: 'Salario base', amount: 3_000_000 },
        { conceptName: 'Auxilio de transporte', amount: 249_095 },
      ]);
      expect(luisResult?.calculation.deductions).toEqual([
        { conceptName: 'Salud', amount: 120_000 },
        { conceptName: 'Pensión', amount: 120_000 },
      ]);
      expect(luisResult?.calculation.workedHours).toEqual([]);
    });

    it('reporta los empleados con inconsistencias sin descartar a los demás', async () => {
      payrollInputsRepository.findAttendanceRecords.mockResolvedValue([
        attendance(
          10,
          ana,
          '2026-09-07T08:00:00-05:00',
          '2026-09-07T18:00:00-05:00',
        ),
        attendance(12, luis, '2026-09-08T08:00:00-05:00', null),
        attendance(13, luis, '2026-09-09T08:00:00-05:00', null),
      ]);

      const result = await service.calculatePayroll('2026-09-01', '2026-09-30');

      expect(result.status).toBe('CON_ERRORES');
      expect(result.results.map((item) => item.employee.id)).toEqual([1]);
      expect(result.errors).toEqual([
        {
          employee: luis,
          causes: [
            'La marcación del 08/09/2026 no tiene hora de salida.',
            'La marcación del 09/09/2026 no tiene hora de salida.',
          ],
        },
      ]);
    });

    it('retorna un cálculo vacío cuando no hay empleados activos', async () => {
      payrollInputsRepository.findActiveEmployees.mockResolvedValue([]);

      await expect(
        service.calculatePayroll('2026-09-01', '2026-09-30'),
      ).resolves.toEqual({
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        status: 'COMPLETADO',
        results: [],
        errors: [],
      });
      expect(payrollHoursRepository.findWorkdayConfig).not.toHaveBeenCalled();
    });

    it('rechaza un período con la fecha inicial posterior a la final', async () => {
      await expect(
        service.calculatePayroll('2026-09-30', '2026-09-01'),
      ).rejects.toThrow(BadRequestException);
      expect(
        payrollInputsRepository.findActiveEmployees,
      ).not.toHaveBeenCalled();
    });

    it('da el mismo resultado al ejecutar el cálculo dos veces', async () => {
      const first = await service.calculatePayroll('2026-09-01', '2026-09-30');
      const second = await service.calculatePayroll('2026-09-01', '2026-09-30');

      expect(second).toEqual(first);
    });
  });
});
