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
    hire_date: '2025-08-01',
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

  // Préstamo mensual de 1.500.000 en 6 cuotas de 250.000, con 4 pendientes.
  function loanOfAna(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 4,
      employeeId: '1',
      totalAmount: '1500000.00',
      installmentAmount: 250_000,
      totalInstallments: 6,
      pendingInstallments: 4,
      outstandingBalance: '1000000.00',
      grantedAt: '2026-07-20',
      periodicity: 'MENSUAL',
      status: 'ACTIVO',
      ...overrides,
    } as unknown as EmployeeLoan;
  }

  const systemConfig: Record<string, number> = {
    MINIMUM_WAGE: 1_750_905,
    TRANSPORT_ALLOWANCE: 249_095,
    HEALTH_RATE: 4,
    PENSION_RATE: 4,
    SERVICE_BONUS_DAYS_PER_YEAR: 30,
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
    payrollInputsRepository.findActiveLoans.mockResolvedValue([loanOfAna()]);
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
        {
          conceptName: 'Cuota préstamo #4',
          amount: 250_000,
          loan: {
            loanId: 4,
            installments: 1,
            scheduledAmount: 250_000,
            outstandingBalance: 750_000,
            pendingInstallments: 3,
          },
        },
      ]);
      expect(result.loanInstallments).toEqual([
        {
          loanId: 4,
          conceptName: 'Cuota préstamo #4',
          cutoffDates: ['2026-09-30'],
          installments: 1,
          scheduledAmount: 250_000,
          amount: 250_000,
          previousBalance: 1_000_000,
          newBalance: 750_000,
          previousPendingInstallments: 4,
          remainingInstallments: 3,
        },
      ]);
      expect(result.loanObservations).toEqual([]);
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
        maxLoanDeductions: 697_187.5,
        loanObservations: [],
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

    it('limita las cuotas al 50% del salario neto y lo informa', async () => {
      payrollInputsRepository.findActiveLoans.mockResolvedValue([
        loanOfAna({
          id: 9,
          totalAmount: '5000000.00',
          installmentAmount: 5_000_000,
          totalInstallments: 1,
          pendingInstallments: 1,
          outstandingBalance: '5000000.00',
        }),
      ]);

      const result = await service.calculatePreLiquidation(
        ana,
        '2026-09-01',
        '2026-09-30',
      );

      // 50% de 1.515.625 - 60.625 - 60.625.
      expect(result.deductions[2]).toEqual({
        conceptName: 'Cuota préstamo #9',
        amount: 697_187.5,
        loan: {
          loanId: 9,
          installments: 1,
          scheduledAmount: 5_000_000,
          outstandingBalance: 4_302_812.5,
          pendingInstallments: 1,
        },
      });
      expect(result.netPay).toBe(929_676.17);
      expect(result.loanObservations).toEqual([
        expect.objectContaining({
          loanId: 9,
          reason: 'LIMITE_DEDUCCIONES',
          message: expect.stringContaining(
            'La cuota del préstamo #9 se descontó parcialmente',
          ),
        }),
      ]);
      expect(result.configSnapshot.loanObservations).toEqual([
        result.loanObservations[0].message,
      ]);
    });

    it('no descuenta la cuota cuando el período no incluye una fecha de corte del préstamo', async () => {
      const result = await service.calculatePreLiquidation(
        ana,
        '2026-09-01',
        '2026-09-15',
      );

      expect(result.deductions.map((line) => line.conceptName)).toEqual([
        'Salud',
        'Pensión',
      ]);
      expect(result.loanInstallments).toEqual([]);
    });

    it('descuenta una cuota por cada corte de un préstamo quincenal', async () => {
      payrollInputsRepository.findActiveLoans.mockResolvedValue([
        loanOfAna({ periodicity: 'QUINCENAL', installmentAmount: 125_000 }),
      ]);

      const result = await service.calculatePreLiquidation(
        ana,
        '2026-09-01',
        '2026-09-30',
      );

      expect(result.loanInstallments).toEqual([
        expect.objectContaining({
          cutoffDates: ['2026-09-15', '2026-09-30'],
          installments: 2,
          amount: 250_000,
          remainingInstallments: 2,
        }),
      ]);
    });

    it('no descuenta un préstamo con información inconsistente y lo informa', async () => {
      payrollInputsRepository.findActiveLoans.mockResolvedValue([
        loanOfAna({ outstandingBalance: '-1000.00' }),
      ]);

      const result = await service.calculatePreLiquidation(
        ana,
        '2026-09-01',
        '2026-09-30',
      );

      expect(result.loanInstallments).toEqual([]);
      expect(result.loanObservations).toEqual([
        {
          loanId: 4,
          reason: 'INFORMACION_INCONSISTENTE',
          message:
            'El préstamo #4 no se descontó porque tiene información inconsistente. Revíselo en el módulo de préstamos.',
          details: { causes: ['El saldo pendiente es negativo.'] },
        },
      ]);
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

  describe('prima de servicios', () => {
    const june = { periodStart: '2026-06-01', periodEnd: '2026-06-30' };

    beforeEach(() => {
      payrollInputsRepository.findAttendanceRecords.mockResolvedValue([]);
      payrollInputsRepository.findDisabilityLeaves.mockResolvedValue([]);
    });

    it('incluye la prima en la liquidación que cierra el semestre, sin cambiar salud ni pensión', async () => {
      const result = await service.calculatePreLiquidation(
        ana,
        june.periodStart,
        june.periodEnd,
      );

      // (1.500.000 + 249.095 de auxilio) x 180 / 360.
      expect(result.earnings).toEqual([
        { conceptName: 'Salario base', amount: 1_500_000 },
        { conceptName: 'Auxilio de transporte', amount: 249_095 },
        {
          conceptName: 'Prima de servicios 1.er semestre 2026',
          amount: 874_547.5,
          serviceBonus: {
            semesterStart: '2026-01-01',
            semesterEnd: '2026-06-30',
            workedDays: 180,
            semesterDays: 180,
            baseAmount: 1_749_095,
            isProportional: false,
          },
        },
      ]);
      expect(result.deductions).toEqual([
        { conceptName: 'Salud', amount: 60_000 },
        { conceptName: 'Pensión', amount: 60_000 },
      ]);
      expect(result.totalEarnings).toBe(2_623_642.5);
      expect(result.netPay).toBe(2_503_642.5);
      expect(systemConfigRepository.getValue).toHaveBeenCalledWith(
        'SERVICE_BONUS_DAYS_PER_YEAR',
        new Date(2026, 5, 30, 12),
      );
      expect(result.configSnapshot).toMatchObject({
        hireDate: '2025-08-01',
        serviceBonusDaysPerYear: 30,
        serviceBonuses: [
          expect.objectContaining({
            conceptName: 'Prima de servicios 1.er semestre 2026',
            workedFrom: '2026-01-01',
            salaryBase: 1_500_000,
            transportAllowance: 249_095,
            amount: 874_547.5,
          }),
        ],
      });
    });

    it('calcula la prima proporcional desde la fecha de ingreso', async () => {
      const result = await service.calculatePreLiquidation(
        { ...ana, hire_date: '2026-03-01' } as Employee,
        june.periodStart,
        june.periodEnd,
      );

      expect(result.earnings[2]).toEqual({
        conceptName: 'Prima de servicios 1.er semestre 2026',
        amount: 583_031.67,
        serviceBonus: expect.objectContaining({
          workedDays: 120,
          isProportional: true,
        }),
      });
    });

    it('no incluye prima a quien ingresó después de terminar el semestre', async () => {
      // El período incluye el 31 de diciembre, pero el ingreso fue en enero.
      const result = await service.calculatePreLiquidation(
        { ...ana, hire_date: '2027-01-05' } as Employee,
        '2026-12-16',
        '2027-01-15',
      );

      expect(
        result.earnings.some((line) =>
          line.conceptName.startsWith('Prima de servicios'),
        ),
      ).toBe(false);
      expect(result.configSnapshot.serviceBonuses).toEqual([]);
    });

    it('no consulta los días de prima en un período que no paga prima', async () => {
      await service.calculatePreLiquidation(ana, '2026-07-01', '2026-07-31');

      expect(systemConfigRepository.getValue).not.toHaveBeenCalledWith(
        'SERVICE_BONUS_DAYS_PER_YEAR',
        expect.anything(),
      );
    });

    it('pide registrar la fecha de ingreso cuando el período paga prima', async () => {
      await expect(
        service.calculatePreLiquidation(
          { ...ana, hire_date: null } as Employee,
          june.periodStart,
          june.periodEnd,
        ),
      ).rejects.toThrow(
        'No es posible calcular la nómina de Ana Gómez: No tiene fecha de ingreso registrada; es necesaria para calcular la prima de servicios.',
      );
    });

    it('identifica en el lote a los empleados sin fecha de ingreso sin descartar a los demás', async () => {
      const result = await service.calculatePayroll(
        june.periodStart,
        june.periodEnd,
      );

      expect(result.status).toBe('CON_ERRORES');
      expect(result.results.map((item) => item.employee.id)).toEqual([1]);
      expect(result.errors).toEqual([
        {
          employee: luis,
          causes: [
            'No tiene fecha de ingreso registrada; es necesaria para calcular la prima de servicios.',
          ],
        },
      ]);
    });

    it('no exige la fecha de ingreso en un período que no paga prima', async () => {
      const result = await service.calculatePayroll('2026-09-01', '2026-09-30');

      expect(result.errors).toEqual([]);
    });

    it('rechaza el cálculo cuando no hay días de prima configurados', async () => {
      systemConfigRepository.getValue.mockImplementation(async (key) =>
        key === 'SERVICE_BONUS_DAYS_PER_YEAR' ? null : systemConfig[key],
      );

      await expect(
        service.calculatePreLiquidation(ana, june.periodStart, june.periodEnd),
      ).rejects.toThrow(
        new UnprocessableEntityException(
          'No existe un valor vigente y válido para los días de prima de servicios por año al 30/06/2026.',
        ),
      );
    });
  });
});
