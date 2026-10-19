import {
  EarningsInput,
  calculateEarnings,
  calculateHourValue,
  calculateLoanDeductions,
  calculateTotals,
} from './payroll-calculation';
import { PayrollInconsistencyError } from './errors/payroll-inconsistency.error';

describe('payroll-calculation', () => {
  const minimumWage = 1_750_905;

  function buildInput(overrides: Partial<EarningsInput> = {}): EarningsInput {
    return {
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      monthlySalary: 1_500_000,
      dailyWorkHours: 8,
      minimumWage,
      transportAllowance: { isEligible: true, monthlyAmount: 249_095 },
      workedSegments: [],
      disabilityLeaves: [],
      ...overrides,
    };
  }

  describe('calculateHourValue', () => {
    it('divide el salario mensual entre 30 días y las horas diarias', () => {
      expect(calculateHourValue(1_500_000, 8)).toBe(6_250);
    });
  });

  describe('calculateEarnings', () => {
    it('paga el salario completo y el auxilio cuando no hay novedades', () => {
      const result = calculateEarnings(buildInput());

      expect(result.periodDays).toBe(30);
      expect(result.workedDays).toBe(30);
      expect(result.hourValue).toBe(6_250);
      expect(result.earnings).toEqual([
        { conceptName: 'Salario base', amount: 1_500_000 },
        { conceptName: 'Auxilio de transporte', amount: 249_095 },
      ]);
      expect(result.contributionBase).toBe(1_500_000);
      expect(result.totalEarnings).toBe(1_749_095);
    });

    it('paga las horas extra completas y solo el recargo de las horas ordinarias', () => {
      const result = calculateEarnings(
        buildInput({
          workedSegments: [
            {
              type: 'ORDINARIA_DIURNA',
              hours: 100,
              isExtra: false,
              multiplier: 1,
            },
            {
              type: 'ORDINARIA_NOCTURNA',
              hours: 3,
              isExtra: false,
              multiplier: 1.35,
            },
            {
              type: 'DOMINICAL_DIURNA',
              hours: 8,
              isExtra: false,
              multiplier: 1.75,
            },
            { type: 'EXTRA_DIURNA', hours: 2, isExtra: true, multiplier: 1.25 },
          ],
        }),
      );

      expect(result.earnings).toEqual([
        { conceptName: 'Salario base', amount: 1_500_000 },
        { conceptName: 'Horas extra diurnas', amount: 15_625 },
        { conceptName: 'Recargo nocturno', amount: 6_562.5 },
        { conceptName: 'Recargo dominical diurno', amount: 37_500 },
        { conceptName: 'Auxilio de transporte', amount: 249_095 },
      ]);
      expect(result.contributionBase).toBe(1_559_687.5);
      expect(result.totalEarnings).toBe(1_808_782.5);
    });

    it('resume las horas trabajadas por tipo, incluidas las ordinarias', () => {
      const result = calculateEarnings(
        buildInput({
          workedSegments: [
            {
              type: 'EXTRA_NOCTURNA',
              hours: 1.5,
              isExtra: true,
              multiplier: 1.75,
            },
            {
              type: 'ORDINARIA_DIURNA',
              hours: 7.25,
              isExtra: false,
              multiplier: 1,
            },
            {
              type: 'ORDINARIA_DIURNA',
              hours: 8,
              isExtra: false,
              multiplier: 1,
            },
          ],
        }),
      );

      expect(result.workedHours).toEqual([
        {
          type: 'ORDINARIA_DIURNA',
          label: 'Horas ordinarias diurnas',
          hours: 15.25,
        },
        { type: 'EXTRA_NOCTURNA', label: 'Horas extra nocturnas', hours: 1.5 },
      ]);
    });

    it('suma tramos del mismo tipo con multiplicadores distintos en el período', () => {
      const result = calculateEarnings(
        buildInput({
          workedSegments: [
            { type: 'EXTRA_DIURNA', hours: 1, isExtra: true, multiplier: 1.25 },
            { type: 'EXTRA_DIURNA', hours: 1, isExtra: true, multiplier: 1.5 },
          ],
        }),
      );

      expect(result.earnings).toContainEqual({
        conceptName: 'Horas extra diurnas',
        amount: 17_187.5,
      });
    });

    it('no incluye el auxilio de transporte cuando el empleado no cumple las condiciones', () => {
      const result = calculateEarnings(
        buildInput({
          transportAllowance: { isEligible: false, monthlyAmount: 249_095 },
        }),
      );

      expect(result.earnings).toEqual([
        { conceptName: 'Salario base', amount: 1_500_000 },
      ]);
    });

    it('liquida el salario base de una quincena', () => {
      const result = calculateEarnings(
        buildInput({ periodStart: '2026-10-16', periodEnd: '2026-10-31' }),
      );

      expect(result.periodDays).toBe(15);
      expect(result.earnings).toEqual([
        { conceptName: 'Salario base', amount: 750_000 },
        { conceptName: 'Auxilio de transporte', amount: 124_547.5 },
      ]);
    });

    it('descuenta los días de incapacidad del salario y del auxilio, y paga la incapacidad según su tipo', () => {
      const result = calculateEarnings(
        buildInput({
          monthlySalary: 3_000_000,
          disabilityLeaves: [
            {
              type: 'Enfermedad general',
              startDate: '2026-09-09',
              endDate: '2026-09-14',
            },
          ],
        }),
      );

      expect(result.disabilityDays).toBe(6);
      expect(result.workedDays).toBe(24);
      // Días 1 y 2 al 100% (200.000) y días 3 a 6 en dos terceras partes (266.666,67).
      expect(result.earnings).toEqual([
        { conceptName: 'Salario base', amount: 2_400_000 },
        { conceptName: 'Incapacidad enfermedad general', amount: 466_666.67 },
        { conceptName: 'Auxilio de transporte', amount: 199_276 },
      ]);
      expect(result.contributionBase).toBe(2_866_666.67);
    });

    it('continúa la numeración de días de una incapacidad que empezó en el período anterior', () => {
      const result = calculateEarnings(
        buildInput({
          monthlySalary: 3_000_000,
          disabilityLeaves: [
            {
              type: 'Enfermedad general',
              startDate: '2026-08-30',
              endDate: '2026-09-03',
            },
          ],
        }),
      );

      // 30 y 31 de agosto ya fueron los días 1 y 2: del 1 al 3 de septiembre se pagan al 66,67%.
      expect(result.disabilityDays).toBe(3);
      expect(result.earnings).toContainEqual({
        conceptName: 'Incapacidad enfermedad general',
        amount: 200_000,
      });
    });

    it('no paga un día de incapacidad por debajo del salario mínimo diario', () => {
      const result = calculateEarnings(
        buildInput({
          monthlySalary: 1_800_000,
          disabilityLeaves: [
            {
              type: 'Enfermedad general',
              startDate: '2026-09-01',
              endDate: '2026-09-04',
            },
          ],
        }),
      );

      // Días 1 y 2 a 60.000; días 3 y 4 al mínimo diario (58.363,50) en vez de 40.000.
      expect(result.earnings).toContainEqual({
        conceptName: 'Incapacidad enfermedad general',
        amount: 236_727,
      });
    });

    it('paga completos el accidente de trabajo y las licencias', () => {
      const result = calculateEarnings(
        buildInput({
          monthlySalary: 3_000_000,
          disabilityLeaves: [
            {
              type: 'Accidente de trabajo',
              startDate: '2026-09-01',
              endDate: '2026-09-05',
            },
            {
              type: 'Licencia de paternidad',
              startDate: '2026-09-20',
              endDate: '2026-09-30',
            },
          ],
        }),
      );

      expect(result.disabilityDays).toBe(16);
      expect(result.earnings).toEqual([
        { conceptName: 'Salario base', amount: 1_400_000 },
        { conceptName: 'Incapacidad accidente de trabajo', amount: 500_000 },
        { conceptName: 'Licencia de paternidad', amount: 1_100_000 },
        { conceptName: 'Auxilio de transporte', amount: 116_244.33 },
      ]);
    });

    it('solo cuenta los días de la incapacidad que caen dentro del período', () => {
      const result = calculateEarnings(
        buildInput({
          monthlySalary: 3_000_000,
          disabilityLeaves: [
            {
              type: 'Licencia de maternidad',
              startDate: '2026-09-25',
              endDate: '2026-12-26',
            },
          ],
        }),
      );

      expect(result.disabilityDays).toBe(6);
      expect(result.earnings).toContainEqual({
        conceptName: 'Licencia de maternidad',
        amount: 600_000,
      });
    });

    it('identifica las incapacidades con un tipo no reconocido', () => {
      expect(() =>
        calculateEarnings(
          buildInput({
            disabilityLeaves: [
              {
                type: 'Vacaciones',
                startDate: '2026-09-09',
                endDate: '2026-09-10',
              },
            ],
          }),
        ),
      ).toThrow(
        new PayrollInconsistencyError([
          'La incapacidad del 09/09/2026 al 10/09/2026 tiene un tipo no reconocido ("Vacaciones").',
        ]),
      );
    });

    it('rechaza un salario base inválido', () => {
      expect(() => calculateEarnings(buildInput({ monthlySalary: 0 }))).toThrow(
        PayrollInconsistencyError,
      );
    });
  });

  describe('calculateLoanDeductions', () => {
    it('descuenta una cuota por cada préstamo con cuotas y saldo pendientes', () => {
      expect(
        calculateLoanDeductions([
          {
            loanId: 12,
            installmentAmount: 50_000,
            outstandingBalance: 100_000,
            pendingInstallments: 2,
          },
          {
            loanId: 2,
            installmentAmount: 100_000,
            outstandingBalance: 300_000,
            pendingInstallments: 3,
          },
          {
            loanId: 7,
            installmentAmount: 400_000,
            outstandingBalance: 0,
            pendingInstallments: 0,
          },
        ]),
      ).toEqual([
        { conceptName: 'Cuota préstamo #2', amount: 100_000 },
        { conceptName: 'Cuota préstamo #12', amount: 50_000 },
      ]);
    });

    it('no descuenta más que el saldo pendiente', () => {
      expect(
        calculateLoanDeductions([
          {
            loanId: 1,
            installmentAmount: 200_000,
            outstandingBalance: 80_000,
            pendingInstallments: 1,
          },
        ]),
      ).toEqual([{ conceptName: 'Cuota préstamo #1', amount: 80_000 }]);
    });
  });

  describe('calculateTotals', () => {
    it('calcula el neto como total devengado menos total deducciones', () => {
      expect(
        calculateTotals(
          [
            { conceptName: 'Salario base', amount: 1_500_000 },
            { conceptName: 'Auxilio de transporte', amount: 249_095 },
          ],
          [
            { conceptName: 'Salud', amount: 60_000 },
            { conceptName: 'Pensión', amount: 60_000 },
            { conceptName: 'Cuota préstamo #2', amount: 100_000.1 },
          ],
        ),
      ).toEqual({
        totalEarnings: 1_749_095,
        totalDeductions: 220_000.1,
        netPay: 1_529_094.9,
      });
    });

    it('identifica un neto negativo como inconsistencia', () => {
      expect(() =>
        calculateTotals(
          [{ conceptName: 'Salario base', amount: 100_000 }],
          [{ conceptName: 'Cuota préstamo #1', amount: 250_000 }],
        ),
      ).toThrow(PayrollInconsistencyError);
    });
  });
});
