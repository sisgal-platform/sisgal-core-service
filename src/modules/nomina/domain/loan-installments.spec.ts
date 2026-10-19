import { LoanPeriodicity } from 'src/modules/loans/enums/loan-periodicity.enum';
import {
  type LoanInput,
  findLoanInconsistencies,
  listCutoffDates,
  planLoanInstallments,
} from './loan-installments';
import { formatCurrency } from './payroll-calculation';

describe('loan-installments', () => {
  // Préstamo mensual de 1.000.000 en 5 cuotas de 200.000, con 2 pendientes.
  function loan(overrides: Partial<LoanInput> = {}): LoanInput {
    return {
      loanId: 1,
      employeeId: 7,
      totalAmount: 1_000_000,
      installmentAmount: 200_000,
      totalInstallments: 5,
      pendingInstallments: 2,
      outstandingBalance: 400_000,
      grantedAt: '2026-08-01',
      periodicity: LoanPeriodicity.MENSUAL,
      ...overrides,
    };
  }

  function plan(
    loans: LoanInput[],
    periodStart = '2026-09-01',
    periodEnd = '2026-09-30',
    maxAmount = 10_000_000,
  ) {
    return planLoanInstallments({ loans, periodStart, periodEnd, maxAmount });
  }

  describe('listCutoffDates', () => {
    it('usa el último día de cada mes para los préstamos mensuales', () => {
      expect(
        listCutoffDates(LoanPeriodicity.MENSUAL, '2026-01-10', '2026-03-31'),
      ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });

    it('usa el 15 y el último día de cada mes para los préstamos quincenales', () => {
      expect(
        listCutoffDates(LoanPeriodicity.QUINCENAL, '2028-02-01', '2028-03-15'),
      ).toEqual(['2028-02-15', '2028-02-29', '2028-03-15']);
    });

    it('incluye las dos fechas límite y cruza el cambio de año', () => {
      expect(
        listCutoffDates(LoanPeriodicity.QUINCENAL, '2026-12-15', '2027-01-15'),
      ).toEqual(['2026-12-15', '2026-12-31', '2027-01-15']);
    });

    it('no tiene cortes en un período que no los incluye', () => {
      expect(
        listCutoffDates(LoanPeriodicity.MENSUAL, '2026-09-01', '2026-09-29'),
      ).toEqual([]);
      expect(
        listCutoffDates(LoanPeriodicity.QUINCENAL, '2026-09-16', '2026-09-29'),
      ).toEqual([]);
    });
  });

  describe('planLoanInstallments', () => {
    it('descuenta la cuota cuando el período incluye la fecha de corte', () => {
      expect(plan([loan()])).toEqual({
        installments: [
          {
            loanId: 1,
            conceptName: 'Cuota préstamo #1',
            cutoffDates: ['2026-09-30'],
            installments: 1,
            scheduledAmount: 200_000,
            amount: 200_000,
            previousBalance: 400_000,
            newBalance: 200_000,
            previousPendingInstallments: 2,
            remainingInstallments: 1,
          },
        ],
        observations: [],
      });
    });

    it('no descuenta cuando la periodicidad no corresponde al período', () => {
      expect(plan([loan()], '2026-09-01', '2026-09-15')).toEqual({
        installments: [],
        observations: [],
      });
    });

    it('no descuenta cortes anteriores al otorgamiento del préstamo', () => {
      expect(
        plan([loan({ grantedAt: '2026-09-20' })], '2026-09-01', '2026-09-30')
          .installments,
      ).toHaveLength(1);
      expect(
        plan(
          [loan({ grantedAt: '2026-09-20', periodicity: 'QUINCENAL' })],
          '2026-09-01',
          '2026-09-30',
        ).installments[0].cutoffDates,
      ).toEqual(['2026-09-30']);
    });

    it('descuenta cada préstamo como un concepto independiente, del más antiguo al más reciente', () => {
      const result = plan([
        loan({
          loanId: 12,
          grantedAt: '2026-09-15',
          installmentAmount: 50_000,
        }),
        loan({
          loanId: 2,
          grantedAt: '2026-09-15',
          installmentAmount: 100_000,
        }),
        loan({ loanId: 3, grantedAt: '2026-07-01' }),
      ]);

      expect(
        result.installments.map(({ conceptName, amount }) => ({
          conceptName,
          amount,
        })),
      ).toEqual([
        { conceptName: 'Cuota préstamo #3', amount: 200_000 },
        { conceptName: 'Cuota préstamo #2', amount: 100_000 },
        { conceptName: 'Cuota préstamo #12', amount: 50_000 },
      ]);
    });

    it('descuenta una cuota por cada corte de un préstamo quincenal', () => {
      const [installment] = plan([
        loan({
          periodicity: LoanPeriodicity.QUINCENAL,
          installmentAmount: 100_000,
          totalInstallments: 10,
          pendingInstallments: 4,
        }),
      ]).installments;

      expect(installment).toMatchObject({
        cutoffDates: ['2026-09-15', '2026-09-30'],
        installments: 2,
        scheduledAmount: 200_000,
        amount: 200_000,
        newBalance: 200_000,
        remainingInstallments: 2,
      });
    });

    it('no descuenta más cuotas que las pendientes', () => {
      const [installment] = plan([
        loan({
          periodicity: LoanPeriodicity.QUINCENAL,
          pendingInstallments: 1,
          outstandingBalance: 200_000,
        }),
      ]).installments;

      expect(installment).toMatchObject({
        cutoffDates: ['2026-09-15'],
        installments: 1,
        amount: 200_000,
        newBalance: 0,
        remainingInstallments: 0,
      });
    });

    it('ajusta la última cuota al saldo cuando es menor que la cuota habitual y salda el préstamo', () => {
      const [installment] = plan([
        loan({ pendingInstallments: 1, outstandingBalance: 80_000 }),
      ]).installments;

      expect(installment).toMatchObject({
        scheduledAmount: 80_000,
        amount: 80_000,
        newBalance: 0,
        remainingInstallments: 0,
      });
    });

    it('descuenta en la última cuota la diferencia que dejó el redondeo de las cuotas', () => {
      // 100.000 en 3 cuotas de 33.333: la última descuenta 33.334.
      const [installment] = plan([
        loan({
          totalAmount: 100_000,
          installmentAmount: 33_333,
          totalInstallments: 3,
          pendingInstallments: 1,
          outstandingBalance: 33_334,
        }),
      ]).installments;

      expect(installment).toMatchObject({ amount: 33_334, newBalance: 0 });
    });

    it('no descuenta préstamos sin saldo pendiente ni los informa', () => {
      expect(
        plan([loan({ pendingInstallments: 0, outstandingBalance: 0 })]),
      ).toEqual({ installments: [], observations: [] });
    });

    it('descuenta solo lo que permite el límite de deducciones y lo informa', () => {
      const result = plan(
        [
          loan({ loanId: 1, grantedAt: '2026-01-01' }),
          loan({ loanId: 2, grantedAt: '2026-02-01' }),
          loan({ loanId: 3, grantedAt: '2026-03-01' }),
        ],
        '2026-09-01',
        '2026-09-30',
        300_000,
      );

      expect(
        result.installments.map(
          ({ loanId, amount, newBalance, remainingInstallments }) => ({
            loanId,
            amount,
            newBalance,
            remainingInstallments,
          }),
        ),
      ).toEqual([
        {
          loanId: 1,
          amount: 200_000,
          newBalance: 200_000,
          remainingInstallments: 1,
        },
        // El parcial no completa la cuota: las cuotas pendientes no bajan.
        {
          loanId: 2,
          amount: 100_000,
          newBalance: 300_000,
          remainingInstallments: 2,
        },
      ]);
      expect(result.observations).toEqual([
        {
          loanId: 2,
          reason: 'LIMITE_DEDUCCIONES',
          message: `La cuota del préstamo #2 se descontó parcialmente (${formatCurrency(100_000)} de ${formatCurrency(200_000)}) por el límite de deducciones del período (50% del salario neto).`,
          details: {
            scheduledAmount: 200_000,
            appliedAmount: 100_000,
            availableAmount: 100_000,
          },
        },
        {
          loanId: 3,
          reason: 'LIMITE_DEDUCCIONES',
          message: `La cuota del préstamo #3 (${formatCurrency(200_000)}) no se descontó porque supera el límite de deducciones del período (50% del salario neto).`,
          details: {
            scheduledAmount: 200_000,
            appliedAmount: 0,
            availableAmount: 0,
          },
        },
      ]);
    });

    it('no descuenta nada cuando el salario neto no deja margen', () => {
      const result = plan([loan()], '2026-09-01', '2026-09-30', -50_000);

      expect(result.installments).toEqual([]);
      expect(result.observations).toHaveLength(1);
    });

    it('no descuenta un préstamo inconsistente y no afecta a los demás', () => {
      const result = plan([
        loan({ loanId: 1, outstandingBalance: -1 }),
        loan({ loanId: 2 }),
      ]);

      expect(result.installments.map((item) => item.loanId)).toEqual([2]);
      expect(result.observations).toEqual([
        {
          loanId: 1,
          reason: 'INFORMACION_INCONSISTENTE',
          message:
            'El préstamo #1 no se descontó porque tiene información inconsistente. Revíselo en el módulo de préstamos.',
          details: { causes: ['El saldo pendiente es negativo.'] },
        },
      ]);
    });
  });

  describe('findLoanInconsistencies', () => {
    it('acepta un préstamo con información válida', () => {
      expect(findLoanInconsistencies(loan())).toEqual([]);
    });

    it.each<[string, Partial<LoanInput>, string]>([
      [
        'sin empleado',
        { employeeId: null },
        'El préstamo no tiene empleado asociado.',
      ],
      [
        'con valor cero',
        { totalAmount: 0 },
        'El valor del préstamo es menor o igual a cero.',
      ],
      [
        'sin cuotas',
        { totalInstallments: 0, pendingInstallments: 0, outstandingBalance: 0 },
        'El número de cuotas es menor o igual a cero.',
      ],
      [
        'con cuota en cero',
        { installmentAmount: 0 },
        'El valor de la cuota es menor o igual a cero.',
      ],
      [
        'con saldo negativo',
        { outstandingBalance: -10 },
        'El saldo pendiente es negativo.',
      ],
      [
        'con saldo mayor que el préstamo',
        { outstandingBalance: 1_200_000 },
        'El saldo pendiente supera el valor del préstamo.',
      ],
      [
        'con más cuotas pendientes que configuradas',
        { pendingInstallments: 6 },
        'Las cuotas pendientes superan el número de cuotas configuradas.',
      ],
      [
        'con saldo y sin cuotas pendientes',
        { pendingInstallments: 0 },
        'Tiene saldo pendiente pero no tiene cuotas pendientes.',
      ],
      [
        'con periodicidad desconocida',
        { periodicity: 'SEMANAL' },
        'La periodicidad del préstamo no es válida.',
      ],
    ])('detecta un préstamo %s', (_case, overrides, cause) => {
      expect(findLoanInconsistencies(loan(overrides))).toEqual([cause]);
    });
  });
});
