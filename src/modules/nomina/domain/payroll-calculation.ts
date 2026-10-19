import type { WorkHourType } from '../application/services/payroll-hours.service';
import {
  calculateDisabilityDaysPay,
  findDisabilityPayRule,
} from './disability-pay-rules';
import { PayrollInconsistencyError } from './errors/payroll-inconsistency.error';
import {
  PAYROLL_CONCEPT,
  WORK_HOUR_CONCEPT,
  WORK_HOUR_LABEL,
  WORK_HOUR_ORDER,
  loanInstallmentConcept,
} from './payroll-concepts';
import {
  PAYROLL_DAYS_PER_MONTH,
  addCalendarDays,
  countCalendarDays,
  countPayrollDays,
  formatCalendarDate,
} from './payroll-days';

/** Concepto de la liquidación con su valor (mismo contrato que `PayrollLineResponseDto`). */
export interface PayrollConcept {
  conceptName: string;
  amount: number;
}

export interface WorkedHoursSummary {
  type: WorkHourType;
  label: string;
  hours: number;
}

/** Tramo de tiempo trabajado ya clasificado por `PayrollHoursService`. */
export interface WorkedSegment {
  type: WorkHourType;
  hours: number;
  isExtra: boolean;
  multiplier: number;
}

export interface DisabilityLeaveInput {
  type: string;
  startDate: string;
  endDate: string;
}

export interface EarningsInput {
  periodStart: string;
  periodEnd: string;
  monthlySalary: number;
  dailyWorkHours: number;
  minimumWage: number;
  transportAllowance: { isEligible: boolean; monthlyAmount: number };
  workedSegments: WorkedSegment[];
  disabilityLeaves: DisabilityLeaveInput[];
}

export interface PayrollEarnings {
  periodDays: number;
  disabilityDays: number;
  workedDays: number;
  hourValue: number;
  earnings: PayrollConcept[];
  workedHours: WorkedHoursSummary[];
  /** Devengado que constituye salario (todo menos el auxilio de transporte): base de salud y pensión. */
  contributionBase: number;
  totalEarnings: number;
}

export interface LoanInstallmentInput {
  loanId: number;
  installmentAmount: number;
  outstandingBalance: number;
  pendingInstallments: number;
}

export interface PayrollTotals {
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
}

export const INVALID_SALARY_CAUSE = 'El salario base registrado no es válido.';

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 2,
});

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumAmounts(concepts: PayrollConcept[]): number {
  return concepts.reduce((total, concept) => total + concept.amount, 0);
}

/** Valor de la hora ordinaria: salario mensual / 30 / horas diarias de la jornada. */
export function calculateHourValue(
  monthlySalary: number,
  dailyWorkHours: number,
): number {
  return monthlySalary / PAYROLL_DAYS_PER_MONTH / dailyWorkHours;
}

/**
 * Devengados del período: salario base por los días no cubiertos por
 * incapacidades, el pago de las incapacidades, las horas extra, los recargos
 * y el auxilio de transporte proporcional a los días laborados.
 */
export function calculateEarnings(input: EarningsInput): PayrollEarnings {
  if (!Number.isFinite(input.monthlySalary) || input.monthlySalary <= 0) {
    throw new PayrollInconsistencyError([INVALID_SALARY_CAUSE]);
  }

  const dailySalary = input.monthlySalary / PAYROLL_DAYS_PER_MONTH;
  const hourValue = calculateHourValue(
    input.monthlySalary,
    input.dailyWorkHours,
  );
  const periodDays = countPayrollDays(input.periodStart, input.periodEnd);

  const disability = calculateDisabilityEarnings(
    input.disabilityLeaves,
    input.periodStart,
    input.periodEnd,
    dailySalary,
    input.minimumWage / PAYROLL_DAYS_PER_MONTH,
  );
  const disabilityDays = Math.min(disability.days, periodDays);
  const workedDays = periodDays - disabilityDays;
  const hours = calculateWorkedHoursEarnings(input.workedSegments, hourValue);

  const salaryConcepts: PayrollConcept[] = [
    {
      conceptName: PAYROLL_CONCEPT.SALARY,
      amount: roundCurrency(dailySalary * workedDays),
    },
    ...disability.concepts,
    ...hours.concepts,
  ];

  // El auxilio de transporte no se paga por los días de incapacidad.
  const transportAllowance = input.transportAllowance.isEligible
    ? roundCurrency(
        (input.transportAllowance.monthlyAmount * workedDays) /
          PAYROLL_DAYS_PER_MONTH,
      )
    : 0;
  const earnings =
    transportAllowance > 0
      ? [
          ...salaryConcepts,
          {
            conceptName: PAYROLL_CONCEPT.TRANSPORT_ALLOWANCE,
            amount: transportAllowance,
          },
        ]
      : salaryConcepts;

  return {
    periodDays,
    disabilityDays,
    workedDays,
    hourValue,
    earnings,
    workedHours: hours.summary,
    contributionBase: roundCurrency(sumAmounts(salaryConcepts)),
    totalEarnings: roundCurrency(sumAmounts(earnings)),
  };
}

function calculateDisabilityEarnings(
  leaves: DisabilityLeaveInput[],
  periodStart: string,
  periodEnd: string,
  dailySalary: number,
  minimumDailyWage: number,
): { days: number; concepts: PayrollConcept[] } {
  const causes: string[] = [];
  const amountByConcept = new Map<string, number>();
  let days = 0;

  for (const leave of leaves) {
    const rule = findDisabilityPayRule(leave.type);

    if (!rule) {
      causes.push(
        `La incapacidad del ${formatCalendarDate(leave.startDate)} al ${formatCalendarDate(leave.endDate)} tiene un tipo no reconocido ("${leave.type}").`,
      );
      continue;
    }

    const from = leave.startDate > periodStart ? leave.startDate : periodStart;
    const to = leave.endDate < periodEnd ? leave.endDate : periodEnd;
    const daysInPeriod = countPayrollDays(from, to);

    if (daysInPeriod === 0) {
      continue;
    }

    // Los días se numeran desde el inicio de la incapacidad, aunque haya
    // empezado en un período anterior, para aplicar la tarifa de cada día.
    const previousDays =
      leave.startDate < periodStart
        ? countCalendarDays(leave.startDate, addCalendarDays(periodStart, -1))
        : 0;
    const amount = calculateDisabilityDaysPay(
      rule,
      previousDays + 1,
      previousDays + daysInPeriod,
      dailySalary,
      minimumDailyWage,
    );

    amountByConcept.set(
      rule.concept,
      (amountByConcept.get(rule.concept) ?? 0) + amount,
    );
    days += daysInPeriod;
  }

  if (causes.length > 0) {
    throw new PayrollInconsistencyError(causes);
  }

  return {
    days,
    concepts: [...amountByConcept].map(([conceptName, amount]) => ({
      conceptName,
      amount: roundCurrency(amount),
    })),
  };
}

function isExtraHourType(type: WorkHourType): boolean {
  return type.startsWith('EXTRA');
}

// En el detalle las horas extra van antes que los recargos.
const WORK_HOUR_CONCEPT_ORDER: WorkHourType[] = [
  ...WORK_HOUR_ORDER.filter(isExtraHourType),
  ...WORK_HOUR_ORDER.filter((type) => !isExtraHourType(type)),
];

function calculateWorkedHoursEarnings(
  segments: WorkedSegment[],
  hourValue: number,
): { concepts: PayrollConcept[]; summary: WorkedHoursSummary[] } {
  const hoursByType = new Map<WorkHourType, number>();
  const amountByType = new Map<WorkHourType, number>();

  for (const segment of segments) {
    // La hora extra se paga completa; de la hora ordinaria solo se paga el
    // recargo, porque el salario base ya la remunera.
    const factor = segment.isExtra
      ? segment.multiplier
      : Math.max(0, segment.multiplier - 1);

    hoursByType.set(
      segment.type,
      (hoursByType.get(segment.type) ?? 0) + segment.hours,
    );
    amountByType.set(
      segment.type,
      (amountByType.get(segment.type) ?? 0) +
        segment.hours * hourValue * factor,
    );
  }

  const concepts = WORK_HOUR_CONCEPT_ORDER.map((type) => ({
    conceptName: WORK_HOUR_CONCEPT[type],
    amount: roundCurrency(amountByType.get(type) ?? 0),
  })).filter((concept) => concept.amount > 0);

  const summary = WORK_HOUR_ORDER.filter(
    (type) => (hoursByType.get(type) ?? 0) > 0,
  ).map((type) => ({
    type,
    label: WORK_HOUR_LABEL[type],
    hours: Number((hoursByType.get(type) ?? 0).toFixed(2)),
  }));

  return { concepts, summary };
}

/**
 * Una cuota por cada préstamo con cuotas y saldo pendientes; la última cuota
 * nunca descuenta más que el saldo que queda.
 */
export function calculateLoanDeductions(
  loans: LoanInstallmentInput[],
): PayrollConcept[] {
  return loans
    .filter(
      (loan) => loan.pendingInstallments > 0 && loan.outstandingBalance > 0,
    )
    .sort((a, b) => a.loanId - b.loanId)
    .map((loan) => ({
      conceptName: loanInstallmentConcept(loan.loanId),
      amount: roundCurrency(
        Math.min(loan.installmentAmount, loan.outstandingBalance),
      ),
    }));
}

/** Neto a pagar = total devengado - total deducciones. */
export function calculateTotals(
  earnings: PayrollConcept[],
  deductions: PayrollConcept[],
): PayrollTotals {
  const totalEarnings = roundCurrency(sumAmounts(earnings));
  const totalDeductions = roundCurrency(sumAmounts(deductions));
  const netPay = roundCurrency(totalEarnings - totalDeductions);

  if (netPay < 0) {
    throw new PayrollInconsistencyError([
      `Las deducciones (${currencyFormatter.format(totalDeductions)}) superan el total devengado (${currencyFormatter.format(totalEarnings)}).`,
    ]);
  }

  return { totalEarnings, totalDeductions, netPay };
}
